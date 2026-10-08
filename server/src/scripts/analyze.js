// Runs sentiment analysis on stored articles with the local Ollama model.
// Usage: npm run analyze -- [--limit=500] [--concurrency=1]
// Only articles with no analysis for the current model + prompt version are
// processed, so the job can be stopped and restarted at any time.
import { config } from '../config.js';
import { pool } from '../db.js';
import { PROMPT_VERSION, analyzeSentiment } from '../providers/ollama.js';

const args = process.argv.slice(2);
const option = (name, fallback) =>
  Number(args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]) || fallback;
const limit = option('limit', 500);
// Requests sent to Ollama at once. Extra requests only help when the Ollama
// server runs with OLLAMA_NUM_PARALLEL > 1 AND the model still fits in VRAM
// with that many context slots. On an 8 GB card with an 8B model it does not
// (measured: no gain at 2 or 4), so the default is 1.
const concurrency = option('concurrency', 1);

// There are far more articles than can be analysed in one sitting, so the
// order matters: articles attached to a detected event come first, then the
// newest article of every stock-day, then the second newest of every
// stock-day, and so on. Every stock gets even coverage however large its
// news volume is.
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
      WHERE x.article_id = a.article_id AND x.model = $1 AND x.prompt_version = $2
  )
  GROUP BY a.article_id
  ORDER BY EXISTS (SELECT 1 FROM event_article ea WHERE ea.article_id = a.article_id) DESC,
           min(ranked.rank_in_day),
           a.published_at DESC
  LIMIT $3`;

const INSERT = `
  INSERT INTO article_analysis
      (article_id, sentiment, sentiment_score, confidence, model, prompt_version, raw_response)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (article_id, model, prompt_version) DO NOTHING`;

async function main() {
  const model = config.ollamaModel;
  const { rows: pending } = await pool.query(PENDING, [model, PROMPT_VERSION, limit]);
  console.log(`${pending.length} articles to analyse with ${model} (prompt ${PROMPT_VERSION})`);

  const started = Date.now();
  let done = 0;
  let failed = 0;
  let next = 0;
  // Each worker takes the next unclaimed article until none are left.
  const worker = async () => {
    while (next < pending.length) {
      await analyseOne(pending[next++]);
    }
  };
  const analyseOne = async (article) => {
    try {
      const r = await analyzeSentiment(article);
      await pool.query(INSERT, [
        article.article_id, r.sentiment, r.score, r.confidence, model, PROMPT_VERSION, r.raw,
      ]);
      done++;
    } catch (err) {
      // One unusable model answer should not stop the batch; the article
      // stays pending and is retried on the next run.
      failed++;
      console.warn(`  article ${article.article_id} failed: ${err.message}`);
      // Ollama being unreachable fails every article the same way; stop early.
      if (failed >= 5 && done === 0) {
        next = pending.length;
        throw new Error('Stopping: the first 5 articles all failed.');
      }
    }
    if ((done + failed) % 100 === 0) {
      const perSecond = (done + failed) / ((Date.now() - started) / 1000);
      console.log(`  ${done + failed}/${pending.length}  (${perSecond.toFixed(1)} articles per second)`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const seconds = (Date.now() - started) / 1000;
  console.log(`Analysed ${done}, failed ${failed} in ${seconds.toFixed(0)}s.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
