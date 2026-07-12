import React, { useState, useEffect, useRef } from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import ResidentDashboard from './components/ResidentDashboard';
import { supabase } from './supabase';
import './index.css';

// How often (ms) to check if an admin's session_version is still valid.
// This ensures a password change forces logout across all open tabs/browsers.
const SESSION_CHECK_INTERVAL_MS = 30_000; // 30 seconds

export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const sessionCheckRef = useRef(null);

  // ----- Helpers -----

  const clearSession = () => {
    localStorage.removeItem('mmh_session');
    setSession(null);
  };

  /**
   * For admin sessions, verify the stored session_version still matches
   * what's in the DB. If someone changed the password, session_version
   * will have been incremented, and any older session is forced out.
   */
  const verifyAdminSession = async (savedSession) => {
    if (savedSession?.role !== 'admin') return true; // residents don't use session_version

    try {
      const { data, error } = await supabase
        .from('admins')
        .select('session_version, is_active')
        .eq('username', savedSession.username)
        .maybeSingle();

      // If the column doesn't exist yet (migration not run), or any DB error,
      // just verify the user exists by username — don't invalidate the session.
      if (error) {
        if (error.code === '42703') {
          // "column does not exist" — fall back to just checking the user exists
          const { data: exists } = await supabase
            .from('admins')
            .select('username')
            .eq('username', savedSession.username)
            .maybeSingle();
          return !!exists;
        }
        // Any other DB error — assume valid rather than logging everyone out
        return true;
      }

      if (!data) return false; // username not found in DB

      // Deactivated accounts are always invalid
      if (data.is_active === false) return false;

      const dbVersion = data.session_version ?? 1;
      const storedVersion = savedSession.session_version ?? 1;
      return dbVersion === storedVersion;
    } catch {
      // Network error — assume valid rather than logging everyone out
      return true;
    }
  };

  // ----- Boot -----

  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem('mmh_session');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const valid = await verifyAdminSession(parsed);
          if (valid) {
            setSession(parsed);
          } else {
            localStorage.removeItem('mmh_session');
          }
        } catch {
          localStorage.removeItem('mmh_session');
        }
      }
      setInitializing(false);
    };
    init();
  }, []);

  // ----- Periodic session-version poll for admin sessions -----

  useEffect(() => {
    if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);

    if (session?.role === 'admin') {
      sessionCheckRef.current = setInterval(async () => {
        const raw = localStorage.getItem('mmh_session');
        if (!raw) { clearSession(); return; }

        try {
          const parsed = JSON.parse(raw);
          const valid = await verifyAdminSession(parsed);
          if (!valid) clearSession();
        } catch {
          clearSession();
        }
      }, SESSION_CHECK_INTERVAL_MS);
    }

    return () => {
      if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
    };
  }, [session]);

  // ----- Callbacks passed to children -----

  const handleLoginSuccess = (sessionData) => {
    setSession(sessionData);
  };

  const handleLogout = () => {
    clearSession();
  };

  // ----- Render -----

  if (initializing) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Initializing...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (session.role === 'admin') {
    return <AdminDashboard session={session} onLogout={handleLogout} />;
  }

  if (session.role === 'owner' || session.role === 'tenant') {
    return <ResidentDashboard session={session} onLogout={handleLogout} />;
  }

  // Fallback
  return <Login onLoginSuccess={handleLoginSuccess} />;
}
