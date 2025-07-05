import React, { useEffect, useState, useMemo } from 'react';
import './InvoiceList.css';

export default function InvoiceList() {
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all'); // 'all', 'company', 'individual'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12); // Show 12 invoices per page
  const baseUrl = import.meta.env.VITE_API_URL || '';

// Helper function to properly encode path segments
const encodePath = (path) => {
  return encodeURIComponent(path);
};

  // Parse invoice filename to extract metadata
  const parseInvoiceData = (invoiceKey) => {
    const parts = invoiceKey.split('/');
    const actualFilename = parts[parts.length - 1];
    
    // Extract invoice type, company name, and invoice number
    const match = actualFilename.match(/(Company|Individual)-Invoice-(.+)-(\d+)\.pdf$/);
    
    if (match) {
      const [, type, rawName, invoiceNumber] = match;
      const companyName = rawName.replace(/_/g, ' ');
      
      // Extract date from path (if available)
      let date = 'Unknown';
      if (parts.length >= 3 && parts[1] && parts[2]) {
        const year = parts[1];
        const month = parts[2];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        date = `${monthNames[parseInt(month) - 1]} ${year}`;
      }
      
      return {
        type: type.toLowerCase(),
        companyName,
        invoiceNumber,
        date,
        key: invoiceKey
      };
    }
    
    // Fallback for files that don't match the pattern
    return {
      type: 'unknown',
      companyName: actualFilename.replace('.pdf', ''),
      invoiceNumber: 'N/A',
      date: 'Unknown',
      key: invoiceKey
    };
  };

  // Filter and search invoices
  const filteredInvoices = useMemo(() => {
    let filtered = allInvoices;

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(invoice => invoice.type === selectedType);
    } else {
      // For "all" view, only show actual invoice files (exclude unknown files like CSV reports)
      filtered = filtered.filter(invoice => invoice.type === 'company' || invoice.type === 'individual');
    }

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(invoice => 
        invoice.companyName.toLowerCase().includes(searchLower) ||
        invoice.invoiceNumber.toLowerCase().includes(searchLower) ||
        invoice.date.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [allInvoices, selectedType, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentInvoices = filteredInvoices.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType, searchTerm]);

  useEffect(() => {
    fetch(`${baseUrl}/invoices`)
      .then(res => res.json())
      .then(data => {
        const parsedInvoices = data.map(inv => parseInvoiceData(inv.key));
        // Sort by company name for better organization
        parsedInvoices.sort((a, b) => a.companyName.localeCompare(b.companyName));
        setAllInvoices(parsedInvoices);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch invoices', err);
        setLoading(false);
      });
  }, [baseUrl]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getTypeStats = () => {
    const companyCount = allInvoices.filter(inv => inv.type === 'company').length;
    const individualCount = allInvoices.filter(inv => inv.type === 'individual').length;
    const unknownCount = allInvoices.filter(inv => inv.type === 'unknown').length;
    
    // Calculate total as sum of only actual invoice types (company + individual)
    // Exclude unknown files which are likely CSV reports or other non-invoice files
    const total = companyCount + individualCount;
    
    return { companyCount, individualCount, unknownCount, total };
  };

  const stats = getTypeStats();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading invoices...</p>
      </div>
    );
  }

  return (
    <div className="invoice-list-container">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Invoice Management</h1>
          <p className="page-subtitle">View and download your HubSpot invoices</p>
          
          {/* Stats */}
          <div className="stats-row">
            <div className="stat-item">
              <span className="stat-number">{stats.total}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{stats.companyCount}</span>
              <span className="stat-label">Companies</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{stats.individualCount}</span>
              <span className="stat-label">Individuals</span>
            </div>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="controls">
          <div className="search-container">
            <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <input
              type="text"
              placeholder="Search by company name, invoice number, or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="clear-search"
                aria-label="Clear search"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            )}
          </div>

          <div className="filter-tabs">
            <button 
              className={`filter-tab ${selectedType === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedType('all')}
            >
              All ({stats.total})
            </button>
            <button 
              className={`filter-tab ${selectedType === 'company' ? 'active' : ''}`}
              onClick={() => setSelectedType('company')}
            >
              Companies ({stats.companyCount})
            </button>
            <button 
              className={`filter-tab ${selectedType === 'individual' ? 'active' : ''}`}
              onClick={() => setSelectedType('individual')}
            >
              Individuals ({stats.individualCount})
            </button>
          </div>
        </div>

        {/* Results Info */}
        <div className="results-info">
          <p>
            Showing {currentInvoices.length} of {filteredInvoices.length} invoices
            {searchTerm && ` matching "${searchTerm}"`}
            {selectedType !== 'all' && ` in ${selectedType} invoices`}
          </p>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <h3>No invoices found</h3>
            <p>
              {searchTerm || selectedType !== 'all' 
                ? 'Try adjusting your search or filter criteria.'
                : 'There are currently no invoices available.'
              }
            </p>
            {(searchTerm || selectedType !== 'all') && (
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setSelectedType('all');
                }}
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="invoice-grid">
              {currentInvoices.map((invoice, index) => (
                <div key={index} className="invoice-card">
                  <span className={`invoice-type ${invoice.type}`}>
                    {invoice.type === 'company' ? 'Company' : invoice.type === 'individual' ? 'Individual' : 'Document'}
                  </span>
                  <div className="company-name">{invoice.companyName}</div>
                  <div className="invoice-details">
                    <span className="invoice-number">#{invoice.invoiceNumber}</span>
                    <span className="invoice-date">{invoice.date}</span>
                  </div>
                  <div className="actions">
                  <a 
                    href={`${baseUrl}/invoices/${encodePath(invoice.key)}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn btn-primary"
                  >
                    <svg className="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                    View
                  </a>
                  <a 
                    href={`${baseUrl}/invoices/${encodePath(invoice.key)}/download`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn btn-secondary"
                  >
                    <svg className="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Download
                  </a>
                </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  className="pagination-btn"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <svg className="pagination-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                  </svg>
                  Previous
                </button>

                <div className="pagination-numbers">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    // Show first page, last page, current page, and pages around current
                    const showPage = page === 1 || 
                                   page === totalPages || 
                                   (page >= currentPage - 2 && page <= currentPage + 2);
                    
                    if (!showPage) {
                      // Show ellipsis for gaps
                      if (page === currentPage - 3 || page === currentPage + 3) {
                        return <span key={page} className="pagination-ellipsis">...</span>;
                      }
                      return null;
                    }

                    return (
                      <button
                        key={page}
                        className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>

                <button 
                  className="pagination-btn"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <svg className="pagination-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}