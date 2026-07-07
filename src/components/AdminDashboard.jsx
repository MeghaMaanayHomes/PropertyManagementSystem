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

  // Ledger Filter/Sort/Search States
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');
  const [showLedgerFilters, setShowLedgerFilters] = useState(false);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState('all');
  const [ledgerOccupancyFilter, setLedgerOccupancyFilter] = useState('all');
  const [ledgerMethodFilter, setLedgerMethodFilter] = useState('all');
  const [ledgerSortBy, setLedgerSortBy] = useState('flat_no');
  const [ledgerSortOrder, setLedgerSortOrder] = useState('asc');
  const [ledgerPage, setLedgerPage] = useState(1);

  // Contacts Directory States
  const [contacts, setContacts] = useState([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone_number: '', details: '' });
  const [submittingContact, setSubmittingContact] = useState(false);

  // Settings States
  const [maintenanceAmount, setMaintenanceAmount] = useState(2000);
  const [maintenanceAmountInput, setMaintenanceAmountInput] = useState(2000);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

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


  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setEditingFlat(null);
    setRecordingPayment(null);
    setSelectedComplaint(null);
    setContactsSearch('');
    setShowAddContactModal(false);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth, activeTab]);

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

      // 6. Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('*');

      let currentMaintenanceAmount = 2000;
      if (!settingsError && settingsData) {
        const amtSetting = settingsData.find(s => s.key === 'maintenance_amount');
        if (amtSetting) {
          const parsed = parseFloat(amtSetting.value);
          if (!isNaN(parsed)) {
            currentMaintenanceAmount = parsed;
            setMaintenanceAmount(parsed);
            setMaintenanceAmountInput(parsed);
          }
        }
      }

      // 5. Calculate Stats
      calculateStats(flatsData || [], recordsData || [], currentMaintenanceAmount);

      // 7. Fetch contacts (graceful fallback)
      try {
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .order('name', { ascending: true });
        if (contactsError) throw contactsError;
        setContacts(contactsData || []);
      } catch (cErr) {
        console.warn('Could not load contacts directory:', cErr.message);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (flatsList, recordsList, mAmount = 2000) => {
    const total = 40;
    const occupied = flatsList.filter(f => !f.is_vacant).length;
    const vacant = total - occupied;

    // We assume every flat should pay maintenance. 
    // If a record doesn't exist for a flat, its amount due is mAmount (default) and paid is 0.
    let totalCollected = 0;
    let totalExpected = total * mAmount; // default mAmount per flat

    recordsList.forEach(r => {
      totalCollected += Number(r.amount_paid || 0);
      // If a flat has a custom amount_due, we adjust our expected total
      if (r.amount_due !== undefined) {
        totalExpected = totalExpected - mAmount + Number(r.amount_due);
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

      } else if (req.request_type === 'ownership_transfer') {
        const details = req.details || {};

        // 1. Fetch current flat state to archive tenant history if needed
        const { data: currentFlat, error: fetchError } = await supabase
          .from('flats')
          .select('*')
          .eq('flat_no', req.flat_no)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (currentFlat) {
          const wasRented = currentFlat.is_vacant === false && currentFlat.is_owner_occupied === false;
          if (wasRented) {
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

          // Archive old owner to owner_history
          if (currentFlat.owner_name) {
            const { error: ownerHistoryError } = await supabase
              .from('owner_history')
              .insert([{
                flat_no: req.flat_no,
                owner_name: currentFlat.owner_name,
                phone_number: currentFlat.phone_number || '',
                email: currentFlat.email || '',
                transferred_at: new Date().toISOString()
              }]);

            if (ownerHistoryError) throw ownerHistoryError;
          }
        }

        // 2. Perform flat table update for new owner & reset occupancy status
        const { error: updateError } = await supabase
          .from('flats')
          .update({
            owner_name: details.new_owner_name,
            phone_number: details.new_owner_phone,
            email: details.new_owner_email,
            owner_password: details.new_owner_password,
            is_vacant: true,
            is_owner_occupied: true,
            tenant_name: '',
            tenant_phone: '',
            tenant_email: '',
            occupancy_from: null
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
            amount_due: details.amount_due || maintenanceAmount,
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
        amount_due: Number(recordingPayment.amount_due || maintenanceAmount),
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

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const parsed = parseFloat(maintenanceAmountInput);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('Please enter a valid positive number for the maintenance amount.');
      }

      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'maintenance_amount',
          value: parsed.toString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setMaintenanceAmount(parsed);
      alert('Settings saved successfully!');
      fetchData(); // Refresh stats with new dues
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    } finally {
      setIsSavingSettings(false);
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

  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!newContact.name || !newContact.phone_number) {
      alert('Name and Phone Number are required!');
      return;
    }
    setSubmittingContact(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .insert([newContact]);

      if (error) throw error;
      setNewContact({ name: '', phone_number: '', details: '' });
      setShowAddContactModal(false);
      fetchData();
    } catch (err) {
      alert('Error adding contact: ' + err.message);
    } finally {
      setSubmittingContact(false);
    }
  };

  const handleDeleteContact = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Error deleting contact: ' + err.message);
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

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerSearchQuery, ledgerStatusFilter, ledgerOccupancyFilter, ledgerMethodFilter]);

  // Processed (filtered, searched, sorted) ledger records
  const processedLedgerRecords = (() => {
    // 1. Map over all flats to get their corresponding maintenance info
    let list = flats.map(flat => {
      const record = maintenanceRecords.find(r => r.flat_no === flat.flat_no);
      const paid = record ? record.amount_paid : 0;
      const due = record ? record.amount_due : maintenanceAmount;
      const status = record ? record.payment_status : 'Unpaid';
      const method = record ? record.payment_method : '-';
      const date = record && record.payment_date ? new Date(record.payment_date).toLocaleDateString() : '-';
      const rawDate = record && record.payment_date ? record.payment_date : '';
      
      let occupancyType = 'vacant';
      if (!flat.is_vacant) {
        occupancyType = flat.is_owner_occupied ? 'owner' : 'tenant';
      }
      
      const occupantName = flat.is_vacant 
        ? 'Vacant' 
        : (flat.is_owner_occupied 
            ? (flat.owner_name ? flat.owner_name : 'Owner') 
            : (flat.tenant_name ? flat.tenant_name : 'Tenant'));
            
      const occupantLabel = flat.is_vacant 
        ? 'Vacant' 
        : (flat.is_owner_occupied 
            ? (flat.owner_name ? `Owner: ${flat.owner_name}` : 'Owner') 
            : (flat.tenant_name ? `Tenant: ${flat.tenant_name}` : 'Tenant'));

      return {
        flat,
        record,
        flat_no: flat.flat_no,
        paid,
        due,
        status,
        method,
        date,
        rawDate,
        occupancyType,
        occupantName,
        occupantLabel,
      };
    });

    // 2. Search filter
    if (ledgerSearchQuery.trim()) {
      const q = ledgerSearchQuery.toLowerCase();
      list = list.filter(item => 
        item.flat_no.toLowerCase().includes(q) || 
        item.occupantName.toLowerCase().includes(q)
      );
    }

    // 3. Status filter
    if (ledgerStatusFilter !== 'all') {
      list = list.filter(item => item.status.toLowerCase() === ledgerStatusFilter.toLowerCase());
    }

    // 4. Occupancy filter
    if (ledgerOccupancyFilter !== 'all') {
      list = list.filter(item => item.occupancyType.toLowerCase() === ledgerOccupancyFilter.toLowerCase());
    }

    // 5. Method filter
    if (ledgerMethodFilter !== 'all') {
      list = list.filter(item => {
        if (ledgerMethodFilter === '-') {
          return item.method === '-';
        }
        return item.method.toLowerCase() === ledgerMethodFilter.toLowerCase();
      });
    }

    // 6. Sort
    list.sort((a, b) => {
      let valA = a[ledgerSortBy];
      let valB = b[ledgerSortBy];

      // Handle custom fields sorting
      if (ledgerSortBy === 'flat_no') {
        return ledgerSortOrder === 'asc' 
          ? a.flat_no.localeCompare(b.flat_no, undefined, { numeric: true }) 
          : b.flat_no.localeCompare(a.flat_no, undefined, { numeric: true });
      }

      if (ledgerSortBy === 'date') {
        const timeA = a.rawDate ? new Date(a.rawDate).getTime() : 0;
        const timeB = b.rawDate ? new Date(b.rawDate).getTime() : 0;
        return ledgerSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (ledgerSortBy === 'due') {
        valA = a.due;
        valB = b.due;
      } else if (ledgerSortBy === 'paid') {
        valA = a.paid;
        valB = b.paid;
      } else if (ledgerSortBy === 'status') {
        valA = a.status;
        valB = b.status;
      }

      if (typeof valA === 'string') {
        return ledgerSortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return ledgerSortOrder === 'asc' 
          ? (valA > valB ? 1 : -1) 
          : (valA < valB ? 1 : -1);
      }
    });

    return list;
  })();

  const handleResetFilters = () => {
    setLedgerSearchQuery('');
    setLedgerStatusFilter('all');
    setLedgerOccupancyFilter('all');
    setLedgerMethodFilter('all');
    setLedgerSortBy('flat_no');
    setLedgerSortOrder('asc');
    setLedgerPage(1);
  };

  const recordsPerPage = 10;
  const totalRecords = processedLedgerRecords.length;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  
  const currentPage = Math.max(1, Math.min(ledgerPage, totalPages || 1));
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + recordsPerPage, totalRecords);
  const paginatedRecords = processedLedgerRecords.slice(startIndex, endIndex);

  // Group flats by floor for the 3D-like grid view
  const floors = {};
  for (let floor = 4; floor >= 0; floor--) {
    floors[floor] = flats.filter(f => f.flat_no.startsWith(String(floor)));
  }

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img 
            src="/building_header.png" 
            alt="Building Outline" 
            style={{ height: '28px', width: 'auto' }} 
          />
          <h2 style={{ fontSize: '1.15rem', color: '#fff', margin: 0, fontWeight: '600' }}>
            Admin
          </h2>
        </div>
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

        <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img 
            src="/building_header.png" 
            alt="Building Outline" 
            style={{ height: '36px', width: 'auto' }} 
          />
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, fontWeight: '600' }}>
              Admin
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Portal</p>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => handleTabChange('overview')}
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
            onClick={() => handleTabChange('flats')}
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
            onClick={() => handleTabChange('ledger')}
            className={`btn ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 3h12M6 8h12M6 13h8.5a4.5 4.5 0 0 0 0-9H6M6 13h3L18 21" />
            </svg>
            Maintenance Ledger
          </button>
          <button
            onClick={() => handleTabChange('approvals')}
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
            onClick={() => handleTabChange('notices')}
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
            onClick={() => handleTabChange('complaints')}
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
          <button
            onClick={() => handleTabChange('contacts')}
            className={`btn ${activeTab === 'contacts' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Contacts Directory
          </button>
          <button
            onClick={() => handleTabChange('settings')}
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
            <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard data...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : editingFlat ? (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2rem' }}>
              <button
                type="button"
                onClick={() => setEditingFlat(null)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
              <div>
                <h1 style={{ fontSize: '1.85rem', margin: 0 }}>Edit Details</h1>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Managing Flat {editingFlat.flat_no}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateFlat} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Owner Information
                </h3>
                <div className="grid-split-1-1" style={{ gap: '1rem' }}>
                  <div className="input-group">
                    <label htmlFor="owner-name-input">Owner Name</label>
                    <input
                      id="owner-name-input"
                      type="text"
                      className="input-field"
                      style={{ padding: '0.6rem' }}
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
                      style={{ padding: '0.6rem' }}
                      value={editingFlat.phone_number || ''}
                      onChange={(e) => setEditingFlat({ ...editingFlat, phone_number: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid-split-1-1" style={{ gap: '1rem', marginTop: '1rem' }}>
                  <div className="input-group">
                    <label htmlFor="email-input">Owner Email</label>
                    <input
                      id="email-input"
                      type="email"
                      className="input-field"
                      style={{ padding: '0.6rem' }}
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
                      style={{ padding: '0.6rem' }}
                      value={editingFlat.owner_password || ''}
                      onChange={(e) => setEditingFlat({ ...editingFlat, owner_password: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Occupancy Status
                </h3>
                <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500' }}>
                      <input
                        type="radio"
                        name="admin_page_occupancy_status"
                        checked={editingFlat.is_vacant === true}
                        onChange={() => setEditingFlat({ ...editingFlat, is_vacant: true, is_owner_occupied: true })}
                        style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                      />
                      Vacant
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500' }}>
                      <input
                        type="radio"
                        name="admin_page_occupancy_status"
                        checked={editingFlat.is_vacant === false && editingFlat.is_owner_occupied === true}
                        onChange={() => setEditingFlat({ ...editingFlat, is_vacant: false, is_owner_occupied: true })}
                        style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                      />
                      Occupied by Owner
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500' }}>
                      <input
                        type="radio"
                        name="admin_page_occupancy_status"
                        checked={editingFlat.is_vacant === false && editingFlat.is_owner_occupied === false}
                        onChange={() => setEditingFlat({ ...editingFlat, is_vacant: false, is_owner_occupied: false })}
                        style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                      />
                      Rented out to Tenant
                    </label>
                  </div>
                </div>

                {!editingFlat.is_vacant && editingFlat.is_owner_occupied && (
                  <div className="input-group" style={{ marginBottom: 0, marginTop: '1rem' }}>
                    <label htmlFor="occupancy-from-input">Occupied Since Date</label>
                    <input
                      id="occupancy-from-input"
                      type="date"
                      className="input-field"
                      style={{ padding: '0.6rem' }}
                      value={editingFlat.occupancy_from || ''}
                      onChange={(e) => setEditingFlat({ ...editingFlat, occupancy_from: e.target.value })}
                      required
                    />
                  </div>
                )}

                {!editingFlat.is_vacant && !editingFlat.is_owner_occupied && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '1rem', fontWeight: 'bold' }}>Tenant Details</h4>
                    <div className="grid-split-1-1" style={{ gap: '1rem' }}>
                      <div className="input-group">
                        <label htmlFor="tenant-name-input">Tenant Name</label>
                        <input
                          id="tenant-name-input"
                          type="text"
                          className="input-field"
                          style={{ padding: '0.6rem' }}
                          value={editingFlat.tenant_name || ''}
                          onChange={(e) => setEditingFlat({ ...editingFlat, tenant_name: e.target.value })}
                          required
                          placeholder="Tenant full name"
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor="tenant-password-input">Tenant Password</label>
                        <input
                          id="tenant-password-input"
                          type="text"
                          className="input-field"
                          style={{ padding: '0.6rem' }}
                          value={editingFlat.tenant_password || ''}
                          onChange={(e) => setEditingFlat({ ...editingFlat, tenant_password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid-split-1-1" style={{ gap: '1rem', marginTop: '1rem' }}>
                      <div className="input-group">
                        <label htmlFor="tenant-phone-input">Tenant Phone</label>
                        <input
                          id="tenant-phone-input"
                          type="text"
                          className="input-field"
                          style={{ padding: '0.6rem' }}
                          value={editingFlat.tenant_phone || ''}
                          onChange={(e) => setEditingFlat({ ...editingFlat, tenant_phone: e.target.value })}
                          required
                          placeholder="Phone number"
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor="tenant-email-input">Tenant Email (Optional)</label>
                        <input
                          id="tenant-email-input"
                          type="email"
                          className="input-field"
                          style={{ padding: '0.6rem' }}
                          value={editingFlat.tenant_email || ''}
                          onChange={(e) => setEditingFlat({ ...editingFlat, tenant_email: e.target.value })}
                          placeholder="Email address"
                        />
                      </div>
                    </div>
                    <div className="input-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                      <label htmlFor="occupancy-from-input-tenant">Occupied Since Date</label>
                      <input
                        id="occupancy-from-input-tenant"
                        type="date"
                        className="input-field"
                        style={{ padding: '0.6rem' }}
                        value={editingFlat.occupancy_from || ''}
                        onChange={(e) => setEditingFlat({ ...editingFlat, occupancy_from: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem' }}>
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
                    <div>
                      <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                        </svg>
                        Tenant History
                      </h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.6rem 0.4rem' }}>Tenant Name</th>
                              <th style={{ padding: '0.6rem 0.4rem' }}>Phone</th>
                              <th style={{ padding: '0.6rem 0.4rem' }}>Occupied Range</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allHistory.length === 0 ? (
                              <tr>
                                <td colSpan="3" style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)' }}>
                                  No tenant records.
                                </td>
                              </tr>
                            ) : (
                              allHistory.map(h => (
                                <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '0.6rem 0.4rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {h.tenant_name}
                                    {h.occupied_to === 'Present' && (
                                      <span className="badge badge-paid" style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '3px' }}>Current</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.4rem' }}>{h.tenant_phone || '-'}</td>
                                  <td style={{ padding: '0.6rem 0.4rem', color: 'var(--text-secondary)' }}>
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
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minWidth: '120px' }}
                  onClick={() => setEditingFlat(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ minWidth: '150px' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%', maxWidth: '320px' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} htmlFor="month-select">Billing Month:</label>
                    <input
                      id="month-select"
                      type="month"
                      className="input-field"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ padding: '0.5rem', flex: 1 }}
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
                  <div className="glass-panel" style={{ padding: '1.5rem', minWidth: 0 }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Active Maintenance Dues Overview</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {flats.slice(0, 8).map(flat => {
                        const record = maintenanceRecords.find(r => r.flat_no === flat.flat_no);
                        const paid = record ? record.amount_paid : 0;
                        const status = record ? record.payment_status : 'Unpaid';
                        const due = record ? record.amount_due : maintenanceAmount;
                        const outstanding = Math.max(0, due - paid);
                        const name = flat.is_vacant
                          ? 'Vacant'
                          : (flat.is_owner_occupied
                              ? (flat.owner_name || 'Owner')
                              : (flat.tenant_name || 'Tenant'));
                        const badgeClass = status === 'Paid' ? 'badge-paid' : status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid';

                        return (
                          <div key={flat.flat_no} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)', flexShrink: 0 }}>{flat.flat_no}</span>
                              <span style={{ fontSize: '0.82rem', color: flat.is_vacant ? 'var(--text-muted)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                              <span className={`badge ${badgeClass}`} style={{ fontSize: '0.65rem', padding: '2px 7px' }}>{status}</span>
                              <span style={{ fontWeight: '600', fontSize: '0.85rem', color: outstanding > 0 ? 'var(--accent)' : 'var(--success)', minWidth: '3.5rem', textAlign: 'right' }}>₹{outstanding}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }} onClick={() => handleTabChange('ledger')}>
                        View Full Ledger
                      </button>
                    </div>
                  </div>

                  {/* Quick Notice Board / Complaints mini list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', flex: 1 }}>
                      <div className="flex-between mb-2">
                        <h3 style={{ fontSize: '1.05rem' }}>Recent Notices</h3>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleTabChange('notices')}>
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
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleTabChange('complaints')}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%', maxWidth: '320px' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} htmlFor="ledger-month-select">Select Month:</label>
                    <input
                      id="ledger-month-select"
                      type="month"
                      className="input-field"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      style={{ padding: '0.5rem', flex: 1 }}
                    />
                  </div>
                </div>

                <style>{`
                  @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                {/* Search, Filter & Sort Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                  {/* Top Row: Search input */}
                  <div style={{ display: 'flex', gap: '1rem', width: '100%', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '0' }}>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                      >
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      <input
                        type="text"
                        placeholder="Search by Flat number or occupant name..."
                        className="input-field"
                        value={ledgerSearchQuery}
                        onChange={(e) => setLedgerSearchQuery(e.target.value)}
                        style={{ width: '100%', paddingLeft: '2.75rem' }}
                      />
                    </div>
                  </div>

                  {/* Second Row: Actions, Sorting and Showing count */}
                  <div className="flex-between ledger-controls-row" style={{ flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {/* FILTERS toggle button */}
                      <button
                        type="button"
                        onClick={() => setShowLedgerFilters(!showLedgerFilters)}
                        className={`btn ${showLedgerFilters ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', height: '38px' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                        FILTERS
                      </button>

                      {/* SORT Label & Select */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>SORT</span>
                        <select
                          className="input-field"
                          value={ledgerSortBy}
                          onChange={(e) => setLedgerSortBy(e.target.value)}
                          style={{ padding: '0.35rem 2rem 0.35rem 0.75rem', height: '38px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}
                        >
                          <option value="flat_no">Flat Number</option>
                          <option value="due">Amount Due</option>
                          <option value="paid">Amount Paid</option>
                          <option value="status">Payment Status</option>
                          <option value="date">Payment Date</option>
                        </select>

                        {/* Sort Order Direction Toggle Button */}
                        <button
                          type="button"
                          onClick={() => setLedgerSortOrder(ledgerSortOrder === 'asc' ? 'desc' : 'asc')}
                          className="btn btn-secondary"
                          style={{ padding: '0.5rem', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title={ledgerSortOrder === 'asc' ? 'Sorting Ascending' : 'Sorting Descending'}
                        >
                          {ledgerSortOrder === 'asc' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <polyline points="19 12 12 19 5 12"></polyline>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="19" x2="12" y2="5"></line>
                              <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* SHOWING Indicator */}
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                      SHOWING {totalRecords === 0 ? '0' : `${startIndex + 1}-${endIndex}`} OF {totalRecords} RECORDS
                    </div>
                  </div>

                  {/* ADVANCED FILTERS Panel */}
                  {showLedgerFilters && (
                    <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '0.5rem', animation: 'fadeIn 0.2s ease-out' }}>
                      <div className="flex-between mb-3" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                          </svg>
                          ADVANCED FILTERS
                        </span>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          ✕ RESET ALL
                        </button>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        <div className="input-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Status</label>
                          <select
                            className="input-field"
                            value={ledgerStatusFilter}
                            onChange={(e) => setLedgerStatusFilter(e.target.value)}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                          >
                            <option value="all">All Statuses</option>
                            <option value="paid">Paid</option>
                            <option value="partially paid">Partially Paid</option>
                            <option value="unpaid">Unpaid</option>
                          </select>
                        </div>

                        <div className="input-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Occupancy</label>
                          <select
                            className="input-field"
                            value={ledgerOccupancyFilter}
                            onChange={(e) => setLedgerOccupancyFilter(e.target.value)}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                          >
                            <option value="all">All Occupancies</option>
                            <option value="owner">Owner Occupied</option>
                            <option value="tenant">Rented out to Tenant</option>
                            <option value="vacant">Vacant</option>
                          </select>
                        </div>

                        <div className="input-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Payment Method</label>
                          <select
                            className="input-field"
                            value={ledgerMethodFilter}
                            onChange={(e) => setLedgerMethodFilter(e.target.value)}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                          >
                            <option value="all">All Methods</option>
                            <option value="upi">UPI</option>
                            <option value="cash">Cash</option>
                            <option value="bank transfer">Bank Transfer</option>
                            <option value="-">None (-)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Desktop View: Table */}
                <div className="glass-panel desktop-only" style={{ padding: '1rem', overflowX: 'auto' }}>
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
                      {paginatedRecords.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                            No maintenance records found. Try modifying your search or filters.
                          </td>
                        </tr>
                      ) : (
                        paginatedRecords.map(({ flat, record, flat_no, paid, due, status, method, date, occupantLabel }) => {
                          return (
                            <tr key={flat_no} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                              <td style={{ padding: '1rem 0.75rem', fontWeight: 'bold' }}>{flat_no}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>
                                <span className={`badge ${status === 'Paid' ? 'badge-paid' : status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid'}`}>
                                  {status}
                                </span>
                              </td>
                              <td style={{ padding: '1rem 0.75rem', color: flat.is_vacant ? 'var(--text-muted)' : 'var(--text-primary)' }}>{occupantLabel}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>₹{due}</td>
                              <td style={{ padding: '1rem 0.75rem', color: 'var(--success)' }}>₹{paid}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>{date}</td>
                              <td style={{ padding: '1rem 0.75rem' }}>{method}</td>
                              <td style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                  onClick={() => setRecordingPayment({
                                    flat_no: flat_no,
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
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: Cards */}
                <div className="mobile-only" style={{ marginTop: '1rem', gap: '0.75rem' }}>
                    {paginatedRecords.length === 0 ? (
                      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No maintenance records found. Try modifying your search or filters.
                      </div>
                    ) : (
                      paginatedRecords.map(({ flat, record, flat_no, paid, due, status, method, date, occupantLabel }) => {
                        const badgeClass = status === 'Paid' ? 'badge-paid' : status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid';
                        return (
                          <div key={flat_no} className="glass-panel" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>Flat {flat_no}</span>
                              <span className={`badge ${badgeClass}`}>{status}</span>
                            </div>

                            {/* Info rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.875rem', paddingBottom: '0.6rem', borderBottom: '1px solid var(--glass-border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Occupant</span>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: '500', textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{occupantLabel}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Paid / Due</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>₹{paid} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>/ ₹{due}</span></span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Date</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{date}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Method</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{method}</span>
                              </div>
                            </div>

                            <button
                              className="btn btn-secondary"
                              style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
                              onClick={() => setRecordingPayment({
                                flat_no: flat_no,
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
                          </div>
                        );
                      })
                    )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setLedgerPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                    >
                      ← Previous
                    </button>
                    
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Page <strong style={{ color: 'var(--text-primary)' }}>{currentPage}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong>
                    </span>

                    <button
                      type="button"
                      onClick={() => setLedgerPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* APPROVALS TAB */}
            {activeTab === 'approvals' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Approval Requests Queue</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Review, approve, or reject resident occupancy status changes and reported payments</p>
                </div>

                {/* Desktop View: Table */}
                <div className="glass-panel desktop-only" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
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
                          const typeLabel = req.request_type === 'occupancy_change' ? 'Occupancy/Tenant Update' : req.request_type === 'ownership_transfer' ? 'Ownership Transfer' : 'Payment Report';
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
                          } else if (req.request_type === 'ownership_transfer') {
                            const details = req.details || {};
                            detailsContent = (
                              <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                                <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>New Owner: {details.new_owner_name}</div>
                                <div>Phone: {details.new_owner_phone || 'N/A'}</div>
                                <div>Email: {details.new_owner_email || 'N/A'}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>Pass: {details.new_owner_password}</div>
                              </div>
                            );
                          } else if (req.request_type === 'payment_report') {
                            const details = req.details || {};
                            detailsContent = (
                              <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                                <div style={{ fontWeight: 'bold', color: 'var(--secondary)' }}>Month: {details.billing_month}</div>
                                <div>Paid: <strong>₹{details.amount_paid}</strong> via {details.payment_method}</div>
                                <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>Txn: {details.transaction_id || 'N/A'}</div>
                                {details.attachment_url && (
                                  <div style={{ marginTop: '0.5rem' }}>
                                    <a href={details.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                      <img src={details.attachment_url} alt="Payment proof"
                                        style={{ maxHeight: '80px', maxWidth: '120px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--glass-border)', display: 'block' }}
                                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline'; }}
                                      />
                                      <span style={{ display: 'none', fontSize: '0.75rem', color: 'var(--primary)' }}>📎 View Attachment</span>
                                    </a>
                                  </div>
                                )}
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

                {/* Mobile View: Cards */}
                <div className="mobile-only" style={{ marginTop: '1rem', gap: '0.75rem' }}>
                    {approvals.length === 0 ? (
                      <div className="glass-panel flex-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                        No approval requests found.
                      </div>
                    ) : (
                      approvals.map(req => {
                        const date = new Date(req.created_at).toLocaleString();
                        const typeLabel = req.request_type === 'occupancy_change' ? 'Occupancy/Tenant Update' : req.request_type === 'ownership_transfer' ? 'Ownership Transfer' : 'Payment Report';
                        const statusBadgeClass = req.status === 'Approved' ? 'badge-paid' : req.status === 'Rejected' ? 'badge-unpaid' : 'badge-partial';

                        // Build detail rows as key-value pairs
                        let detailRows = [];
                        if (req.request_type === 'occupancy_change') {
                          const d = req.details || {};
                          const statusStr = d.is_vacant ? 'Vacant' : (d.is_owner_occupied ? 'Owner Occupied' : 'Rented Out');
                          detailRows = [
                            { label: 'New Status', value: statusStr },
                            { label: 'Owner', value: `${d.owner_name || '—'} ${d.phone_number ? `· ${d.phone_number}` : ''}` },
                            ...(!d.is_vacant && !d.is_owner_occupied ? [
                              { label: 'Tenant', value: `${d.tenant_name || '—'} · ${d.tenant_phone || '—'}` },
                              { label: 'Since', value: d.occupancy_from || '—' },
                            ] : []),
                          ];
                        } else if (req.request_type === 'ownership_transfer') {
                          const d = req.details || {};
                          detailRows = [
                            { label: 'New Owner', value: d.new_owner_name || '—' },
                            { label: 'Phone', value: d.new_owner_phone || 'N/A' },
                            { label: 'Email', value: d.new_owner_email || 'N/A' },
                          ];
                        } else if (req.request_type === 'payment_report') {
                          const d = req.details || {};
                          detailRows = [
                            { label: 'Month', value: d.billing_month || '—' },
                            { label: 'Amount Paid', value: `₹${d.amount_paid} via ${d.payment_method || '—'}` },
                            { label: 'Txn ID', value: d.transaction_id || 'N/A' },
                          ];
                        }

                        return (
                          <div key={req.id} className="glass-panel" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: '700', fontSize: '1rem' }}>Flat {req.flat_no}</span>
                              <span className={`badge ${statusBadgeClass}`}>{req.status}</span>
                            </div>

                            {/* Meta rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', paddingBottom: '0.6rem', borderBottom: '1px solid var(--glass-border)' }}>
                              {[
                                { label: 'Type', value: typeLabel },
                                { label: 'Raised by', value: req.raised_by },
                                { label: 'Date', value: date },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right', textTransform: label === 'Raised by' ? 'capitalize' : 'none' }}>{value}</span>
                                </div>
                              ))}
                            </div>

                            {/* Detail rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', paddingBottom: '0.6rem', borderBottom: '1px solid var(--glass-border)' }}>
                              {detailRows.map(({ label, value }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                                  <span style={{ color: 'var(--text-primary)', fontWeight: '500', textAlign: 'right' }}>{value}</span>
                                </div>
                              ))}
                              {req.request_type === 'payment_report' && req.details?.attachment_url && (
                                <div style={{ marginTop: '0.4rem' }}>
                                  <a href={req.details.attachment_url} target="_blank" rel="noopener noreferrer">
                                    <img src={req.details.attachment_url} alt="Payment proof"
                                      style={{ maxHeight: '110px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain', border: '1px solid var(--glass-border)', display: 'block' }}
                                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline'; }}
                                    />
                                    <span style={{ display: 'none', fontSize: '0.8rem', color: 'var(--primary)' }}>📎 View Attachment</span>
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Action */}
                            {req.status === 'Pending' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  placeholder="Admin comments (optional)..."
                                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', width: '100%' }}
                                  id={`comment-mobile-${req.id}`}
                                />
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.875rem' }}
                                    onClick={() => {
                                      const commentVal = document.getElementById(`comment-mobile-${req.id}`)?.value || '';
                                      handleAcceptRequest(req, commentVal);
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-danger"
                                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.875rem' }}
                                    onClick={() => {
                                      const commentVal = document.getElementById(`comment-mobile-${req.id}`)?.value || '';
                                      handleRejectRequest(req.id, commentVal);
                                    }}
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>Admin notes</span>
                                <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{req.admin_comments || '—'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                </div>
              </div>
            )}

            {/* ANNOUNCEMENTS TAB */}
            {activeTab === 'notices' && (
              <div>
                <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ fontSize: '1.75rem' }}>Notice Board</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Post announcements and updates for all apartment residents</p>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowNoticeModal(true)}
                    style={{ whiteSpace: 'nowrap' }}
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

                {complaints.length === 0 ? (
                  <div className="glass-panel flex-center" style={{ padding: '3rem', color: 'var(--text-muted)' }}>
                    No complaints submitted yet.
                  </div>
                ) : (
                  <>
                    {/* Desktop View: Table */}
                    <div className="glass-panel desktop-only" style={{ padding: '1rem', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '560px' }}>
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
                    </div>

                    {/* Mobile View: Cards */}
                    <div className="mobile-only" style={{ flexDirection: 'column', gap: '0.75rem' }}>
                      {complaints.map(item => (
                        <div key={item.id} className="glass-panel" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: '700', fontSize: '1rem' }}>Flat {item.flat_no}</span>
                            <span className={`badge ${item.status === 'Resolved' ? 'badge-paid' : item.status === 'In Progress' ? 'badge-partial' : 'badge-unpaid'}`}>
                              {item.status}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', paddingBottom: '0.6rem', borderBottom: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>Title</span>
                              <span style={{ color: 'var(--text-primary)', fontWeight: '500', textAlign: 'right' }}>{item.title}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>Date</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <button
                            className="btn btn-secondary"
                            style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
                            onClick={() => setSelectedComplaint(item)}
                          >
                            View Details
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CONTACTS TAB */}
            {activeTab === 'contacts' && (
              <div>
                <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ fontSize: '1.75rem' }}>Contacts Directory</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Emergency and helpful services contacts for all residents</p>
                  </div>
                  <button
                    onClick={() => setShowAddContactModal(true)}
                    className="btn btn-primary"
                    style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Contact
                  </button>
                </div>

                {/* Search Bar */}
                <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                    >
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search contacts by name or description..."
                      className="input-field"
                      value={contactsSearch}
                      onChange={(e) => setContactsSearch(e.target.value)}
                      style={{ width: '100%', paddingLeft: '2.75rem' }}
                    />
                  </div>
                </div>

                {/* Contacts Grid */}
                {(() => {
                  const filteredContacts = contacts.filter(contact => {
                    const q = contactsSearch.toLowerCase();
                    return (
                      contact.name?.toLowerCase().includes(q) ||
                      contact.details?.toLowerCase().includes(q) ||
                      contact.phone_number?.includes(q)
                    );
                  });

                  if (filteredContacts.length === 0) {
                    return (
                      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                        <svg width="48" height="48" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: '1rem' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 20c-2.213 0-4.3-.63-6.089-1.73v-.109A9.03 9.03 0 0110 11.213c3.08 0 5.78 1.54 7.42 3.89M13.616 10.12a3 3 0 11-4.832 0c.955-.683 2.112-.683 3.068 0zM21 12a3 3 0 11-5.83 0c.71-.52 1.58-.52 2.29 0z" />
                        </svg>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No contacts found</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>Try modifying your search query or add a new contact.</p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                      {filteredContacts.map(c => (
                        <div key={c.id} className="glass-panel glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>{c.name}</h3>
                            <button
                              onClick={() => handleDeleteContact(c.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.2s', opacity: 0.7 }}
                              onMouseEnter={(e) => e.target.style.opacity = 1}
                              onMouseLeave={(e) => e.target.style.opacity = 0.7}
                              title="Delete Contact"
                            >
                              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                          
                          <a
                            href={`tel:${c.phone_number}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)', textDecoration: 'none', fontWeight: '600', fontSize: '1rem', width: 'fit-content' }}
                          >
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            {c.phone_number}
                          </a>

                          {c.details && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                              {c.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Add Contact Modal */}
                {showAddContactModal && (
                  <div className="modal-overlay flex-center" style={{ zIndex: 1000 }}>
                    <div className="glass-panel" style={{ width: '90%', maxWidth: '480px', padding: '2rem', position: 'relative' }}>
                      <button
                        onClick={() => setShowAddContactModal(false)}
                        style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
                      >
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>

                      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.4rem' }}>Add New Contact</h2>

                      <form onSubmit={handleCreateContact} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="input-group">
                          <label htmlFor="contact-name">Name / Service Name</label>
                          <input
                            id="contact-name"
                            type="text"
                            className="input-field"
                            value={newContact.name}
                            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                            required
                            placeholder="e.g. Plumber Rajesh, Fire Emergency"
                          />
                        </div>

                        <div className="input-group">
                          <label htmlFor="contact-phone">Phone Number</label>
                          <input
                            id="contact-phone"
                            type="tel"
                            className="input-field"
                            value={newContact.phone_number}
                            onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })}
                            required
                            placeholder="e.g. +91 98765 43210"
                          />
                        </div>

                        <div className="input-group">
                          <label htmlFor="contact-details">Details / Description</label>
                          <textarea
                            id="contact-details"
                            className="input-field"
                            value={newContact.details}
                            onChange={(e) => setNewContact({ ...newContact, details: e.target.value })}
                            placeholder="e.g. Available 24/7 for plumbing issues in Block A & B"
                            style={{ minHeight: '80px', resize: 'vertical' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowAddContactModal(false)}
                            style={{ padding: '0.6rem 1.25rem' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submittingContact}
                            style={{ padding: '0.6rem 1.5rem' }}
                          >
                            {submittingContact ? 'Adding...' : 'Add Contact'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Portal Settings</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Manage portal-wide configurations and fees</p>
                </div>

                <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px' }}>
                  <form onSubmit={handleSaveSettings}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                      Maintenance Fee Configuration
                    </h3>
                    
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                      Set the default monthly maintenance fee that is charged to each flat. Changes will apply to all calculations and new payment reports generated on the portal.
                    </p>

                    <div className="input-group" style={{ marginBottom: '1.5rem', maxWidth: '300px' }}>
                      <label htmlFor="settings-maintenance-fee" style={{ fontWeight: '600' }}>Monthly Maintenance Fee (₹)</label>
                      <input
                        id="settings-maintenance-fee"
                        type="number"
                        min="1"
                        step="1"
                        className="input-field"
                        value={maintenanceAmountInput}
                        onChange={(e) => setMaintenanceAmountInput(e.target.value)}
                        required
                        placeholder="e.g. 2000"
                        style={{ padding: '0.75rem' }}
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSavingSettings}
                      style={{ padding: '0.75rem 1.5rem' }}
                    >
                      {isSavingSettings ? 'Saving Changes...' : 'Save Settings'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>

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
