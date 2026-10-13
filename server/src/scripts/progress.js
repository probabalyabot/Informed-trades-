// Shows how far sentiment analysis has got. Usage: npm run progress
import { pool } from '../db.js';

const { rows } = await pool.query(`
  SELECT (SELECT count(*)::int FROM news_article) AS total,
         (SELECT count(DISTINCT article_id)::int FROM article_analysis) AS analysed,
         (SELECT count(*)::int FROM article_analysis
          WHERE analyzed_at > now() - INTERVAL '10 minutes') AS last_10_min,
         (SELECT max(analyzed_at) FROM article_analysis) AS latest`);
await pool.end();

const { total, analysed, last_10_min: recent, latest } = rows[0];
const left = total - analysed;
console.log(`Analysed ${analysed} of ${total} articles (${((analysed / total) * 100).toFixed(1)}%), ${left} left.`);
console.log(`Last result saved: ${latest ? latest.toLocaleString() : 'never'}`);
if (recent > 0) {
  const hours = left / (recent * 6);
  console.log(`Running: ${recent} in the last 10 minutes, about ${hours.toFixed(1)} hours to go at this rate.`);
} else {
  console.log('Not running: nothing was analysed in the last 10 minutes.');
}
