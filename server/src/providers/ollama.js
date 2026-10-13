import { config } from '../config.js';

// Stored with every analysis; bump it whenever the prompt or schema changes so
// old and new results stay distinguishable.
export const PROMPT_VERSION = 'v1';

// The prompt plus the longest stored headline + summary is under 900 tokens.
// Ollama's 4096 default reserves VRAM that an 8 GB card needs for the model
// itself, and that reservation is multiplied by the number of parallel slots.
const CONTEXT_TOKENS = 1024;

export const SENTIMENTS =['positive', 'neutral', 'negative'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    sentiment: { type: 'string', enum: SENTIMENTS },
    score: { type: 'number' },
    confidence: { type: 'number' },
  },
  required: ['sentiment', 'score', 'confidence'],
};

export const SYSTEM_PROMPT = `You classify the sentiment of financial news toward the company it is about.
Return JSON with:
- sentiment: "positive", "neutral" or "negative" for the company's business outlook
- score: a number from -1 (very negative) to 1 (very positive); 0 is neutral
- confidence: a number from 0 to 1 for how clearly the text supports your answer
Judge only what the text says. Do not predict the stock price.`;

// Returns { sentiment, score, confidence, raw } or throws if the model's
// answer is not usable.
export async function analyzeSentiment({ title, summary }) {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      format: RESPONSE_SCHEMA,
      options: { temperature: 0, num_ctx: CONTEXT_TOKENS },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Headline: ${title}\nSummary: ${summary || '(none)'}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

  const raw = await res.json();
  const parsed = JSON.parse(raw.message.content);
  const { sentiment, score, confidence } = parsed;
  if (
    !SENTIMENTS.includes(sentiment) ||
    !(score >= -1 && score <= 1) ||
    !(confidence >= 0 && confidence <= 1)
  ) {
    throw new Error(`Ollama returned an out-of-range analysis: ${raw.message.content}`);
  }
  return { sentiment, score, confidence, raw };
}
