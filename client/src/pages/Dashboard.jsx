import { Link } from 'react-router-dom';
import { useApi } from '../api.js';
import { formatPercent, formatPrice, signClass } from '../format.js';

export default function Dashboard() {
  const { data, error } = useApi('/stocks');

  if (error) return <p className="message error">{error.message}</p>;
  if (!data) return <p className="message">Loading…</p>;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Stocks</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Sector</th>
            <th className="num">Last close</th>
            <th className="num">Change</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.symbol}>
              <td>
                <Link to={`/stocks/${s.symbol}`}>{s.symbol}</Link>
              </td>
              <td>{s.company_name}</td>
              <td className="muted">{s.sector}</td>
              <td className="num">{formatPrice(s.last_close)}</td>
              <td className={`num ${signClass(s.change_pct)}`}>{formatPercent(s.change_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
