import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import InvoiceList from './pages/InvoiceList';
import Generate from './pages/Generate';
import './App.css'; // We'll create this file

export default function App() {
  return (
    <Router>
      <header className="header">
        <div className="header-content">
          <img 
            src="/logo.png" 
            alt="CLA Logo" 
            className="logo" 
          />
          <nav className="nav">
            <Link to="/" className="nav-link">Invoices</Link>
            <Link to="/generate" className="nav-link">Generate</Link>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<InvoiceList />} />
          <Route path="/generate" element={<Generate />} />
        </Routes>
      </main>
    </Router>
  );
}