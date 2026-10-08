-- An article can have several analyses (different model or prompt version).
-- This view exposes the most recent one per article; older rows are kept.
CREATE VIEW v_latest_analysis AS
SELECT DISTINCT ON (article_id)
       article_id, analysis_id, sentiment, sentiment_score, confidence,
       model, prompt_version, analyzed_at
FROM article_analysis
ORDER BY article_id, analyzed_at DESC, analysis_id DESC;
