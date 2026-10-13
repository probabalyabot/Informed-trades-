const LEVELS = { low: 1, medium: 2, high: 3 };

// How unusual an event was (low / medium / high) as a coloured tag. The bars
// repeat the level so it does not rest on colour alone.
export default function SeverityTag({ severity, label = severity }) {
  return (
    <span className={`badge severity severity-${severity}`}>
      <span className="level" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= LEVELS[severity] ? 'on' : undefined} />
        ))}
      </span>
      {label}
    </span>
  );
}
