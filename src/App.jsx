import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import ResidentDashboard from './components/ResidentDashboard';
import './index.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const savedSession = localStorage.getItem('mmh_session');
    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession));
      } catch (e) {
        console.error('Failed to parse saved session', e);
        localStorage.removeItem('mmh_session');
      }
    }
    setInitializing(false);
  }, []);

  const handleLoginSuccess = (sessionData) => {
    setSession(sessionData);
  };

  const handleLogout = () => {
    localStorage.removeItem('mmh_session');
    setSession(null);
  };

  if (initializing) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Initializing...</p>
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
