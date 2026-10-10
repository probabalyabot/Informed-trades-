import {
  averageTone, capitalise, coverageText, formatScore, gaugeFill, gaugePosition,
} from '../lib/sentiment.js';

const TREND = {
  rising: { arrow: '↗', text: 'rising' },
  falling: { arrow: '↘', text: 'falling' },
  steady: { arrow: '→', text: 'steady' },
};

// The -1..+1 track with a bar growing from the centre and a marker at the score.
function Track({ score, dimmed }) {
  const fill = gaugeFill(score);
  return (
    <div className={`gauge-track ${averageTone(score)} ${dimmed ? 'dimmed' : ''}`} aria-hidden="true">
      <div className="gauge-fill" style={{ left: `${fill.left}%`, width: `${fill.width}%` }} />
      <div className="gauge-marker" style={{ left: `${gaugePosition(score)}%` }} />
    </div>
  );
}

// Average news sentiment for a stock over a window of trading days.
//   score    average of analysed articles, or null when none were analysed
//   label    'positive' | 'mixed' | 'negative', or null when the average
//            rests on too few articles to summarise
//   trend    'rising' | 'steady' | 'falling' versus the previous window, or null
// The compact form is for table cells; the full form adds the scale ends,
// the trend and the coverage line.
export default function SentimentGauge({ score, label, trend, analysed, total, compact = false }) {
  const coverage = coverageText(analysed, total);

  if (score == null) {
    return compact ? (
      <span className="muted" title={coverage}>
        not analysed
      </span>
    ) : (
      <div className="gauge">
        <p className="gauge-value muted">Not analysed yet</p>
        <p className="gauge-coverage">{capitalise(coverage)}.</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="gauge compact" title={`${label ? capitalise(label) : 'Too few analysed articles'}, ${coverage}`}>
        <Track score={score} dimmed={!label} />
        <span className="gauge-value">
          {label ? `${capitalise(label)} ${formatScore(score)}` : <span className="muted">too few analysed</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="gauge">
      <p className="gauge-value">
        {label ? (
          <>
            {capitalise(label)} <span className="gauge-score">{formatScore(score)}</span>
          </>
        ) : (
          <span className="muted">Too few analysed articles to summarise</span>
        )}
      </p>
      <Track score={score} dimmed={!label} />
      <div className="gauge-ends" aria-hidden="true">
        <span>Negative −1</span>
        <span>0</span>
        <span>+1 Positive</span>
      </div>
      {trend && (
        <p className="gauge-trend">
          {TREND[trend].arrow} {capitalise(TREND[trend].text)} against the 5 trading days before
        </p>
      )}
      <p className="gauge-coverage">
        {label ? capitalise(coverage) : `Average so far ${formatScore(score)}, ${coverage}`}.
      </p>
    </div>
  );
}
