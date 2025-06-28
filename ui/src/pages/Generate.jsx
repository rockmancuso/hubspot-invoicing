import React, { useState } from 'react';

export default function Generate() {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const [form, setForm] = useState({
    runType: 'full',
    limit: '',
    keepDraft: false,
    ids: ''
  });

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    const payload = {
      run_type: form.runType,
      limit: form.limit ? Number(form.limit) : undefined,
      keep_draft: form.keepDraft,
      ids: form.ids ? form.ids.split(',').map(id => id.trim()) : undefined
    };
    fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(() => alert('Generation started'))
      .catch(() => alert('Failed to generate'));
  };

  return (
    <div>
      <h1>Generate Invoices</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Run Type:
            <select name="runType" value={form.runType} onChange={handleChange}>
              <option value="full">Full</option>
              <option value="pdf">PDF Only</option>
            </select>
          </label>
        </div>
        <div>
          <label>
            Limit:
            <input type="number" name="limit" value={form.limit} onChange={handleChange} />
          </label>
        </div>
        <div>
          <label>
            Keep Draft:
            <input type="checkbox" name="keepDraft" checked={form.keepDraft} onChange={handleChange} />
          </label>
        </div>
        <div>
          <label>
            IDs (comma separated):
            <input type="text" name="ids" value={form.ids} onChange={handleChange} />
          </label>
        </div>
        <button type="submit">Run</button>
      </form>
    </div>
  );
}
