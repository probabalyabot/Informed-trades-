import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('../../', import.meta.url));

const envFile = rootDir + '.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  finnhubApiKey: process.env.FINNHUB_API_KEY,
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1:8b',
  port: Number(process.env.PORT) || 3001,
  demoUserEmail: process.env.DEMO_USER_EMAIL || 'demo@informedtrades.local',
};

// Fails early with a clear message instead of a confusing error deep in a script.
export function requireConfig(key) {
  if (!config[key]) {
    throw new Error(`Missing configuration "${key}". Copy .env.example to .env and fill it in.`);
  }
  return config[key];
}
