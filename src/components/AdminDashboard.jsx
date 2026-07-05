import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function AdminDashboard({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [flats, setFlats] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [editingFlat, setEditingFlat] = useState(null);
  const [recordingPayment, setRecordingPayment] = useState(null);
  const [newNotice, setNewNotice] = useState({ title: '', content: '' });
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [flatTenantHistory, setFlatTenantHistory] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Statistics
  const [stats, setStats] = useState({
    totalFlats: 40,
    occupied: 0,
    vacant: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    occupancyRate: 0,
    collectionRate: 0
  });

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  useEffect(() => {
    if (editingFlat?.flat_no) {
      fetchFlatHistory(editingFlat.flat_no);
    } else {
      setFlatTenantHistory([]);
    }
  }, [editingFlat?.flat_no]);

  const fetchFlatHistory = async (flatNum) => {
    try {
      const { data, error } = await supabase
        .from('tenant_history')
        .select('*')
        .eq('flat_no', flatNum)
        .order('occupied_to', { ascending: false });

      if (error) throw error;
      setFlatTenantHistory(data || []);
    } catch (err) {
      console.error('Error fetching flat tenant history:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch flats
      const { data: flatsData, error: flatsError } = await supabase
        .from('flats')
        .select('*')
        .order('flat_no', { ascending: true });

      if (flatsError) throw flatsError;
      setFlats(flatsData || []);

      // 2. Fetch maintenance records for selected month
      const { data: recordsData, error: recordsError } = await supabase
        .from('maintenance_records')
        .select('*')
        .eq('billing_month', selectedMonth);

      if (recordsError) throw recordsError;
      setMaintenanceRecords(recordsData || []);

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
        .order('created_at', { ascending: false });

      if (complaintsError) throw complaintsError;
      setComplaints(complaintsData || []);

      // 5. Fetch approvals
      const { data: approvalsData, error: approvalsError } = await supabase
        .from('approvals')
        .select('*')
        .order('created_at', { ascending: false });

      if (approvalsError) throw approvalsError;
      setApprovals(approvalsData || []);

      // 5. Calculate Stats
      calculateStats(flatsData || [], recordsData || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (flatsList, recordsList) => {
    const total = 40;
    const occupied = flatsList.filter(f => !f.is_vacant).length;
    const vacant = total - occupied;

    // We assume every flat should pay maintenance. 
    // If a record doesn't exist for a flat, its amount due is 2000 (default) and paid is 0.
    let totalCollected = 0;
    let totalExpected = total * 2000; // default 2000 per flat

    recordsList.forEach(r => {
      totalCollected += Number(r.amount_paid || 0);
      // If a flat has a custom amount_due, we adjust our expected total
      if (r.amount_due !== undefined) {
        totalExpected = totalExpected - 2000 + Number(r.amount_due);
      }
    });

    const totalOutstanding = Math.max(0, totalExpected - totalCollected);
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    setStats({
      totalFlats: total,
      occupied,
      vacant,
      totalCollected,
      totalOutstanding,
      occupancyRate,
      collectionRate
    });
  };

  const handleUpdateFlat = async (e) => {
    e.preventDefault();
    try {
      // 1. Fetch current flat to compare for tenant history archive
      const { data: currentFlat, error: fetchError } = await supabase
        .from('flats')
        .select('*')
        .eq('flat_no', editingFlat.flat_no)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (currentFlat) {
        const wasRented = currentFlat.is_vacant === false && currentFlat.is_owner_occupied === false;
        const isNewNotRented = editingFlat.is_vacant === true || editingFlat.is_owner_occupied === true;
        const hasTenantChanged = currentFlat.tenant_name !== editingFlat.tenant_name || currentFlat.tenant_phone !== editingFlat.tenant_phone;

        if (wasRented && (isNewNotRented || hasTenantChanged)) {
          // Archive old tenant details
          const { error: historyError } = await supabase
            .from('tenant_history')
            .insert([{
              flat_no: editingFlat.flat_no,
              tenant_name: currentFlat.tenant_name || 'Unknown',
              tenant_phone: currentFlat.tenant_phone || '',
              tenant_email: currentFlat.tenant_email || '',
              occupied_from: currentFlat.occupancy_from || new Date().toISOString().split('T')[0],
              occupied_to: new Date().toISOString().split('T')[0]
            }]);

          if (historyError) throw historyError;
        }
      }

      // 2. Perform flat update
      const { error } = await supabase
        .from('flats')
        .update({
          owner_name: editingFlat.owner_name,
          tenant_name: editingFlat.is_vacant || editingFlat.is_owner_occupied ? '' : editingFlat.tenant_name,
          is_vacant: editingFlat.is_vacant,
          is_owner_occupied: editingFlat.is_owner_occupied,
          phone_number: editingFlat.phone_number,
          email: editingFlat.email,
          tenant_phone: editingFlat.is_vacant || editingFlat.is_owner_occupied ? '' : editingFlat.tenant_phone,
          tenant_email: editingFlat.is_vacant || editingFlat.is_owner_occupied ? '' : editingFlat.tenant_email,
          occupancy_from: editingFlat.is_vacant ? null : (editingFlat.occupancy_from || null),
          owner_password: editingFlat.owner_password,
          tenant_password: editingFlat.tenant_password
        })
        .eq('flat_no', editingFlat.flat_no);

      if (error) throw error;
      setEditingFlat(null);
      fetchData();
    } catch (err) {
      alert('Error updating flat: ' + err.message);
    }
  };

  const handleAcceptRequest = async (req, adminComments = '') => {
    try {
      if (req.request_type === 'occupancy_change') {
        const details = req.details || {};
        
        // 1. Compare and archive tenant history if needed
        const { data: currentFlat, error: fetchError } = await supabase
          .from('flats')
          .select('*')
          .eq('flat_no', req.flat_no)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (currentFlat) {
          const wasRented = currentFlat.is_vacant === false && currentFlat.is_owner_occupied === false;
          const isNewNotRented = details.is_vacant === true || details.is_owner_occupied === true;
          const hasTenantChanged = currentFlat.tenant_name !== details.tenant_name || currentFlat.tenant_phone !== details.tenant_phone;

          if (wasRented && (isNewNotRented || hasTenantChanged)) {
            const { error: historyError } = await supabase
              .from('tenant_history')
              .insert([{
                flat_no: req.flat_no,
                tenant_name: currentFlat.tenant_name || 'Unknown',
                tenant_phone: currentFlat.tenant_phone || '',
                tenant_email: currentFlat.tenant_email || '',
                occupied_from: currentFlat.occupancy_from || new Date().toISOString().split('T')[0],
                occupied_to: new Date().toISOString().split('T')[0]
              }]);

            if (historyError) throw historyError;
          }
        }

        // 2. Perform flat table update
        const { error: updateError } = await supabase
          .from('flats')
          .update({
            owner_name: details.owner_name,
            phone_number: details.phone_number,
            email: details.email,
            is_vacant: details.is_vacant,
            is_owner_occupied: details.is_owner_occupied,
            tenant_name: details.tenant_name,
            tenant_phone: details.tenant_phone,
            tenant_email: details.tenant_email,
            occupancy_from: details.occupancy_from
          })
          .eq('flat_no', req.flat_no);

        if (updateError) throw updateError;

      } else if (req.request_type === 'payment_report') {
        const details = req.details || {};
        
        // Upsert into maintenance_records
        const { error: paymentError } = await supabase
          .from('maintenance_records')
          .upsert({
            flat_no: req.flat_no,
            billing_month: details.billing_month,
            amount_due: details.amount_due || 2000.00,
            amount_paid: details.amount_paid,
            payment_status: details.payment_status,
            payment_date: details.payment_date,
            payment_method: details.payment_method,
            transaction_id: details.transaction_id,
            updated_at: new Date().toISOString()
          });

        if (paymentError) throw paymentError;
      }

      // 3. Mark approval request as Approved
      const { error: approvalError } = await supabase
        .from('approvals')
        .update({
          status: 'Approved',
          admin_comments: adminComments,
          updated_at: new Date().toISOString()
        })
        .eq('id', req.id);

      if (approvalError) throw approvalError;

      alert('Request approved successfully!');
      fetchData();
    } catch (err) {
      alert('Error approving request: ' + err.message);
    }
  };

  const handleRejectRequest = async (reqId, adminComments = '') => {
    try {
      const { error } = await supabase
        .from('approvals')
        .update({
          status: 'Rejected',
          admin_comments: adminComments,
          updated_at: new Date().toISOString()
        })
        .eq('id', reqId);

      if (error) throw error;
      alert('Request rejected.');
      fetchData();
    } catch (err) {
      alert('Error rejecting request: ' + err.message);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      const record = {
        flat_no: recordingPayment.flat_no,
        billing_month: selectedMonth,
        amount_due: Number(recordingPayment.amount_due || 2000),
        amount_paid: Number(recordingPayment.amount_paid || 0),
        payment_status: recordingPayment.payment_status,
        payment_date: recordingPayment.payment_date ? new Date(recordingPayment.payment_date).toISOString() : null,
        payment_method: recordingPayment.payment_method,
        transaction_id: recordingPayment.transaction_id,
        remarks: recordingPayment.remarks
      };

      const { error } = await supabase
        .from('maintenance_records')
        .upsert(record, { onConflict: 'flat_no,billing_month' });

      if (error) throw error;
      setRecordingPayment(null);
      fetchData();
    } catch (err) {
      alert('Error saving payment record: ' + err.message);
    }
  };

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('announcements')
        .insert([newNotice]);

      if (error) throw error;
      setNewNotice({ title: '', content: '' });
      setShowNoticeModal(false);
      fetchData();
    } catch (err) {
      alert('Error creating announcement: ' + err.message);
    }
  };

  const handleDeleteNotice = async (id) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Error deleting announcement: ' + err.message);
    }
  };

  const handleUpdateComplaintStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('complaints')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      setSelectedComplaint(prev => prev ? { ...prev, status } : null);
      fetchData();
    } catch (err) {
      alert('Error updating complaint status: ' + err.message);
    }
  };

  // Group flats by floor for the 3D-like grid view
  const floors = {};
  for (let floor = 4; floor >= 0; floor--) {
    floors[floor] = flats.filter(f => f.flat_no.startsWith(String(floor)));
  }

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <h2 style={{ fontSize: '1.15rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <span style={{ color: 'var(--primary)', fontWeight: '800' }}>MMH</span> Admin
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
            <span style={{ color: 'var(--primary)', fontWeight: '800' }}>MMH</span> Admin
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Management Portal</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="9" rx="1"></rect>
              <rect x="14" y="3" width="7" height="5" rx="1"></rect>
              <rect x="14" y="12" width="7" height="9" rx="1"></rect>
              <rect x="3" y="16" width="7" height="5" rx="1"></rect>
            </svg>
            Overview
          </button>
          <button
            onClick={() => { setActiveTab('flats'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'flats' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Flats Directory
          </button>
          <button
            onClick={() => { setActiveTab('ledger'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 3h12M6 8h12M6 13h8.5a4.5 4.5 0 0 0 0-9H6M6 13h3L18 21" />
            </svg>
            Maintenance Ledger
          </button>
          <button
            onClick={() => { setActiveTab('approvals'); setIsMobileMenuOpen(false); }}
            className={`btn ${activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            Approvals
            {approvals.filter(a => a.status === 'Pending').length > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--primary)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>
                {approvals.filter(a => a.status === 'Pending').length}
              </span>
            )}
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
            Announcements
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
            {complaints.filter(c => c.status === 'Pending').length > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>
                {complaints.filter(c => c.status === 'Pending').length}
              </span>
            )}
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
            <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard data...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div>
                <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ fontSize: '1.75rem' }}>Dashboard Overview</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Key performance indicators for Megha Maanay Homes</p>
                  </div>
                  <div className="flex-center gap-2">
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} htmlFor="month-select">Billing Month:</label>
                    <input
                      id="month-select"
                      type="month"
                      className="input-field"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ padding: '0.5rem' }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                  <div className="glass-panel glow-primary" style={{ padding: '1.5rem', borderRadius: '14px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Occupancy Rate</p>
                    <h2 style={{ fontSize: '2.25rem', margin: '0.5rem 0', color: 'var(--primary)' }}>{stats.occupancyRate}%</h2>
                    <div className="flex-between" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>{stats.occupied} Occupied</span>
                      <span>{stats.vacant} Vacant</span>
                    </div>
                  </div>

                  <div className="glass-panel glow-secondary" style={{ padding: '1.5rem', borderRadius: '14px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Maintenance Collected</p>
                    <h2 style={{ fontSize: '2.25rem', margin: '0.5rem 0', color: 'var(--secondary)' }}>₹{stats.totalCollected.toLocaleString()}</h2>
                    <div className="flex-between" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>Collected this month</span>
                      <span className="badge badge-paid" style={{ padding: '2px 8px' }}>{stats.collectionRate}%</span>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '14px', boxShadow: '0 0 20px rgba(244, 63, 94, 0.05)' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Outstanding Dues</p>
                    <h2 style={{ fontSize: '2.25rem', margin: '0.5rem 0', color: 'var(--accent)' }}>₹{stats.totalOutstanding.toLocaleString()}</h2>
                    <div className="flex-between" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>Pending Collection</span>
                      <span>Total: 40 flats</span>
                    </div>
                  </div>
                </div>

                {/* Main Overview Dashboard Split */}
                <div className="grid-split-2-1">
                  {/* Recent Activity / Quick Status */}
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Active Maintenance Dues Overview</h3>
                    <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <th style={{ padding: '0.75rem 0.5rem' }}>Flat No</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>Resident</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>Paid</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flats.slice(0, 8).map(flat => {
                            const record = maintenanceRecords.find(r => r.flat_no === flat.flat_no);
                            const paid = record ? record.amount_paid : 0;
                            const status = record ? record.payment_status : 'Unpaid';
                            const due = record ? record.amount_due : 2000;
                            const outstanding = Math.max(0, due - paid);
                            const name = flat.is_vacant 
                              ? 'Vacant' 
                              : (flat.is_owner_occupied 
                                  ? (flat.owner_name ? `Owner: ${flat.owner_name}` : 'Owner Occupied') 
                                  : (flat.tenant_name ? `Tenant: ${flat.tenant_name}` : 'Rented Out'));

                            return (
                              <tr key={flat.flat_no} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600' }}>{flat.flat_no}</td>
                                <td style={{ padding: '0.75rem 0.5rem', color: flat.is_vacant ? 'var(--text-muted)' : 'var(--text-primary)' }}>{name}</td>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  <span className={`badge ${status === 'Paid' ? 'badge-paid' : status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid'}`}>
                                    {status}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 0.5rem' }}>₹{paid}</td>
                                <td style={{ padding: '0.75rem 0.5rem', color: outstanding > 0 ? 'var(--accent)' : 'var(--success)' }}>₹{outstanding}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }} onClick={() => setActiveTab('ledger')}>
                        View Full Ledger
                      </button>
                    </div>
                  </div>

                  {/* Quick Notice Board / Complaints mini list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', flex: 1 }}>
                      <div className="flex-between mb-2">
                        <h3 style={{ fontSize: '1.05rem' }}>Recent Notices</h3>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setActiveTab('notices')}>
                          Manage
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {announcements.length === 0 ? (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No notices posted yet.</p>
                        ) : (
                          announcements.slice(0, 3).map(a => (
                            <div key={a.id} className="glass-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.01)' }}>
                              <h4 style={{ fontSize: '0.9rem', fontWeight: '600' }}>{a.title}</h4>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{a.content}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1.5rem', flex: 1 }}>
                      <div className="flex-between mb-2">
                        <h3 style={{ fontSize: '1.05rem' }}>Pending Complaints</h3>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setActiveTab('complaints')}>
                          View All
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {complaints.filter(c => c.status === 'Pending').length === 0 ? (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No pending complaints!</p>
                        ) : (
                          complaints.filter(c => c.status === 'Pending').slice(0, 3).map(c => (
                            <div key={c.id} className="glass-card" style={{ padding: '0.75rem', borderLeft: '3px solid var(--accent)' }}>
                              <div className="flex-between">
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Flat {c.flat_no}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                              </div>
                              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.title}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FLATS DIRECTORY TAB */}
            {activeTab === 'flats' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Flats Directory</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Click on any flat to view/edit owner details, tenant details, phone, email, and vacancy status.</p>
                </div>

                <div className="floor-container">
                  {Object.keys(floors).map(floorNum => (
                    <div key={floorNum} className="floor-row">
                      <div className="floor-label">Floor {floorNum}</div>
                      <div className="flat-grid">
                        {floors[floorNum].map(flat => {
                          const name = flat.is_vacant 
                            ? 'Vacant' 
                            : (flat.is_owner_occupied 
                                ? (flat.owner_name ? `Owner: ${flat.owner_name}` : 'Owner') 
                                : (flat.tenant_name ? `Tenant: ${flat.tenant_name}` : 'Tenant'));
                          return (
                            <div
                              key={flat.flat_no}
                              onClick={() => setEditingFlat({ ...flat })}
                              className={`glass-panel flat-card ${flat.is_vacant ? 'vacant' : 'occupied'}`}
                            >
                              <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{flat.flat_no}</span>
                              <div style={{ marginTop: '0.5rem' }}>
                                <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                                  {name}
                                </div>
                                <span className={`badge ${flat.is_vacant ? 'badge-vacant' : 'badge-occupied'}`} style={{ fontSize: '0.65rem', padding: '1px 5px', marginTop: '0.25rem' }}>
                                  {flat.is_vacant 
                                    ? 'Vacant' 
                                    : (flat.is_owner_occupied ? 'Owner Occupied' : 'Rented Out')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MAINTENANCE LEDGER TAB */}
            {activeTab === 'ledger' && (
              <div>
                <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ fontSize: '1.75rem' }}>Maintenance Ledger</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Record and manage monthly payments for all flats</p>
                  </div>
                  <div className="flex-center gap-2">
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} htmlFor="ledger-month-select">Select Month:</label>
                    <input
                      id="ledger-month-select"
                      type="month"
                      className="input-field"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ padding: '0.5rem' }}
                    />
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '1rem', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem 0.75rem' }}>Flat</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Status</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Occupant</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Amount Due</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Amount Paid</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Payment Date</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Method</th>
                        <th style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flats.map(flat => {
                        const record = maintenanceRecords.find(r => r.flat_no === flat.flat_no);
                        const paid = record ? record.amount_paid : 0;
                        const due = record ? record.amount_due : 2000;
                        const status = record ? record.payment_status : 'Unpaid';
                        const method = record ? record.payment_method : '-';
                        const date = record && record.payment_date ? new Date(record.payment_date).toLocaleDateString() : '-';
                        const occupantName = flat.is_vacant 
                          ? 'Vacant' 
                          : (flat.is_owner_occupied 
                              ? (flat.owner_name ? `Owner: ${flat.owner_name}` : 'Owner') 
                              : (flat.tenant_name ? `Tenant: ${flat.tenant_name}` : 'Tenant'));

                        return (
                          <tr key={flat.flat_no} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                            <td style={{ padding: '1rem 0.75rem', fontWeight: 'bold' }}>{flat.flat_no}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>
                              <span className={`badge ${status === 'Paid' ? 'badge-paid' : status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid'}`}>
                                {status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem 0.75rem', color: flat.is_vacant ? 'var(--text-muted)' : 'var(--text-primary)' }}>{occupantName}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>₹{due}</td>
                            <td style={{ padding: '1rem 0.75rem', color: 'var(--success)' }}>₹{paid}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>{date}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>{method}</td>
                            <td style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => setRecordingPayment({
                                  flat_no: flat.flat_no,
                                  amount_due: due,
                                  amount_paid: paid || due,
                                  payment_status: status === 'Unpaid' ? 'Paid' : status,
                                  payment_date: record && record.payment_date ? record.payment_date.substring(0, 10) : new Date().toISOString().substring(0, 10),
                                  payment_method: record ? record.payment_method : 'UPI',
                                  transaction_id: record ? record.transaction_id : '',
                                  remarks: record ? record.remarks : ''
                                })}
                              >
                                Record Payment
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* APPROVALS TAB */}
            {activeTab === 'approvals' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Approval Requests Queue</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Review, approve, or reject resident occupancy status changes and reported payments</p>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem 0.75rem' }}>Flat</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Date Raised</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Request Type</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Raised By</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Status</th>
                        <th style={{ padding: '1rem 0.75rem' }}>Details</th>
                        <th style={{ padding: '1rem 0.75rem', width: '300px' }}>Action & Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvals.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No approval requests found.
                          </td>
                        </tr>
                      ) : (
                        approvals.map(req => {
                          const date = new Date(req.created_at).toLocaleString();
                          const typeLabel = req.request_type === 'occupancy_change' ? 'Occupancy/Tenant Update' : 'Payment Report';
                          const statusBadgeClass = req.status === 'Approved' ? 'badge-paid' : req.status === 'Rejected' ? 'badge-unpaid' : 'badge-partial';

                          // Render nice details preview
                          let detailsContent = null;
                          if (req.request_type === 'occupancy_change') {
                            const details = req.details || {};
                            const statusStr = details.is_vacant ? 'Vacant' : (details.is_owner_occupied ? 'Owner Occupied' : 'Rented Out');
                            detailsContent = (
                              <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Status: {statusStr}</div>
                                <div>Owner: {details.owner_name} ({details.phone_number || 'No Phone'})</div>
                                {!details.is_vacant && !details.is_owner_occupied && (
                                  <div style={{ borderLeft: '2px solid var(--glass-border)', paddingLeft: '0.5rem', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                                    Tenant: {details.tenant_name} ({details.tenant_phone})<br/>
                                    Since: {details.occupancy_from}
                                  </div>
                                )}
                              </div>
                            );
                          } else if (req.request_type === 'payment_report') {
                            const details = req.details || {};
                            detailsContent = (
                              <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                                <div style={{ fontWeight: 'bold', color: 'var(--secondary)' }}>Month: {details.billing_month}</div>
                                <div>Paid: <strong>₹{details.amount_paid}</strong> via {details.payment_method}</div>
                                <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>Txn: {details.transaction_id || 'N/A'}</div>
                              </div>
                            );
                          }

                          return (
                            <tr key={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem', verticalAlign: 'top' }}>
                              <td style={{ padding: '1rem 0.75rem', fontWeight: 'bold' }}>Flat {req.flat_no}</td>
                              <td style={{ padding: '1rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{date}</td>
                              <td style={{ padding: '1rem 0.75rem', fontWeight: '600' }}>{typeLabel}</td>
                              <td style={{ padding: '1rem 0.75rem', textTransform: 'capitalize' }}>{req.raised_by}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                <span className={`badge ${statusBadgeClass}`}>
                                  {req.status}
                                </span>
                              </td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                {detailsContent}
                              </td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                {req.status === 'Pending' ? (
                                  (() => {
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <input
                                          type="text"
                                          className="input-field"
                                          placeholder="Admin comments/feedback..."
                                          style={{ padding: '0.4rem', fontSize: '0.8rem', width: '100%' }}
                                          id={`comment-${req.id}`}
                                        />
                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                          <button
                                            className="btn btn-primary"
                                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', flex: 1 }}
                                            onClick={() => {
                                              const commentVal = document.getElementById(`comment-${req.id}`)?.value || '';
                                              handleAcceptRequest(req, commentVal);
                                            }}
                                          >
                                            Approve
                                          </button>
                                          <button
                                            className="btn btn-danger"
                                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', flex: 1 }}
                                            onClick={() => {
                                              const commentVal = document.getElementById(`comment-${req.id}`)?.value || '';
                                              handleRejectRequest(req.id, commentVal);
                                            }}
                                          >
                                            Reject
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    <div><strong>Comments:</strong></div>
                                    <div>{req.admin_comments || 'No comments left.'}</div>
                                  </div>
                                )}
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

            {/* ANNOUNCEMENTS TAB */}
            {activeTab === 'notices' && (
              <div>
                <div className="flex-between mb-4">
                  <div>
                    <h1 style={{ fontSize: '1.75rem' }}>Notice Board</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Post announcements and updates for all apartment residents</p>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowNoticeModal(true)}
                  >
                    + Post Announcement
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  {announcements.length === 0 ? (
                    <div className="glass-panel flex-center" style={{ padding: '3rem', flexDirection: 'column', color: 'var(--text-secondary)' }}>
                      <p>No announcements posted yet.</p>
                    </div>
                  ) : (
                    announcements.map(notice => (
                      <div key={notice.id} className="glass-panel" style={{ padding: '1.5rem', position: 'relative' }}>
                        <div className="flex-between mb-2">
                          <h3 style={{ fontSize: '1.2rem' }}>{notice.title}</h3>
                          <div className="flex-center gap-2">
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {new Date(notice.created_at).toLocaleString()}
                            </span>
                            <button
                              onClick={() => handleDeleteNotice(notice.id)}
                              className="btn btn-danger"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              Delete
                            </button>
                          </div>
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
                  <h1 style={{ fontSize: '1.75rem' }}>Complaints Board</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Manage and resolve service requests raised by residents</p>
                </div>

                <div className="glass-panel" style={{ padding: '1rem', overflowX: 'auto' }}>
                  {complaints.length === 0 ? (
                    <div className="flex-center" style={{ padding: '3rem', color: 'var(--text-muted)' }}>
                      No complaints submitted yet.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          <th style={{ padding: '1rem 0.75rem' }}>Flat</th>
                          <th style={{ padding: '1rem 0.75rem' }}>Title</th>
                          <th style={{ padding: '1rem 0.75rem' }}>Date</th>
                          <th style={{ padding: '1rem 0.75rem' }}>Status</th>
                          <th style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {complaints.map(item => (
                          <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                            <td style={{ padding: '1rem 0.75rem', fontWeight: 'bold' }}>Flat {item.flat_no}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>{item.title}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                            <td style={{ padding: '1rem 0.75rem' }}>
                              <span className={`badge ${item.status === 'Resolved' ? 'badge-paid' : item.status === 'In Progress' ? 'badge-partial' : 'badge-unpaid'}`}>
                                {item.status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => setSelectedComplaint(item)}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* EDIT FLAT MODAL */}
      {editingFlat && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel glow-primary" style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Edit Details - Flat {editingFlat.flat_no}</h2>
            <form onSubmit={handleUpdateFlat}>
              <h4 style={{ color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.25rem', marginBottom: '1rem' }}>Owner Info</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="input-group">
                  <label htmlFor="owner-name-input">Owner Name</label>
                  <input
                    id="owner-name-input"
                    type="text"
                    className="input-field"
                    style={{ padding: '0.5rem' }}
                    value={editingFlat.owner_name || ''}
                    onChange={(e) => setEditingFlat({ ...editingFlat, owner_name: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="phone-input">Owner Phone</label>
                  <input
                    id="phone-input"
                    type="text"
                    className="input-field"
                    style={{ padding: '0.5rem' }}
                    value={editingFlat.phone_number || ''}
                    onChange={(e) => setEditingFlat({ ...editingFlat, phone_number: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="input-group">
                  <label htmlFor="email-input">Owner Email</label>
                  <input
                    id="email-input"
                    type="email"
                    className="input-field"
                    style={{ padding: '0.5rem' }}
                    value={editingFlat.email || ''}
                    onChange={(e) => setEditingFlat({ ...editingFlat, email: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="owner-password-input">Owner Password</label>
                  <input
                    id="owner-password-input"
                    type="text"
                    className="input-field"
                    style={{ padding: '0.5rem' }}
                    value={editingFlat.owner_password || ''}
                    onChange={(e) => setEditingFlat({ ...editingFlat, owner_password: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Occupancy Status</label>
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="admin_occupancy_status"
                      checked={editingFlat.is_vacant === true}
                      onChange={() => setEditingFlat({ ...editingFlat, is_vacant: true, is_owner_occupied: true })}
                      style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                    />
                    Vacant
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="admin_occupancy_status"
                      checked={editingFlat.is_vacant === false && editingFlat.is_owner_occupied === true}
                      onChange={() => setEditingFlat({ ...editingFlat, is_vacant: false, is_owner_occupied: true })}
                      style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                    />
                    Occupied by Owner
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="admin_occupancy_status"
                      checked={editingFlat.is_vacant === false && editingFlat.is_owner_occupied === false}
                      onChange={() => setEditingFlat({ ...editingFlat, is_vacant: false, is_owner_occupied: false })}
                      style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                    />
                    Rented out to Tenant
                  </label>
                </div>
              </div>

              {/* Occupied Date (Owner) */}
              {!editingFlat.is_vacant && editingFlat.is_owner_occupied && (
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="occupancy-from-input">Occupied Since Date</label>
                  <input
                    id="occupancy-from-input"
                    type="date"
                    className="input-field"
                    style={{ padding: '0.5rem' }}
                    value={editingFlat.occupancy_from || ''}
                    onChange={(e) => setEditingFlat({ ...editingFlat, occupancy_from: e.target.value })}
                    required
                  />
                </div>
              )}

              {/* Rented Out Tenant details */}
              {!editingFlat.is_vacant && !editingFlat.is_owner_occupied && (
                <fieldset style={{ border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', background: 'rgba(255,255,255,0.01)' }}>
                  <legend style={{ fontSize: '0.75rem', color: 'var(--primary)', padding: '0 0.5rem', fontWeight: 'bold' }}>Tenant Info</legend>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                      <label htmlFor="tenant-name-input">Tenant Name</label>
                      <input
                        id="tenant-name-input"
                        type="text"
                        className="input-field"
                        style={{ padding: '0.5rem' }}
                        value={editingFlat.tenant_name || ''}
                        onChange={(e) => setEditingFlat({ ...editingFlat, tenant_name: e.target.value })}
                        required
                        placeholder="Tenant full name"
                      />
                    </div>

                    <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                      <label htmlFor="tenant-password-input">Tenant Password</label>
                      <input
                        id="tenant-password-input"
                        type="text"
                        className="input-field"
                        style={{ padding: '0.5rem' }}
                        value={editingFlat.tenant_password || ''}
                        onChange={(e) => setEditingFlat({ ...editingFlat, tenant_password: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label htmlFor="tenant-phone-input">Tenant Phone</label>
                      <input
                        id="tenant-phone-input"
                        type="text"
                        className="input-field"
                        style={{ padding: '0.5rem' }}
                        value={editingFlat.tenant_phone || ''}
                        onChange={(e) => setEditingFlat({ ...editingFlat, tenant_phone: e.target.value })}
                        required
                        placeholder="Phone number"
                      />
                    </div>

                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label htmlFor="tenant-email-input">Tenant Email (Optional)</label>
                      <input
                        id="tenant-email-input"
                        type="email"
                        className="input-field"
                        style={{ padding: '0.5rem' }}
                        value={editingFlat.tenant_email || ''}
                        onChange={(e) => setEditingFlat({ ...editingFlat, tenant_email: e.target.value })}
                        placeholder="Email address"
                      />
                    </div>
                  </div>

                  <div className="input-group" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
                    <label htmlFor="occupancy-from-input-tenant">Occupied Since Date</label>
                    <input
                      id="occupancy-from-input-tenant"
                      type="date"
                      className="input-field"
                      style={{ padding: '0.5rem' }}
                      value={editingFlat.occupancy_from || ''}
                      onChange={(e) => setEditingFlat({ ...editingFlat, occupancy_from: e.target.value })}
                      required
                    />
                  </div>
                </fieldset>
              )}

              {/* Past Tenant History */}
              {(() => {
                const displayHistory = [];
                if (!editingFlat.is_vacant && !editingFlat.is_owner_occupied && editingFlat.tenant_name) {
                  displayHistory.push({
                    id: 'current-tenant',
                    tenant_name: editingFlat.tenant_name,
                    tenant_phone: editingFlat.tenant_phone,
                    tenant_email: editingFlat.tenant_email,
                    occupied_from: editingFlat.occupancy_from,
                    occupied_to: 'Present'
                  });
                }
                const allHistory = [...displayHistory, ...flatTenantHistory];

                return (
                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                    <h4 style={{ color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                      </svg>
                      Tenant History
                    </h4>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', padding: '0.5rem', border: '1px solid var(--glass-border)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '0.5rem 0.25rem' }}>Tenant Name</th>
                            <th style={{ padding: '0.5rem 0.25rem' }}>Phone</th>
                            <th style={{ padding: '0.5rem 0.25rem' }}>Occupied Range</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allHistory.length === 0 ? (
                            <tr>
                              <td colSpan="3" style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-muted)' }}>
                                No tenant records.
                              </td>
                            </tr>
                          ) : (
                            allHistory.map(h => (
                              <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '0.5rem 0.25rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  {h.tenant_name}
                                  {h.occupied_to === 'Present' && (
                                    <span className="badge badge-paid" style={{ fontSize: '0.55rem', padding: '0px 4px', borderRadius: '3px' }}>Current</span>
                                  )}
                                </td>
                                <td style={{ padding: '0.5rem 0.25rem' }}>{h.tenant_phone || '-'}</td>
                                <td style={{ padding: '0.5rem 0.25rem', color: 'var(--text-secondary)' }}>
                                  {h.occupied_from ? new Date(h.occupied_from).toLocaleDateString() : '-'} - {h.occupied_to === 'Present' ? 'Present' : (h.occupied_to ? new Date(h.occupied_to).toLocaleDateString() : '-')}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <div className="flex-center gap-2" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingFlat(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {recordingPayment && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel glow-secondary">
            <h2 style={{ marginBottom: '1.5rem' }}>Record Payment - Flat {recordingPayment.flat_no}</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Billing Month: {selectedMonth}
            </p>

            <form onSubmit={handleRecordPayment}>
              <div className="grid-split-1-1" style={{ gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="input-group">
                  <label htmlFor="amount-due-input">Amount Due (₹)</label>
                  <input
                    id="amount-due-input"
                    type="number"
                    className="input-field"
                    value={recordingPayment.amount_due}
                    onChange={(e) => setRecordingPayment({ ...recordingPayment, amount_due: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="amount-paid-input">Amount Paid (₹)</label>
                  <input
                    id="amount-paid-input"
                    type="number"
                    className="input-field"
                    value={recordingPayment.amount_paid}
                    onChange={(e) => setRecordingPayment({ ...recordingPayment, amount_paid: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="payment-status-select">Payment Status</label>
                <select
                  id="payment-status-select"
                  className="input-field"
                  value={recordingPayment.payment_status}
                  onChange={(e) => setRecordingPayment({ ...recordingPayment, payment_status: e.target.value })}
                >
                  <option value="Paid">Paid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </div>

              <div className="input-group">
                <label htmlFor="payment-date-input">Payment Date</label>
                <input
                  id="payment-date-input"
                  type="date"
                  className="input-field"
                  value={recordingPayment.payment_date}
                  onChange={(e) => setRecordingPayment({ ...recordingPayment, payment_date: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label htmlFor="payment-method-select">Payment Method</label>
                <select
                  id="payment-method-select"
                  className="input-field"
                  value={recordingPayment.payment_method}
                  onChange={(e) => setRecordingPayment({ ...recordingPayment, payment_method: e.target.value })}
                >
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div className="input-group">
                <label htmlFor="txn-id-input">Transaction ID / Ref No</label>
                <input
                  id="txn-id-input"
                  type="text"
                  className="input-field"
                  placeholder="e.g. UPI Ref, Bank Txn ID"
                  value={recordingPayment.transaction_id}
                  onChange={(e) => setRecordingPayment({ ...recordingPayment, transaction_id: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label htmlFor="remarks-input">Remarks</label>
                <textarea
                  id="remarks-input"
                  className="input-field"
                  rows="2"
                  value={recordingPayment.remarks}
                  onChange={(e) => setRecordingPayment({ ...recordingPayment, remarks: e.target.value })}
                  style={{ fontFamily: 'inherit' }}
                />
              </div>

              <div className="flex-center gap-2" style={{ marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRecordingPayment(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST ANNOUNCEMENT MODAL */}
      {showNoticeModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel glow-primary">
            <h2 style={{ marginBottom: '1.5rem' }}>Post New Announcement</h2>
            <form onSubmit={handleCreateNotice}>
              <div className="input-group">
                <label htmlFor="notice-title-input">Title</label>
                <input
                  id="notice-title-input"
                  type="text"
                  className="input-field"
                  placeholder="Important notice title"
                  value={newNotice.title}
                  onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="notice-content-textarea">Content</label>
                <textarea
                  id="notice-content-textarea"
                  className="input-field"
                  rows="5"
                  placeholder="Write notice details here..."
                  value={newNotice.content}
                  onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                  required
                  style={{ fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              <div className="flex-center gap-2" style={{ marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNoticeModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Publish Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW COMPLAINT DETAILS MODAL */}
      {selectedComplaint && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel glow-primary" style={{ maxWidth: '500px' }}>
            <h2 style={{ marginBottom: '1rem' }}>Complaint Details</h2>
            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>From:</span>
              <span style={{ marginLeft: '0.5rem', fontWeight: 'bold' }}>Flat {selectedComplaint.flat_no}</span>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Submitted:</span>
              <span style={{ marginLeft: '0.5rem' }}>{new Date(selectedComplaint.created_at).toLocaleString()}</span>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</span>
              <span className={`badge ${selectedComplaint.status === 'Resolved' ? 'badge-paid' : selectedComplaint.status === 'In Progress' ? 'badge-partial' : 'badge-unpaid'}`} style={{ marginLeft: '0.5rem' }}>
                {selectedComplaint.status}
              </span>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>{selectedComplaint.title}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                {selectedComplaint.description}
              </p>
            </div>

            <div className="input-group">
              <label htmlFor="complaint-status-select">Update Status</label>
              <select
                id="complaint-status-select"
                className="input-field"
                value={selectedComplaint.status}
                onChange={(e) => handleUpdateComplaintStatus(selectedComplaint.id, e.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setSelectedComplaint(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
