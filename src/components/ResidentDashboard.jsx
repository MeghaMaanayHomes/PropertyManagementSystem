import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

export default function ResidentDashboard({ session, onLogout, initialTab = 'overview' }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [flatDetails, setFlatDetails] = useState(session.flatDetails || {});
  const [flats, setFlats] = useState([]);
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

  // Contacts Directory States
  const [contacts, setContacts] = useState([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone_number: '', details: '' });
  const [submittingContact, setSubmittingContact] = useState(false);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    navigate(`/${tab}`, { replace: true });
    setContactsSearch('');
    setShowAddContactModal(false);
    setIsMobileMenuOpen(false);
  };

  // Edit Flat Info States (Owner Only)
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [tenantHistory, setTenantHistory] = useState([]);
  const [ownerHistory, setOwnerHistory] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [editedDetails, setEditedDetails] = useState({
    owner_name: '',
    phone_number: '',
    email: '',
    is_vacant: true,
    is_owner_occupied: true,
    tenant_name: '',
    tenant_phone: '',
    tenant_email: '',
    occupancy_from: ''
  });

  // Transfer Ownership form states (Owner Only)
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false);
  const [transferForm, setTransferForm] = useState({
    new_owner_name: '',
    new_owner_phone: '',
    new_owner_email: '',
    new_owner_password: ''
  });

  // Report Payment Form States (Owner & Tenant)
  const [paymentReport, setPaymentReport] = useState({
    billing_month: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })(),
    amount_paid: '',
    payment_method: 'UPI',
    transaction_id: '',
    payment_date: new Date().toISOString().split('T')[0]
  });
  const [submittingPaymentReport, setSubmittingPaymentReport] = useState(false);
  const [paymentReportMessage, setPaymentReportMessage] = useState({ type: '', text: '' });
  const [paymentAttachment, setPaymentAttachment] = useState(null); // File object
  const [paymentAttachmentPreview, setPaymentAttachmentPreview] = useState(null); // object URL
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Current month maintenance status
  const [currentMonthStatus, setCurrentMonthStatus] = useState({
    month: '',
    status: 'Unpaid',
    due: 2000,
    paid: 0,
    record: null
  });

  const [maintenanceAmount, setMaintenanceAmount] = useState(2000);

  const flatNo = session.flatNo;

  // Fetch all data once on mount. Individual actions that mutate data call
  // fetchResidentData() themselves to refresh after the mutation.
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

      if (flatData) {
        setFlatDetails(flatData);
      }

      // 2. Fetch maintenance payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('maintenance_records')
        .select('*')
        .eq('flat_no', flatNo)
        .order('billing_month', { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

      // Fetch settings for maintenance amount
      const { data: settingsData } = await supabase
        .from('settings')
        .select('*');

      let currentMaintenanceAmount = 2000;
      if (settingsData) {
        const amtSetting = settingsData.find(s => s.key === 'maintenance_amount');
        if (amtSetting) {
          const parsed = parseFloat(amtSetting.value);
          if (!isNaN(parsed)) {
            currentMaintenanceAmount = parsed;
          }
        }
      }
      setMaintenanceAmount(currentMaintenanceAmount);
      setPaymentReport(prev => ({
        ...prev,
        amount_paid: prev.amount_paid === '' ? currentMaintenanceAmount.toString() : prev.amount_paid
      }));

      // Calculate current month status
      const d = new Date();
      const currentMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const currentRecord = (paymentsData || []).find(r => r.billing_month === currentMonthStr);
      
      setCurrentMonthStatus({
        month: currentMonthStr,
        status: currentRecord ? currentRecord.payment_status : 'Unpaid',
        due: currentRecord ? currentRecord.amount_due : currentMaintenanceAmount,
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

      // 5. Fetch all flats for the Building Map
      const { data: allFlats, error: allFlatsError } = await supabase
        .from('flats')
        .select('*')
        .order('flat_no', { ascending: true });

      if (allFlatsError) throw allFlatsError;
      setFlats(allFlats || []);

      // 6. Fetch tenant history (only if owner)
      if (session.role === 'owner') {
        const { data: historyData, error: historyError } = await supabase
          .from('tenant_history')
          .select('*')
          .eq('flat_no', flatNo)
          .order('occupied_to', { ascending: false });

        if (historyError) throw historyError;
        setTenantHistory(historyData || []);

        const { data: ownerHistoryData, error: ownerHistoryError } = await supabase
          .from('owner_history')
          .select('*')
          .eq('flat_no', flatNo)
          .order('transferred_at', { ascending: false });

        if (ownerHistoryError) throw ownerHistoryError;
        setOwnerHistory(ownerHistoryData || []);
      }

      // 7. Fetch approvals for this flat
      const { data: approvalsData, error: approvalsError } = await supabase
        .from('approvals')
        .select('*')
        .eq('flat_no', flatNo)
        .order('created_at', { ascending: false });

      if (approvalsError) throw approvalsError;
      setApprovals(approvalsData || []);

      // 8. Fetch contacts (graceful fallback)
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

  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!newContact.name || !newContact.phone_number) {
      alert('Name and Phone Number are required!');
      return;
    }
    setSubmittingContact(true);
    try {
      // Submit as an approval request — admin must approve before it appears in the directory
      const { error } = await supabase
        .from('approvals')
        .insert([{
          flat_no: flatNo,
          request_type: 'contact_suggestion',
          details: {
            name: newContact.name,
            phone_number: newContact.phone_number,
            details: newContact.details || ''
          },
          raised_by: session.role,
          status: 'Pending'
        }]);

      if (error) throw error;
      setNewContact({ name: '', phone_number: '', details: '' });
      setShowAddContactModal(false);
      alert('Contact suggestion submitted for admin approval.');
      fetchResidentData();
    } catch (err) {
      alert('Error submitting contact suggestion: ' + err.message);
    } finally {
      setSubmittingContact(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    const passwordColumn = session.role === 'owner' ? 'owner_password' : 'tenant_password';
    const currentPassword = flatDetails[passwordColumn];

    if (passwordForm.oldPassword !== currentPassword) {
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
        .update({ [passwordColumn]: passwordForm.newPassword })
        .eq('flat_no', flatNo);

      if (error) throw error;
      
      setFlatDetails(prev => ({ ...prev, [passwordColumn]: passwordForm.newPassword }));
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: 'Error: ' + err.message });
    }
  };

  const handleSaveFlatInfo = async (e) => {
    e.preventDefault();
    const confirmSave = window.confirm("Are you sure you want to submit flat details update for admin approval?");
    if (!confirmSave) return;
    try {
      const { error } = await supabase
        .from('approvals')
        .insert([{
          flat_no: flatNo,
          request_type: 'occupancy_change',
          details: {
            owner_name: editedDetails.owner_name,
            phone_number: editedDetails.phone_number,
            email: editedDetails.email,
            is_vacant: editedDetails.is_vacant,
            is_owner_occupied: editedDetails.is_owner_occupied,
            tenant_name: editedDetails.is_vacant || editedDetails.is_owner_occupied ? '' : editedDetails.tenant_name,
            tenant_phone: editedDetails.is_vacant || editedDetails.is_owner_occupied ? '' : editedDetails.tenant_phone,
            tenant_email: editedDetails.is_vacant || editedDetails.is_owner_occupied ? '' : editedDetails.tenant_email,
            occupancy_from: editedDetails.is_vacant ? null : (editedDetails.occupancy_from || null)
          },
          raised_by: session.role,
          status: 'Pending'
        }]);

      if (error) throw error;
      
      setIsEditingInfo(false);
      fetchResidentData();
      alert('Request submitted for admin approval.');
    } catch (err) {
      alert('Error submitting request: ' + err.message);
    }
  };

  const handleTransferOwnership = async (e) => {
    e.preventDefault();
    const confirmTransfer = window.confirm("Are you sure you want to transfer ownership of Flat " + flatNo + "? Once approved by admin, your access to this flat will be deactivated.");
    if (!confirmTransfer) return;

    try {
      const { error } = await supabase
        .from('approvals')
        .insert([{
          flat_no: flatNo,
          request_type: 'ownership_transfer',
          details: {
            new_owner_name: transferForm.new_owner_name,
            new_owner_phone: transferForm.new_owner_phone,
            new_owner_email: transferForm.new_owner_email,
            new_owner_password: transferForm.new_owner_password
          },
          raised_by: session.role,
          status: 'Pending'
        }]);

      if (error) throw error;

      setIsTransferringOwnership(false);
      setTransferForm({
        new_owner_name: '',
        new_owner_phone: '',
        new_owner_email: '',
        new_owner_password: ''
      });
      fetchResidentData();
      alert('Ownership transfer request submitted for admin approval.');
    } catch (err) {
      alert('Error submitting ownership transfer request: ' + err.message);
    }
  };

  const handlePaymentAttachmentFile = (file) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
      alert('Only image files (JPG, PNG, GIF, WEBP) or PDF are allowed.');
      return;
    }
    setPaymentAttachment(file);
    if (file.type.startsWith('image/')) {
      setPaymentAttachmentPreview(URL.createObjectURL(file));
    } else {
      setPaymentAttachmentPreview(null); // PDF - no preview
    }
  };

  const handleReportPayment = async (e) => {
    e.preventDefault();
    setSubmittingPaymentReport(true);
    setPaymentReportMessage({ type: '', text: '' });
    try {
      const amountPaidNum = parseFloat(paymentReport.amount_paid);
      if (isNaN(amountPaidNum) || amountPaidNum < 0) {
        throw new Error('Please enter a valid amount paid.');
      }

      // Upload attachment to Supabase Storage if provided
      let attachment_url = null;
      if (paymentAttachment) {
        const ext = paymentAttachment.name.split('.').pop();
        const fileName = `payment_${flatNo}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('payment-attachments')
          .upload(fileName, paymentAttachment, { upsert: false });

        if (uploadError) throw new Error('File upload failed: ' + uploadError.message);

        const { data: urlData } = supabase.storage
          .from('payment-attachments')
          .getPublicUrl(fileName);
        attachment_url = urlData?.publicUrl || null;
      }
      
      const { error } = await supabase
        .from('approvals')
        .insert([{
          flat_no: flatNo,
          request_type: 'payment_report',
          details: {
            billing_month: paymentReport.billing_month,
            amount_due: maintenanceAmount,
            amount_paid: amountPaidNum,
            payment_status: amountPaidNum >= maintenanceAmount ? 'Paid' : (amountPaidNum > 0 ? 'Partially Paid' : 'Unpaid'),
            payment_date: paymentReport.payment_date ? new Date(paymentReport.payment_date).toISOString() : new Date().toISOString(),
            payment_method: paymentReport.payment_method,
            transaction_id: paymentReport.transaction_id,
            attachment_url,
            updated_at: new Date().toISOString()
          },
          raised_by: session.role,
          status: 'Pending'
        }]);

      if (error) throw error;
      
      setPaymentReport({
        billing_month: (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })(),
        amount_paid: maintenanceAmount.toString(),
        payment_method: 'UPI',
        transaction_id: '',
        payment_date: new Date().toISOString().split('T')[0]
      });
      setPaymentAttachment(null);
      setPaymentAttachmentPreview(null);
      setPaymentReportMessage({ type: 'success', text: 'Payment report submitted for admin approval!' });
      fetchResidentData();
    } catch (err) {
      setPaymentReportMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingPaymentReport(false);
    }
  };

  // Format month string e.g. "2026-07" to "July 2026"
  const formatMonthName = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  };

  // Group flats by floor for the building map
  const floors = {};
  for (let floor = 0; floor <= 4; floor++) {
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
            Flat {flatNo}
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
      <aside className={`sidebar glass-panel ${isMobileMenuOpen ? 'open' : ''}`}>
        {/* Mobile menu close button */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="sidebar-close-btn"
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="sidebar-header">
          <img 
            src="/building_header.png" 
            alt="Building Outline" 
          />
          <div>
            <h2>
              Flat {flatNo}
            </h2>
            <p>
              {session.role === 'owner' ? 'Owner' : 'Tenant'}
            </p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            onClick={() => handleTabChange('overview')}
            className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            My Flat
          </button>
          <button
            onClick={() => handleTabChange('map')}
            className={`btn ${activeTab === 'map' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="9" rx="1"></rect>
              <rect x="14" y="3" width="7" height="5" rx="1"></rect>
              <rect x="14" y="12" width="7" height="9" rx="1"></rect>
              <rect x="3" y="16" width="7" height="5" rx="1"></rect>
            </svg>
            Flats
          </button>
          <button
            onClick={() => handleTabChange('payments')}
            className={`btn ${activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 3h12M6 8h12M6 13h8.5a4.5 4.5 0 0 0 0-9H6M6 13h3L18 21" />
            </svg>
            Payments
          </button>
          <button
            onClick={() => handleTabChange('notices')}
            className={`btn ${activeTab === 'notices' ? 'btn-primary' : 'btn-secondary'}`}
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
            onClick={() => handleTabChange('complaints')}
            className={`btn ${activeTab === 'complaints' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Complaints
          </button>
          <button
            onClick={() => handleTabChange('approvals')}
            className={`btn ${activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
            </svg>
            Approvals
          </button>
          <button
            onClick={() => handleTabChange('contacts')}
            className={`btn ${activeTab === 'contacts' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Contacts Directory
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            onClick={onLogout}
            className="btn btn-secondary logout-btn"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {loading ? (
          <div className="flex-center" style={{ height: '70vh', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
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
                    <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)', margin: 0 }}>
                        Flat Information
                      </h3>
                      {session.role === 'owner' && !isEditingInfo && !isTransferringOwnership && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                            onClick={() => {
                              setEditedDetails({
                                owner_name: flatDetails.owner_name || '',
                                phone_number: flatDetails.phone_number || '',
                                email: flatDetails.email || '',
                                is_vacant: flatDetails.is_vacant ?? true,
                                is_owner_occupied: flatDetails.is_owner_occupied ?? true,
                                tenant_name: flatDetails.tenant_name || '',
                                tenant_phone: flatDetails.tenant_phone || '',
                                tenant_email: flatDetails.tenant_email || '',
                                occupancy_from: flatDetails.occupancy_from || ''
                              });
                              setIsEditingInfo(true);
                            }}
                          >
                            Edit Details
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                            onClick={() => {
                              setTransferForm({
                                new_owner_name: '',
                                new_owner_phone: '',
                                new_owner_email: '',
                                new_owner_password: ''
                              });
                              setIsTransferringOwnership(true);
                            }}
                          >
                            Transfer Ownership
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditingInfo ? (
                      <form onSubmit={handleSaveFlatInfo}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                          <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem' }}>Owner Name</label>
                            <input
                              type="text"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={editedDetails.owner_name}
                              onChange={(e) => setEditedDetails({ ...editedDetails, owner_name: e.target.value })}
                            />
                          </div>
                          <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem' }}>Owner Phone</label>
                            <input
                              type="text"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={editedDetails.phone_number}
                              onChange={(e) => setEditedDetails({ ...editedDetails, phone_number: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: '1rem' }}>
                          <label style={{ fontSize: '0.8rem' }}>Owner Email</label>
                          <input
                            type="email"
                            className="input-field"
                            style={{ padding: '0.5rem' }}
                            value={editedDetails.email}
                            onChange={(e) => setEditedDetails({ ...editedDetails, email: e.target.value })}
                          />
                        </div>

                        <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                          <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Occupancy Status</label>
                          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="occupancy_status"
                                checked={editedDetails.is_vacant === true}
                                onChange={() => setEditedDetails({ ...editedDetails, is_vacant: true, is_owner_occupied: true })}
                                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                              />
                              Vacant
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="occupancy_status"
                                checked={editedDetails.is_vacant === false && editedDetails.is_owner_occupied === true}
                                onChange={() => setEditedDetails({ ...editedDetails, is_vacant: false, is_owner_occupied: true })}
                                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                              />
                              Occupied by Owner
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="occupancy_status"
                                checked={editedDetails.is_vacant === false && editedDetails.is_owner_occupied === false}
                                onChange={() => setEditedDetails({ ...editedDetails, is_vacant: false, is_owner_occupied: false })}
                                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                              />
                              Rented out to Tenant
                            </label>
                          </div>
                        </div>

                        {/* Owner Occupied Date */}
                        {!editedDetails.is_vacant && editedDetails.is_owner_occupied && (
                          <div className="input-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.8rem' }}>Occupied Since Date</label>
                            <input
                              type="date"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={editedDetails.occupancy_from || ''}
                              onChange={(e) => setEditedDetails({ ...editedDetails, occupancy_from: e.target.value })}
                              required
                            />
                          </div>
                        )}

                        {/* Rented Out Tenant details */}
                        {!editedDetails.is_vacant && !editedDetails.is_owner_occupied && (
                          <fieldset style={{ border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', background: 'rgba(255,255,255,0.01)' }}>
                            <legend style={{ fontSize: '0.75rem', color: 'var(--primary)', padding: '0 0.5rem', fontWeight: 'bold' }}>Tenant Details</legend>
                            
                            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                              <label style={{ fontSize: '0.8rem' }}>Tenant Name</label>
                              <input
                                type="text"
                                className="input-field"
                                style={{ padding: '0.5rem' }}
                                value={editedDetails.tenant_name || ''}
                                onChange={(e) => setEditedDetails({ ...editedDetails, tenant_name: e.target.value })}
                                required
                                placeholder="Enter tenant's full name"
                              />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.8rem' }}>Tenant Phone</label>
                                <input
                                  type="text"
                                  className="input-field"
                                  style={{ padding: '0.5rem' }}
                                  value={editedDetails.tenant_phone || ''}
                                  onChange={(e) => setEditedDetails({ ...editedDetails, tenant_phone: e.target.value })}
                                  required
                                  placeholder="Enter phone number"
                                />
                              </div>
                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.8rem' }}>Tenant Email (Optional)</label>
                                <input
                                  type="email"
                                  className="input-field"
                                  style={{ padding: '0.5rem' }}
                                  value={editedDetails.tenant_email || ''}
                                  onChange={(e) => setEditedDetails({ ...editedDetails, tenant_email: e.target.value })}
                                  placeholder="Enter email address"
                                />
                              </div>
                            </div>

                            <div className="input-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.8rem' }}>Occupied Since Date</label>
                              <input
                                type="date"
                                className="input-field"
                                style={{ padding: '0.5rem' }}
                                value={editedDetails.occupancy_from || ''}
                                onChange={(e) => setEditedDetails({ ...editedDetails, occupancy_from: e.target.value })}
                                required
                              />
                            </div>
                          </fieldset>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', flex: '1 1 auto' }} onClick={() => setIsEditingInfo(false)}>
                            Cancel
                          </button>
                          <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', flex: '1 1 auto' }}>
                            Save Details
                          </button>
                        </div>
                      </form>
                    ) : isTransferringOwnership ? (
                      <form onSubmit={handleTransferOwnership}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                          Provide details of the buyer/new owner. Once approved by the admin, ownership will be transferred, the flat occupancy will be reset to vacant, and your access credentials will be replaced.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                          <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                            <label htmlFor="new-owner-name" style={{ fontSize: '0.85rem' }}>New Owner Name</label>
                            <input
                              id="new-owner-name"
                              type="text"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={transferForm.new_owner_name}
                              onChange={(e) => setTransferForm({ ...transferForm, new_owner_name: e.target.value })}
                              required
                              placeholder="Full name of buyer"
                            />
                          </div>
                          <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                            <label htmlFor="new-owner-phone" style={{ fontSize: '0.85rem' }}>New Owner Phone</label>
                            <input
                              id="new-owner-phone"
                              type="text"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={transferForm.new_owner_phone}
                              onChange={(e) => setTransferForm({ ...transferForm, new_owner_phone: e.target.value })}
                              required
                              placeholder="Phone number"
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                          <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                            <label htmlFor="new-owner-email" style={{ fontSize: '0.85rem' }}>New Owner Email (Optional)</label>
                            <input
                              id="new-owner-email"
                              type="email"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={transferForm.new_owner_email}
                              onChange={(e) => setTransferForm({ ...transferForm, new_owner_email: e.target.value })}
                              placeholder="Email address"
                            />
                          </div>
                          <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                            <label htmlFor="new-owner-password" style={{ fontSize: '0.85rem' }}>New Owner Login Password</label>
                            <input
                              id="new-owner-password"
                              type="text"
                              className="input-field"
                              style={{ padding: '0.5rem' }}
                              value={transferForm.new_owner_password}
                              onChange={(e) => setTransferForm({ ...transferForm, new_owner_password: e.target.value })}
                              required
                              placeholder="Temporary password"
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', flex: '1 1 auto' }} onClick={() => setIsTransferringOwnership(false)}>
                            Cancel
                          </button>
                          <button type="submit" className="btn btn-danger" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', flex: '1 1 auto' }}>
                            Submit Transfer
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.95rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Owner Name:</span>
                        <span style={{ fontWeight: '500', wordBreak: 'break-word' }}>{flatDetails.owner_name || 'Not updated'}</span>

                        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Owner Contact:</span>
                        <span style={{ wordBreak: 'break-word' }}>{flatDetails.phone_number || flatDetails.email ? `${flatDetails.phone_number || ''} ${flatDetails.email ? `(${flatDetails.email})` : ''}`.trim() : 'Not updated'}</span>

                        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status:</span>
                        <div>
                          <span className={`badge ${flatDetails.is_vacant ? 'badge-vacant' : 'badge-occupied'}`}>
                            {flatDetails.is_vacant 
                              ? 'Vacant' 
                              : (flatDetails.is_owner_occupied ? 'Owner Occupied' : 'Rented Out')}
                          </span>
                        </div>

                        {!flatDetails.is_vacant && flatDetails.is_owner_occupied && (
                          <>
                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Occupied Since:</span>
                            <span>{flatDetails.occupancy_from ? new Date(flatDetails.occupancy_from).toLocaleDateString() : 'Not set'}</span>
                          </>
                        )}

                        {!flatDetails.is_vacant && !flatDetails.is_owner_occupied && (
                          <>
                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Occupied Since:</span>
                            <span>{flatDetails.occupancy_from ? new Date(flatDetails.occupancy_from).toLocaleDateString() : 'Not set'}</span>

                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Tenant Name:</span>
                            <span style={{ fontWeight: '500', wordBreak: 'break-word' }}>{flatDetails.tenant_name || 'Not updated'}</span>

                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Tenant Phone:</span>
                            <span>{flatDetails.tenant_phone || 'Not updated'}</span>

                            {flatDetails.tenant_email && (
                              <>
                                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Tenant Email:</span>
                                <span style={{ wordBreak: 'break-all' }}>{flatDetails.tenant_email}</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
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

                {/* Past Tenant History Panel (Owner Only) */}
                {session.role === 'owner' && (() => {
                  const displayHistory = [];
                  if (!flatDetails.is_vacant && !flatDetails.is_owner_occupied && flatDetails.tenant_name) {
                    displayHistory.push({
                      id: 'current-tenant',
                      tenant_name: flatDetails.tenant_name,
                      tenant_phone: flatDetails.tenant_phone,
                      tenant_email: flatDetails.tenant_email,
                      occupied_from: flatDetails.occupancy_from,
                      occupied_to: 'Present'
                    });
                  }
                  const allHistory = [...displayHistory, ...tenantHistory];

                  return (
                    <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                      <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--primary)' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                        </svg>
                        Tenant History
                      </h3>

                      {allHistory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0', fontSize: '0.9rem' }}>No tenant records found for this flat.</p>
                      ) : (
                        <>
                          {/* Desktop table */}
                          <div className="desktop-only" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Tenant Name</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Phone Number</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Email</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Occupied From</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Occupied To</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allHistory.map(history => (
                                  <tr key={history.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      {history.tenant_name}
                                      {history.occupied_to === 'Present' && <span className="badge badge-paid" style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px' }}>Current</span>}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{history.tenant_phone || '-'}</td>
                                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{history.tenant_email || '-'}</td>
                                    <td style={{ padding: '0.75rem 0.5rem' }}>{history.occupied_from ? new Date(history.occupied_from).toLocaleDateString() : '-'}</td>
                                    <td style={{ padding: '0.75rem 0.5rem' }}>
                                      {history.occupied_to === 'Present' ? <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Present</span> : (history.occupied_to ? new Date(history.occupied_to).toLocaleDateString() : '-')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile cards */}
                          <div className="mobile-only" style={{ display: 'none', flexDirection: 'column', gap: '0.75rem' }}>
                            {allHistory.map(history => (
                              <div key={history.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.9rem', border: '1px solid var(--glass-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{history.tenant_name}</span>
                                  {history.occupied_to === 'Present' && <span className="badge badge-paid" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>Current</span>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.83rem' }}>
                                  <div style={{ color: 'var(--text-secondary)' }}>Phone</div>
                                  <div>{history.tenant_phone || '-'}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Email</div>
                                  <div style={{ wordBreak: 'break-all' }}>{history.tenant_email || '-'}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>From</div>
                                  <div>{history.occupied_from ? new Date(history.occupied_from).toLocaleDateString() : '-'}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>To</div>
                                  <div>
                                    {history.occupied_to === 'Present' ? <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Present</span> : (history.occupied_to ? new Date(history.occupied_to).toLocaleDateString() : '-')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Past Owner History Panel (Owner Only) */}
                {session.role === 'owner' && (() => {
                  const displayOwnerHistory = [];
                  if (flatDetails.owner_name) {
                    displayOwnerHistory.push({
                      id: 'current-owner',
                      owner_name: flatDetails.owner_name,
                      phone_number: flatDetails.phone_number,
                      email: flatDetails.email,
                      transferred_at: 'Present'
                    });
                  }
                  const allOwnerHistory = [...displayOwnerHistory, ...ownerHistory];

                  return (
                    <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                      <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--primary)' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Owner History
                      </h3>

                      {allOwnerHistory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0', fontSize: '0.9rem' }}>No owner records found for this flat.</p>
                      ) : (
                        <>
                          {/* Desktop table */}
                          <div className="desktop-only" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Owner Name</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Phone Number</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Email</th>
                                  <th style={{ padding: '0.75rem 0.5rem' }}>Transferred At / Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allOwnerHistory.map(history => (
                                  <tr key={history.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      {history.owner_name}
                                      {history.transferred_at === 'Present' && <span className="badge badge-paid" style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px' }}>Current</span>}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{history.phone_number || '-'}</td>
                                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{history.email || '-'}</td>
                                    <td style={{ padding: '0.75rem 0.5rem' }}>
                                      {history.transferred_at === 'Present' ? <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Current Owner</span> : (history.transferred_at ? new Date(history.transferred_at).toLocaleString() : '-')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile cards */}
                          <div className="mobile-only" style={{ display: 'none', flexDirection: 'column', gap: '0.75rem' }}>
                            {allOwnerHistory.map(history => (
                              <div key={history.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.9rem', border: '1px solid var(--glass-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{history.owner_name}</span>
                                  {history.transferred_at === 'Present' && <span className="badge badge-paid" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>Current</span>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.83rem' }}>
                                  <div style={{ color: 'var(--text-secondary)' }}>Phone</div>
                                  <div>{history.phone_number || '-'}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Email</div>
                                  <div style={{ wordBreak: 'break-all' }}>{history.email || '-'}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Status</div>
                                  <div>
                                    {history.transferred_at === 'Present' ? <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Current Owner</span> : (history.transferred_at ? new Date(history.transferred_at).toLocaleString() : '-')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

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

            {activeTab === 'payments' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Maintenance Payments</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>View your maintenance dues and report new payments</p>
                </div>

                <div className="grid-split-2-1">
                  {/* Payment History */}
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Payment History</h3>

                    {payments.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No payment records found.</p>
                    ) : (
                      <>
                        {/* Desktop table */}
                        <div className="desktop-only" style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '520px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                <th style={{ padding: '0.75rem' }}>Month</th>
                                <th style={{ padding: '0.75rem' }}>Status</th>
                                <th style={{ padding: '0.75rem' }}>Due</th>
                                <th style={{ padding: '0.75rem' }}>Paid</th>
                                <th style={{ padding: '0.75rem' }}>Date</th>
                                <th style={{ padding: '0.75rem' }}>Method</th>
                                <th style={{ padding: '0.75rem' }}>Txn ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {payments.map(record => {
                                const date = record.payment_date ? new Date(record.payment_date).toLocaleDateString() : '-';
                                return (
                                  <tr key={record.billing_month} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{formatMonthName(record.billing_month)}</td>
                                    <td style={{ padding: '0.75rem' }}>
                                      <span className={`badge ${record.payment_status === 'Paid' ? 'badge-paid' : record.payment_status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid'}`}>
                                        {record.payment_status}
                                      </span>
                                    </td>
                                    <td style={{ padding: '0.75rem' }}>&#8377;{record.amount_due}</td>
                                    <td style={{ padding: '0.75rem', color: 'var(--success)' }}>&#8377;{record.amount_paid}</td>
                                    <td style={{ padding: '0.75rem' }}>{date}</td>
                                    <td style={{ padding: '0.75rem' }}>
                                      {record.payment_method || '-'}
                                      {(() => {
                                        const { data: rd } = supabase.storage.from('payment-attachments').getPublicUrl(`${flatNo}/${record.billing_month}`);
                                        return rd?.publicUrl ? (
                                          <a href={rd.publicUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '0.5rem', color: 'var(--primary)' }} title="View Receipt">
                                            📎
                                          </a>
                                        ) : null;
                                      })()}
                                    </td>
                                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{record.transaction_id || '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="mobile-only" style={{ display: 'none', flexDirection: 'column', gap: '0.75rem' }}>
                          {payments.map(record => {
                            const date = record.payment_date ? new Date(record.payment_date).toLocaleDateString() : '-';
                            const statusClass = record.payment_status === 'Paid' ? 'badge-paid' : record.payment_status === 'Partially Paid' ? 'badge-partial' : 'badge-unpaid';
                            return (
                              <div key={record.billing_month} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--glass-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                  <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{formatMonthName(record.billing_month)}</span>
                                  <span className={`badge ${statusClass}`}>{record.payment_status}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.85rem' }}>
                                  <div style={{ color: 'var(--text-secondary)' }}>Amount Due</div>
                                  <div style={{ fontWeight: '600' }}>&#8377;{record.amount_due}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Amount Paid</div>
                                  <div style={{ color: 'var(--success)', fontWeight: '600' }}>&#8377;{record.amount_paid}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Payment Date</div>
                                  <div>{date}</div>
                                  <div style={{ color: 'var(--text-secondary)' }}>Method</div>
                                  <div>
                                    {record.payment_method || '-'}
                                    {(() => {
                                      const { data: rd } = supabase.storage.from('payment-attachments').getPublicUrl(`${flatNo}/${record.billing_month}`);
                                      return rd?.publicUrl ? (
                                        <a href={rd.publicUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '0.5rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                          📎 Receipt
                                        </a>
                                      ) : null;
                                    })()}
                                  </div>
                                  {record.transaction_id && (
                                    <>
                                      <div style={{ color: 'var(--text-secondary)' }}>Txn ID</div>
                                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{record.transaction_id}</div>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Report Payment Form */}
                  <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', color: 'var(--secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                      Report Payment
                    </h3>

                    {paymentReportMessage.text && (
                      <div style={{
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        background: paymentReportMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: paymentReportMessage.type === 'success' ? '#34d399' : '#f87171',
                        border: paymentReportMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                      }}>
                        {paymentReportMessage.text}
                      </div>
                    )}

                    <form onSubmit={handleReportPayment}>
                      <div className="input-group">
                        <label style={{ fontSize: '0.85rem' }}>Billing Month</label>
                        <input
                          type="month"
                          className="input-field"
                          required
                          value={paymentReport.billing_month}
                          onChange={(e) => setPaymentReport({ ...paymentReport, billing_month: e.target.value })}
                        />
                      </div>

                      <div className="input-group">
                        <label style={{ fontSize: '0.85rem' }}>Amount Paid (₹)</label>
                        <input
                          type="number"
                          className="input-field"
                          required
                          min="0"
                          value={paymentReport.amount_paid}
                          onChange={(e) => setPaymentReport({ ...paymentReport, amount_paid: e.target.value })}
                        />
                      </div>

                      <div className="input-group">
                        <label style={{ fontSize: '0.85rem' }}>Payment Date</label>
                        <input
                          type="date"
                          className="input-field"
                          required
                          value={paymentReport.payment_date}
                          onChange={(e) => setPaymentReport({ ...paymentReport, payment_date: e.target.value })}
                        />
                      </div>

                      <div className="input-group">
                        <label style={{ fontSize: '0.85rem' }}>Payment Method</label>
                        <select
                          className="input-field"
                          value={paymentReport.payment_method}
                          onChange={(e) => setPaymentReport({ ...paymentReport, payment_method: e.target.value })}
                          style={{ appearance: 'none', background: 'rgba(255,255,255,0.03) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 12px center' }}
                        >
                          <option value="UPI" style={{ background: 'var(--bg-secondary)', color: 'white' }}>UPI</option>
                          <option value="Bank Transfer" style={{ background: 'var(--bg-secondary)', color: 'white' }}>Bank Transfer</option>
                          <option value="Cash" style={{ background: 'var(--bg-secondary)', color: 'white' }}>Cash</option>
                        </select>
                      </div>

                      <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.85rem' }}>Transaction / Ref ID</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. TXN1827364"
                          value={paymentReport.transaction_id}
                          onChange={(e) => setPaymentReport({ ...paymentReport, transaction_id: e.target.value })}
                        />
                      </div>

                      {/* Attachment Upload */}
                      <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>Payment Proof / Screenshot</label>
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                          onDragLeave={() => setIsDraggingOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingOver(false);
                            const file = e.dataTransfer.files[0];
                            if (file) handlePaymentAttachmentFile(file);
                          }}
                          onClick={() => document.getElementById('payment-attachment-input').click()}
                          style={{
                            border: `2px dashed ${isDraggingOver ? 'var(--primary)' : 'var(--glass-border)'}`,
                            borderRadius: '10px',
                            padding: '1.5rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: isDraggingOver ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {paymentAttachmentPreview ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <img
                                src={paymentAttachmentPreview}
                                alt="Payment proof preview"
                                style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain' }}
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setPaymentAttachment(null); setPaymentAttachmentPreview(null); }}
                                style={{
                                  position: 'absolute', top: '-8px', right: '-8px',
                                  background: 'var(--error, #ef4444)', border: 'none', borderRadius: '50%',
                                  width: '22px', height: '22px', cursor: 'pointer', color: 'white',
                                  fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                              >✕</button>
                            </div>
                          ) : paymentAttachment ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                              <svg width="32" height="32" fill="none" stroke="var(--primary)" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>{paymentAttachment.name}</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setPaymentAttachment(null); setPaymentAttachmentPreview(null); }}
                                style={{ fontSize: '0.75rem', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                              <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                              </svg>
                              <span style={{ fontSize: '0.85rem' }}>Drag & drop your screenshot here</span>
                              <span style={{ fontSize: '0.78rem' }}>or <span style={{ color: 'var(--primary)', fontWeight: '600' }}>click to browse</span></span>
                              <span style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>JPG, PNG, GIF, WEBP, PDF</span>
                            </div>
                          )}
                        </div>
                        <input
                          id="payment-attachment-input"
                          type="file"
                          accept="image/*,application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => { const file = e.target.files[0]; if (file) handlePaymentAttachmentFile(file); }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submittingPaymentReport}
                        style={{ width: '100%', padding: '0.75rem' }}
                      >
                        {submittingPaymentReport ? 'Uploading & Reporting...' : 'Submit Payment Details'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* BUILDING MAP TAB */}
            {activeTab === 'map' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>Building Map & Occupancy</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>View the occupancy status of all flats in Megha Maanay Homes</p>
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
                          const isSelf = flat.flat_no === flatNo;
                          return (
                            <div
                              key={flat.flat_no}
                              className={`glass-panel flat-card ${flat.is_vacant ? 'vacant' : 'occupied'}`}
                              style={{
                                cursor: 'default',
                                border: isSelf ? '2.5px solid var(--primary)' : undefined,
                                boxShadow: isSelf ? '0 0 15px rgba(99, 102, 241, 0.4)' : undefined
                              }}
                            >
                              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {flat.flat_no}
                                {isSelf && (
                                  <span style={{ fontSize: '0.6rem', background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>My Flat</span>
                                )}
                              </span>
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
                    Suggest a Contact
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
                          <h3 style={{ fontSize: '1.15rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>{c.name}</h3>
                          
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

                      <h2 style={{ marginBottom: '0.5rem', fontSize: '1.4rem' }}>Suggest a Contact</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Your suggestion will be reviewed by the admin before it appears in the directory.</p>

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
                            {submittingContact ? 'Submitting...' : 'Submit for Approval'}
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
            {/* APPROVALS TAB */}
            {activeTab === 'approvals' && (
              <div>
                <div className="mb-4">
                  <h1 style={{ fontSize: '1.75rem' }}>My Approvals</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Track the status of your flat update requests and reported payments</p>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  {approvals.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No approval requests submitted yet.</p>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="desktop-only" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              <th style={{ padding: '0.75rem' }}>Date Raised</th>
                              <th style={{ padding: '0.75rem' }}>Request Type</th>
                              <th style={{ padding: '0.75rem' }}>Raised By</th>
                              <th style={{ padding: '0.75rem' }}>Status</th>
                              <th style={{ padding: '0.75rem' }}>Details</th>
                              <th style={{ padding: '0.75rem' }}>Admin Comments</th>
                            </tr>
                          </thead>
                          <tbody>
                            {approvals.map(req => {
                              const date = new Date(req.created_at).toLocaleString();
                              const typeLabel = req.request_type === 'occupancy_change' ? 'Occupancy/Tenant Update' : req.request_type === 'ownership_transfer' ? 'Ownership Transfer' : req.request_type === 'contact_suggestion' ? 'Contact Suggestion' : 'Payment Report';
                              const statusBadgeClass = req.status === 'Approved' ? 'badge-paid' : req.status === 'Rejected' ? 'badge-unpaid' : 'badge-partial';
                              let detailsStr = '';
                              if (req.request_type === 'occupancy_change') {
                                const d = req.details || {};
                                detailsStr = `Status: ${d.is_vacant ? 'Vacant' : (d.is_owner_occupied ? 'Owner Occupied' : 'Rented Out')} | Owner: ${d.owner_name || 'N/A'}${d.tenant_name ? `, Tenant: ${d.tenant_name}` : ''}`;
                              } else if (req.request_type === 'ownership_transfer') {
                                const d = req.details || {};
                                detailsStr = `New Owner: ${d.new_owner_name || 'N/A'} (Phone: ${d.new_owner_phone || 'N/A'})`;
                              } else if (req.request_type === 'contact_suggestion') {
                                const d = req.details || {};
                                detailsStr = `${d.name || 'N/A'} · ${d.phone_number || 'N/A'}`;
                              } else if (req.request_type === 'payment_report') {
                                const d = req.details || {};
                                detailsStr = `Month: ${d.billing_month} | Paid: ₹${d.amount_paid} via ${d.payment_method}`;
                              }
                              return (
                                <tr key={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                                  <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{date}</td>
                                  <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{typeLabel}</td>
                                  <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{req.raised_by}</td>
                                  <td style={{ padding: '0.75rem' }}><span className={`badge ${statusBadgeClass}`}>{req.status}</span></td>
                                  <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailsStr}</td>
                                  <td style={{ padding: '0.75rem', color: req.status === 'Rejected' ? 'var(--accent)' : 'var(--text-secondary)' }}>{req.admin_comments || '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile cards */}
                      <div className="mobile-only" style={{ display: 'none', flexDirection: 'column', gap: '0.85rem' }}>
                        {approvals.map(req => {
                          const date = new Date(req.created_at).toLocaleString();
                          const typeLabel = req.request_type === 'occupancy_change' ? 'Occupancy/Tenant Update' : req.request_type === 'ownership_transfer' ? 'Ownership Transfer' : req.request_type === 'contact_suggestion' ? 'Contact Suggestion' : 'Payment Report';
                          const statusBadgeClass = req.status === 'Approved' ? 'badge-paid' : req.status === 'Rejected' ? 'badge-unpaid' : 'badge-partial';
                          let detailLines = [];
                          if (req.request_type === 'occupancy_change') {
                            const d = req.details || {};
                            const occStatus = d.is_vacant ? 'Vacant' : (d.is_owner_occupied ? 'Owner Occupied' : 'Rented Out');
                            detailLines = [
                              ['Occupancy', occStatus],
                              ['Owner', d.owner_name || 'N/A'],
                              ...(d.tenant_name ? [['Tenant', d.tenant_name]] : [])
                            ];
                          } else if (req.request_type === 'ownership_transfer') {
                            const d = req.details || {};
                            detailLines = [
                              ['New Owner', d.new_owner_name || 'N/A'],
                              ['Phone', d.new_owner_phone || 'N/A'],
                              ...(d.new_owner_email ? [['Email', d.new_owner_email]] : [])
                            ];
                          } else if (req.request_type === 'contact_suggestion') {
                            const d = req.details || {};
                            detailLines = [
                              ['Name', d.name || 'N/A'],
                              ['Phone', d.phone_number || 'N/A'],
                              ...(d.details ? [['Notes', d.details]] : [])
                            ];
                          } else if (req.request_type === 'payment_report') {
                            const d = req.details || {};
                            detailLines = [
                              ['Month', d.billing_month],
                              ['Paid', `₹${d.amount_paid}`],
                              ['Method', d.payment_method]
                            ];
                          }
                          return (
                            <div key={req.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--glass-border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', gap: '0.5rem' }}>
                                <div>
                                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{typeLabel}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{date}</div>
                                </div>
                                <span className={`badge ${statusBadgeClass}`} style={{ flexShrink: 0 }}>{req.status}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.83rem', marginTop: '0.5rem' }}>
                                <div style={{ color: 'var(--text-secondary)' }}>Raised By</div>
                                <div style={{ textTransform: 'capitalize' }}>{req.raised_by}</div>
                                {detailLines.map(([label, val]) => (
                                  <>
                                    <div key={label + '-l'} style={{ color: 'var(--text-secondary)' }}>{label}</div>
                                    <div key={label + '-v'}>{val}</div>
                                  </>
                                ))}
                                {req.admin_comments && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)' }}>Admin Note</div>
                                    <div style={{ color: req.status === 'Rejected' ? 'var(--accent)' : 'inherit' }}>{req.admin_comments}</div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
