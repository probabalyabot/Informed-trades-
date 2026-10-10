import { RANGES } from '../lib/ranges.js';

export default function RangeButtons({ value, onChange }) {
  return (
    <div className="range" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r.label}
          type="button"
          className={r === value ? 'active' : ''}
          aria-pressed={r === value}
          onClick={() => onChange(r)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
