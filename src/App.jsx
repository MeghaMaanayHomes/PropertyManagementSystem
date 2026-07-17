import React, { useState, useEffect, useRef } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from 'react-router-dom';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import ResidentDashboard from './components/ResidentDashboard';
import UpdateDetector from './components/UpdateDetector';
import { supabase } from './supabase';
import './index.css';

const SESSION_CHECK_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Valid tab slugs per role — used to reject unknown paths
// ---------------------------------------------------------------------------
const ADMIN_TABS = ['flats', 'ledger', 'expenses'];
const RESIDENT_TABS = ['map', 'payments'];

// ---------------------------------------------------------------------------
// Session verification helper (extracted so it can be used anywhere)
// ---------------------------------------------------------------------------
async function verifyAdminSession(savedSession) {
  if (savedSession?.role !== 'admin') return true;
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('session_version, is_active')
      .eq('username', savedSession.username)
      .maybeSingle();

    if (error) {
      if (error.code === '42703') {
        const { data: exists } = await supabase
          .from('admins').select('username').eq('username', savedSession.username).maybeSingle();
        return !!exists;
      }
      return true;
    }
    if (!data) return false;
    if (data.is_active === false) return false;
    return (data.session_version ?? 1) === (savedSession.session_version ?? 1);
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Root component — owns session state, renders router
// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const sessionCheckRef = useRef(null);

  const clearSession = () => {
    localStorage.removeItem('mmh_session');
    setSession(null);
  };

  // Boot — restore session from localStorage
  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem('mmh_session');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const valid = await verifyAdminSession(parsed);
          if (valid) setSession(parsed);
          else localStorage.removeItem('mmh_session');
        } catch {
          localStorage.removeItem('mmh_session');
        }
      }
      setInitializing(false);
    };
    init();
  }, []);

  // Periodic session-version poll for admin sessions
  useEffect(() => {
    if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
    if (session?.role === 'admin') {
      sessionCheckRef.current = setInterval(async () => {
        const raw = localStorage.getItem('mmh_session');
        if (!raw) { clearSession(); return; }
        try {
          const parsed = JSON.parse(raw);
          if (!await verifyAdminSession(parsed)) clearSession();
        } catch { clearSession(); }
      }, SESSION_CHECK_INTERVAL_MS);
    }
    return () => { if (sessionCheckRef.current) clearInterval(sessionCheckRef.current); };
  }, [session]);

  const handleLoginSuccess = (sessionData) => setSession(sessionData);
  const handleLogout = () => clearSession();

  if (initializing) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Initializing...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <UpdateDetector />
      <BrowserRouter>
        <Routes>
          {/* Login */}
          <Route
            path="/login"
            element={
              session
                ? <Navigate to="/overview" replace />
                : <Login onLoginSuccess={handleLoginSuccess} />
            }
          />

          {/* Admin tabs */}
          {ADMIN_TABS.map(tab => (
            <Route
              key={`admin-${tab}`}
              path={`/${tab}`}
              element={
                !session
                  ? <Navigate to="/login" replace />
                  : session.role === 'admin'
                    ? <AdminDashboard session={session} onLogout={handleLogout} initialTab={tab} />
                    : <Navigate to="/overview" replace />
              }
            />
          ))}

          {/* Resident-only tabs that don't overlap with admin */}
          {['map', 'payments'].map(tab => (
            <Route
              key={`resident-${tab}`}
              path={`/${tab}`}
              element={
                !session
                  ? <Navigate to="/login" replace />
                  : (session.role === 'owner' || session.role === 'tenant')
                    ? <ResidentDashboard session={session} onLogout={handleLogout} initialTab={tab} />
                    : <Navigate to="/overview" replace />
              }
            />
          ))}

          {/* Shared tab paths — route to correct dashboard by role */}
          {['overview', 'notices', 'complaints', 'approvals', 'contacts', 'settings'].map(tab => (
            <Route
              key={`shared-${tab}`}
              path={`/${tab}`}
              element={
                !session
                  ? <Navigate to="/login" replace />
                  : session.role === 'admin'
                    ? <AdminDashboard session={session} onLogout={handleLogout} initialTab={tab} />
                    : <ResidentDashboard session={session} onLogout={handleLogout} initialTab={tab} />
              }
            />
          ))}

          {/* Root redirect */}
          <Route
            path="/"
            element={<Navigate to={session ? '/overview' : '/login'} replace />}
          />

          {/* Catch-all */}
          <Route
            path="*"
            element={<Navigate to={session ? '/overview' : '/login'} replace />}
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}
