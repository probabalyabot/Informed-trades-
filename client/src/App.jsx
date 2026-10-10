import { Link, NavLink, Route, Routes } from 'react-router-dom';
import SearchBox from './components/SearchBox.jsx';
import Compare from './pages/Compare.jsx';
import Dashboard from './pages/Dashboard.jsx';
import StockPage from './pages/StockPage.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Informed Trades
        </Link>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/compare">Compare</NavLink>
        </nav>
        <SearchBox />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stocks/:symbol" element={<StockPage />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="*" element={<p className="message">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
