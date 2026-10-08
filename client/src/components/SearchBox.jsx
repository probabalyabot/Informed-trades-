import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api.js';

export default function SearchBox() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const q = text.trim();
  const { data } = useApi(q ? `/stocks?q=${encodeURIComponent(q)}` : null);
  const results = q && data ? data : [];

  const go = (symbol) => {
    setText('');
    setOpen(false);
    navigate(`/stocks/${symbol}`);
  };

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (results.length) go(results[0].symbol);
      }}
    >
      <input
        type="search"
        placeholder="Search symbol or company…"
        aria-label="Search stocks"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on a result lands before the list disappears.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && q && (
        <ul className="search-results">
          {results.length === 0 && <li className="muted">No matching stocks</li>}
          {results.map((s) => (
            <li key={s.symbol}>
              <button type="button" onClick={() => go(s.symbol)}>
                <strong>{s.symbol}</strong> <span className="muted">{s.company_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
