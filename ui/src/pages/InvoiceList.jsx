import React, { useEffect, useState } from 'react';

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const baseUrl = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    fetch(`${baseUrl}/invoices`)
      .then(res => res.json())
      .then(setInvoices)
      .catch(err => console.error('Failed to fetch invoices', err));
  }, [baseUrl]);

  return (
    <div>
      <h1>Invoice List</h1>
      <ul>
        {invoices.map(inv => (
          <li key={inv.id}>
            {inv.name}{' '}
            <a href={`${baseUrl}/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer">
              View
            </a>{' '}
            <a
              href={`${baseUrl}/invoices/${inv.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
