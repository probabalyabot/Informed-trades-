// TEMPORARY: one-time sentiment backfill of the historical backlog using a
// free Gemini model. Delete this file (and GEMINI_API_KEY from .env) once the
// backlog is cleared; day-to-day analysis stays on Ollama (analyze.js).
//
// Usage: node src/scripts/backfillGemini.js [--limit=N] [--batch=40] [--rpm=10] [--model=gemini-3.5-flash-lite]
//
// The free tier is limited by requests per day, so each request carries a
// whole batch of articles. Only articles that no model has analysed yet are
// sent. Safe to stop and re-run; rows are tagged with the Gemini model name.
import { setTimeout as sleep } from 'node:timers/promises';
import '../config.js';
import { pool } from '../db.js';
import { PROMPT_VERSION, SENTIMENTS, SYSTEM_PROMPT } from '../providers/ollama.js';

const args = process.argv.slice(2);
const text = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const limit = Number(text('limit', 100000));
const batchSize = Number(text('batch', 40));
const rpm = Number(text('rpm', 10));
const model = text('model', 'gemini-3.5-flash-lite');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to .env (key from https://aistudio.google.com/apikey).');
  process.exit(1);
}

const SUMMARY_CHARS = 600;
const MAX_RETRIES = 5;

// Same priority order as analyze.js: event-day articles first, then even
// coverage per stock-day. "Pending" here means no analysis from ANY model.
const PENDING = `
  SELECT a.article_id, a.title, a.summary
  FROM (
      SELECT sa.article_id,
             row_number() OVER (
                 PARTITION BY sa.stock_id, (n.published_at AT TIME ZONE 'America/New_York')::date
                 ORDER BY n.published_at DESC
             ) AS rank_in_day
      FROM stock_article sa
      JOIN news_article n USING (article_id)
  ) ranked
  JOIN news_article a USING (article_id)
  WHERE NOT EXISTS (
      SELECT 1 FROM article_analysis x
      WHERE x.article_id = a.article_id AND x.prompt_version = $1
  )
  GROUP BY a.article_id
  ORDER BY EXISTS (SELECT 1 FROM event_article ea WHERE ea.article_id = a.article_id) DESC,
           min(ranked.rank_in_day),
           a.published_at DESC
  LIMIT $2`;

// One statement, so a batch is stored completely or not at all.
const INSERT = `
  INSERT INTO article_analysis
      (article_id, sentiment, sentiment_score, confidence, model, prompt_version, raw_response)
  SELECT t.article_id, t.sentiment, t.score, t.confidence, $5, $6, t.raw
  FROM unnest($1::bigint[], $2::text[], $3::numeric[], $4::numeric[], $7::jsonb[])
       AS t (article_id, sentiment, score, confidence, raw)
  ON CONFLICT (article_id, model, prompt_version) DO NOTHING`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'INTEGER' },
      sentiment: { type: 'STRING', enum: SENTIMENTS },
      score: { type: 'NUMBER' },
      confidence: { type: 'NUMBER' },
    },
    required: ['id', 'sentiment', 'score', 'confidence'],
  },
};

class DailyQuotaError extends Error {}

// Keeps only usable answers: an id we asked about, seen once, with a valid
// label and in-range numbers. Anything else is dropped and stays pending.
export function parseBatch(responseText, requestedIds) {
  const wanted = new Set(requestedIds);
  const seen = new Set();
  return JSON.parse(responseText).filter((item) => {
    const ok =
      wanted.has(item.id) && !seen.has(item.id) &&
      SENTIMENTS.includes(item.sentiment) &&
      item.score >= -1 && item.score <= 1 &&
      item.confidence >= 0 && item.confidence <= 1;
    if (ok) seen.add(item.id);
    return ok;
  });
}

async function callGemini(articles) {
  const listing = articles
    .map((a) => `[${a.article_id}] Headline: ${a.title}\nSummary: ${(a.summary || '(none)').slice(0, SUMMARY_CHARS)}`)
    .join('\n\n');
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [{
        text: `Classify each article below separately. Return a JSON array with one object per article: ` +
          `its id (the number in square brackets) with sentiment, score and confidence.\n\n${listing}`,
      }],
    }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  };

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) },
    );
    if (res.ok) return res.json();

    const errorText = await res.text();
    if (res.status === 429) {
      if (/PerDay/i.test(errorText)) throw new DailyQuotaError(errorText);
      if (attempt <= MAX_RETRIES) {
        const wait = Number(errorText.match(/"retryDelay":\s*"(\d+)/)?.[1]) || 60;
        console.log(`  rate limited, waiting ${wait + 2}s`);
        await sleep((wait + 2) * 1000);
        continue;
      }
    } else if (res.status >= 500 && attempt <= MAX_RETRIES) {
      await sleep(15000);
      continue;
    }
    throw new Error(`Gemini ${res.status}: ${errorText.slice(0, 500)}`);
  }
}

async function main() {
  const { rows: pending } = await pool.query(PENDING, [PROMPT_VERSION, limit]);
  console.log(`${pending.length} unanalysed articles, ${batchSize} per request, model ${model}`);

  let saved = 0;
  let skipped = 0;
  for (let i = 0; i < pending.length; i += batchSize) {
    const started = Date.now();
    const batch = pending.slice(i, i + batchSize);
    let response;
    try {
      response = await callGemini(batch);
    } catch (err) {
      if (err instanceof DailyQuotaError) {
        console.log(`Daily free quota reached. Saved ${saved} this run; re-run tomorrow to continue.`);
        return;
      }
      throw err;
    }

    let items = [];
    try {
      items = parseBatch(response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]', batch.map((a) => a.article_id));
    } catch {
      console.warn('  unreadable response for one batch; its articles stay pending');
    }
    if (items.length) {
      const meta = { usage: response.usageMetadata, modelVersion: response.modelVersion, batch_size: batch.length };
      await pool.query(INSERT, [
        items.map((x) => x.id), items.map((x) => x.sentiment), items.map((x) => x.score),
        items.map((x) => x.confidence), model, PROMPT_VERSION,
        items.map((x) => JSON.stringify({ item: x, ...meta })),
      ]);
    }
    saved += items.length;
    skipped += batch.length - items.length;
    console.log(`  ${Math.min(i + batchSize, pending.length)}/${pending.length}  saved ${saved}, skipped ${skipped}`);

    // Stay under the per-minute request limit.
    await sleep(Math.max(0, 60000 / rpm - (Date.now() - started)));
  }
  console.log(`Done. Saved ${saved}, skipped ${skipped} (skipped articles stay pending).`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
