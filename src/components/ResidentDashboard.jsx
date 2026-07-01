import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function ResidentDashboard({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [flatDetails, setFlatDetails] = useState(session.flatDetails || {});
  const [payments, setPayments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newComplaint, setNewComplaint] = useState({ title: '', description: '' });
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Current month maintenance status
  const [currentMonthStatus, setCurrentMonthStatus] = useState({
    month: '',
    status: 'Unpaid',
    due: 2000,
    paid: 0,
    record: null
  });

  const flatNo = session.flatNo;

  useEffect(() => {
    fetchResidentData();
  }, []);

  const fetchResidentData = async () => {
    setLoading(true);
    try {
      // 1. Fetch flat details (to get freshest data)
      const { data: flatData, error: flatError } = await supabase
        .from('flats')
        .select('*')
        .eq('flat_no', flatNo)
        .maybeSingle();

      if (flatError) throw flatError;
      if (flatData) setFlatDetails(flatData);

      // 2. Fetch maintenance payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('maintenance_records')
        .select('*')
        .eq('flat_no', flatNo)
        .order('billing_month', { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

      // Calculate current month status
      const d = new Date();
      const currentMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const currentRecord = (paymentsData || []).find(r => r.billing_month === currentMonthStr);
      
      setCurrentMonthStatus({
        month: currentMonthStr,
        status: currentRecord ? currentRecord.payment_status : 'Unpaid',
        due: currentRecord ? currentRecord.amount_due : 2000,
        paid: currentRecord ? currentRecord.amount_paid : 0,
        record: currentRecord || null
      });

      // 3. Fetch announcements
      const { data: noticesData, error: noticesError } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (noticesError) throw noticesError;
      setAnnouncements(noticesData || []);

      // 4. Fetch complaints
      const { data: complaintsData, error: complaintsError } = await supabase
        .from('complaints')
        .select('*')
        .eq('flat_no', flatNo)
        .order('created_at', { ascending: false });

      if (complaintsError) throw complaintsError;
      setComplaints(complaintsData || []);

    } catch (err) {
      console.error('Error fetching resident data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRaiseComplaint = async (e) => {
    e.preventDefault();
    setSubmittingComplaint(true);
    try {
      const { error } = await supabase
        .from('complaints')
        .insert([{
          flat_no: flatNo,
          title: newComplaint.title,
          description: newComplaint.description
        }]);

      if (error) throw error;
      setNewComplaint({ title: '', description: '' });
      fetchResidentData();
      alert('Complaint submitted successfully.');
    } catch (err) {
      alert('Error submitting complaint: ' + err.message);
    } finally {
      setSubmittingComplaint(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (passwordForm.oldPassword !== flatDetails.password) {
      setPasswordMessage({ type: 'error', text: 'Incorrect current password.' });
      return;
    }

    if (passwordForm.newPassword.length < 4) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 4 characters.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    try {
      const { error } = await supabase
        .from('flats')
        .update({ password: passwordForm.newPassword })
        .eq('flat_no', flatNo);

      if (error) throw error;
      
      setFlatDetails(prev => ({ ...prev, password: passwordForm.newPassword }));
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: 'Error: ' + err.message });
    }
  };

  // Format month string e.g. "2026-07" to "July 2026"
  const formatMonthName = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <h2 style={{ fontSize: '1.15rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <span style={{ color: 'var(--primary)', fontWeight: '800' }}>Flat {flatNo}</span>
        </h2>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="btn btn-secondary"
          style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </header>

      {/* Backdrop for Mobile Sidebar Drawer */}
      {isMobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar Drawer */}
      <aside className={`sidebar glass-panel ${isMobileMenuOpen ? 'open' : ''}`} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
        {/* Mobile menu close button */}
        <div className="mobile-only" style={{ alignSelf: 'flex-end', marginBottom: '1rem' }}>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: '800' }}>Flat {flatNo}</span>
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Resident Portal</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            My Flat
          </button>
          <button
            onClick={() => { setActiveTab('payments'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 3h12M6 8h12M6 13h8.5a4.5 4.5 0 0 0 0-9H6M6 13h3L18 21" />
            </svg>
            Payments
          </button>
          <button
            onClick={() => { setActiveTab('notices'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'notices' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Noticeboard
            {announcements.length > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--primary)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>
                {announcements.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('complaints'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'complaints' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Complaints
          </button>
          <button
            onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </button>
        </nav>

        <button
          onClick={onLogout}
          className="btn btn-secondary"
          style={{ marginTop: 'auto', justifyContent: 'center' }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Log Out
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {loading ? (
          <div className="flex-center" style={{ height: '70vh', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading portal...</p>
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Welcome, Flat {flatNo}</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Apartment Resident Dashboard</p>
                </div>

                <div className="grid-split-1-1">
                  {/* Flat Details Panel */}
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                      Flat Information
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', fontSize: '0.95rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Owner Name:</span>
                      <span style={{ fontWeight: '500' }}>{flatDetails.owner_name || 'Not updated'}</span>

                      <span style={{ color: 'var(--text-secondary)' }}>Tenant Name:</span>
                      <span style={{ fontWeight: '500' }}>{flatDetails.tenant_name || 'Not updated'}</span>

                      <span style={{ color: 'var(--text-secondary)' }}>Contact Phone:</span>
                      <span>{flatDetails.phone_number || 'Not updated'}</span>

                      <span style={{ color: 'var(--text-secondary)' }}>Contact Email:</span>
                      <span>{flatDetails.email || 'Not updated'}</span>

                      <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                      <div>
                        <span className={`badge ${flatDetails.is_vacant ? 'badge-vacant' : 'badge-occupied'}`}>
                          {flatDetails.is_vacant 
                            ? 'Vacant' 
                            : (flatDetails.is_owner_occupied ? 'Owner Occupied' : 'Rented Out')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Current Month Maintenance Panel */}
                  <div className="glass-panel glow-primary" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', color: 'var(--secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                        Maintenance: {formatMonthName(currentMonthStatus.month)}
                      </h3>
                      <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
                        <div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>AMOUNT DUE</p>
                          <h2 style={{ fontSize: '2rem' }}>₹{currentMonthStatus.due}</h2>
                        </div>
                        <div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'right' }}>STATUS</p>
                          <span className={`badge ${currentMonthStatus.status === 'Paid' ? 'badge-paid' : currentMonthStatus.status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid'}`} style={{ fontSize: '0.9rem', padding: '0.3rem 1rem' }}>
                            {currentMonthStatus.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {currentMonthStatus.status === 'Paid' ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                        <p style={{ color: '#34d399', fontWeight: 'bold' }}>✓ Paid on {new Date(currentMonthStatus.record.payment_date).toLocaleDateString()}</p>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Method: {currentMonthStatus.record.payment_method} | Txn: {currentMonthStatus.record.transaction_id || 'N/A'}</p>
                      </div>
                    ) : (
                      <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <p style={{ color: '#fbbf24', fontWeight: 'bold' }}>⚠ Payment Pending</p>
                        <p style={{ marginTop: '0.25rem' }}>Please pay maintenance to the association bank account and share the details with the admin.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Split layout for Notice board and quick Complaint */}
                <div className="grid-split-2-1" style={{ marginTop: '1.5rem' }}>
                  {/* Notices Section */}
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Recent Notices</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                      {announcements.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>No announcements posted.</p>
                      ) : (
                        announcements.slice(0, 3).map(notice => (
                          <div key={notice.id} className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)' }}>
                            <div className="flex-between mb-2">
                              <h4 style={{ fontSize: '0.95rem', fontWeight: '600' }}>{notice.title}</h4>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(notice.created_at).toLocaleDateString()}</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{notice.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Quick Complaint Form */}
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Raise a Complaint</h3>
                    <form onSubmit={handleRaiseComplaint}>
                      <div className="input-group">
                        <label htmlFor="complaint-title-input">Issue Title</label>
                        <input
                          id="complaint-title-input"
                          type="text"
                          className="input-field"
                          placeholder="e.g. Plumbing leak, Lift issue"
                          value={newComplaint.title}
                          onChange={(e) => setNewComplaint({ ...newComplaint, title: e.target.value })}
                          required
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        />
                      </div>

                      <div className="input-group">
                        <label htmlFor="complaint-desc-textarea">Description</label>
                        <textarea
                          id="complaint-desc-textarea"
                          className="input-field"
                          rows="3"
                          placeholder="Describe the issue in detail..."
                          value={newComplaint.description}
                          onChange={(e) => setNewComplaint({ ...newComplaint, description: e.target.value })}
                          required
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', fontFamily: 'inherit' }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submittingComplaint}
                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}
                      >
                        {submittingComplaint ? 'Submitting...' : 'Submit Complaint'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* PAYMENTS HISTORY TAB */}
            {activeTab === 'payments' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Maintenance Payments</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>View your maintenance dues and payment history</p>
                </div>

                <div className="glass-panel" style={{ padding: '1.25rem', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem 0.75rem' }}>Billing Month</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Status</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Amount Due</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Amount Paid</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Payment Date</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Method</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Transaction ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No payment records found.
                          </td>
                        </tr>
                      ) : (
                        payments.map(record => {
                          const date = record.payment_date ? new Date(record.payment_date).toLocaleDateString() : '-';
                          return (
                            <tr key={record.billing_month} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                              <td style={{ padding: '1rem 0.75rem', fontWeight: 'bold' }}>{formatMonthName(record.billing_month)}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                <span className={`badge ${record.payment_status === 'Paid' ? 'badge-paid' : record.payment_status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid'}`}>
                                  {record.payment_status}
                                </span>
                              </td>
                              <td style={{ padding: '1rem 0.75rem' }}>₹{record.amount_due}</td>
                              <td style={{ padding: '1rem 0.75rem', color: 'var(--success)' }}>₹{record.amount_paid}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>{date}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>{record.payment_method || '-'}</td>
                              <td style={{ padding: '1rem 0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {record.transaction_id || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* NOTICEBOARD TAB */}
            {activeTab === 'notices' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Community Notice Board</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Important updates posted by the apartment association</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {announcements.length === 0 ? (
                    <div className="glass-panel flex-center" style={{ padding: '4rem', color: 'var(--text-muted)' }}>
                      No announcements posted yet.
                    </div>
                  ) : (
                    announcements.map(notice => (
                      <div key={notice.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div className="flex-between mb-2" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                          <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)' }}>{notice.title}</h3>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(notice.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                          {notice.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* COMPLAINTS TAB */}
            {activeTab === 'complaints' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>My Complaints</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Track and raise maintenance or service requests</p>
                </div>

                <div className="grid-split-1-1">
                  {/* Complaints List */}
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>Complaint History</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                      {complaints.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
                          You haven't submitted any complaints yet.
                        </p>
                      ) : (
                        complaints.map(item => (
                          <div key={item.id} className="glass-card" style={{ padding: '1rem' }}>
                            <div className="flex-between">
                              <span className={`badge ${item.status === 'Resolved' ? 'badge-paid' : item.status === 'In Progress' ? 'badge-partial' : 'badge-unpaid'}`}>
                                {item.status}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 style={{ marginTop: '0.75rem', fontSize: '0.95rem', fontWeight: '600' }}>{item.title}</h4>
                            <p style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                              {item.description}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* File New Complaint */}
                  <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>File a New Complaint</h3>
                    <form onSubmit={handleRaiseComplaint}>
                      <div className="input-group">
                        <label htmlFor="complaint-form-title">Issue Title</label>
                        <input
                          id="complaint-form-title"
                          type="text"
                          className="input-field"
                          placeholder="Brief title of the problem"
                          value={newComplaint.title}
                          onChange={(e) => setNewComplaint({ ...newComplaint, title: e.target.value })}
                          required
                        />
                      </div>

                      <div className="input-group">
                        <label htmlFor="complaint-form-desc">Full Description</label>
                        <textarea
                          id="complaint-form-desc"
                          className="input-field"
                          rows="6"
                          placeholder="Describe the issue, including location/details..."
                          value={newComplaint.description}
                          onChange={(e) => setNewComplaint({ ...newComplaint, description: e.target.value })}
                          required
                          style={{ fontFamily: 'inherit' }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submittingComplaint}
                        style={{ width: '100%', marginTop: '1rem' }}
                      >
                        {submittingComplaint ? 'Submitting...' : 'Submit Complaint'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Portal Settings</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Manage your resident account settings</p>
                </div>

                <div className="glass-panel" style={{ padding: '2rem', maxWidth: '500px' }}>
                  <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', color: 'var(--primary)' }}>Change Password</h3>

                  {passwordMessage.text && (
                    <div style={{
                      background: passwordMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: passwordMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                      color: passwordMessage.type === 'success' ? '#34d399' : '#f87171',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      fontSize: '0.875rem',
                      marginBottom: '1.25rem'
                    }}>
                      {passwordMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword}>
                    <div className="input-group">
                      <label htmlFor="old-password-input">Current Password</label>
                      <input
                        id="old-password-input"
                        type="password"
                        className="input-field"
                        value={passwordForm.oldPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                        required
                        placeholder="Enter current password"
                      />
                    </div>

                    <div className="input-group">
                      <label htmlFor="new-password-input">New Password</label>
                      <input
                        id="new-password-input"
                        type="password"
                        className="input-field"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        required
                        placeholder="At least 4 characters"
                      />
                    </div>

                    <div className="input-group" style={{ marginBottom: '2rem' }}>
                      <label htmlFor="confirm-password-input">Confirm New Password</label>
                      <input
                        id="confirm-password-input"
                        type="password"
                        className="input-field"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        required
                        placeholder="Re-type new password"
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      Update Password
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
