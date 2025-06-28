import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import InvoiceList from './pages/InvoiceList';
import Generate from './pages/Generate';

export default function App() {
  return (
    <Router>
      <nav>
        <Link to="/">Invoices</Link> |{' '}<Link to="/generate">Generate</Link>
      </nav>
      <Routes>
        <Route path="/" element={<InvoiceList />} />
        <Route path="/generate" element={<Generate />} />
      </Routes>
    </Router>
  );
}
