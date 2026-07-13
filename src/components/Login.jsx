import React, { useState } from 'react';
import { supabase } from '../supabase';

export default function Login({ onLoginSuccess }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [flatNo, setFlatNo] = useState('001');
  const [residentRole, setResidentRole] = useState('owner'); // 'owner' or 'tenant'
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Generate the 40 flat numbers (001-008 to 401-408)
  const flats = [];
  for (let floor = 0; floor <= 4; floor++) {
    for (let flat = 1; flat <= 8; flat++) {
      flats.push(`${floor}0${flat}`);
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isAdmin) {
        // Admin Login (now uses users table where is_admin = true)
        const { data, error: queryError } = await supabase
          .from('users')
          .select('*')
          .eq('username', username.trim().toLowerCase())
          .eq('password', password)
          .eq('is_admin', true)
          .maybeSingle();

        if (queryError) throw queryError;

        if (data) {
          if (data.is_active === false) {
            setError('This admin account has been deactivated. Contact another admin.');
            setLoading(false);
            return;
          }
          const sessionData = {
            role: 'admin',
            username: data.username,
            userId: data.id,
            session_version: data.session_version ?? 1,
          };
          localStorage.setItem('mmh_session', JSON.stringify(sessionData));
          onLoginSuccess(sessionData);
        } else {
          setError('Invalid admin credentials.');
        }
      } else {
        // Resident Login
        // 1. Fetch the flat to see which user ID is owner_id or tenant_id
        const { data: flatData, error: flatError } = await supabase
          .from('flats')
          .select('*')
          .eq('flat_no', flatNo)
          .maybeSingle();

        if (flatError) throw flatError;

        if (!flatData) {
          setError(`Flat ${flatNo} not found in database.`);
          setLoading(false);
          return;
        }

        const targetUserId = residentRole === 'owner' ? flatData.owner_id : flatData.tenant_id;
        if (!targetUserId) {
          setError(`No ${residentRole} is currently registered for Flat ${flatNo}.`);
          setLoading(false);
          return;
        }

        // 2. Fetch the target user and verify password
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', targetUserId)
          .eq('password', password)
          .maybeSingle();

        if (userError) throw userError;

        if (userData) {
          if (userData.is_active === false) {
            setError('Your account has been deactivated. Contact admin.');
            setLoading(false);
            return;
          }
          const sessionData = {
            role: residentRole,
            flatNo: flatNo,
            userId: userData.id,
            user: userData
          };
          localStorage.setItem('mmh_session', JSON.stringify(sessionData));
          onLoginSuccess(sessionData);
        } else {
          setError(`Invalid password for ${residentRole} of flat ${flatNo}.`);
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login. Please ensure database tables are set up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '100vh', padding: '1rem', width: '100%' }}>
      <div className="glass-panel glow-primary" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img 
            src="/logo.png" 
            alt="Megha Maanay Homes Logo" 
            style={{ 
              maxHeight: '130px', 
              width: 'auto', 
              marginBottom: '1.25rem'
            }} 
          />
          <h1 style={{ fontSize: '2rem', background: 'linear-gradient(to right, #6366f1, #14b8a6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.25rem' }}>
            Megha Maanay Homes
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Apartment Management Portal</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--glass-border)', padding: '0.25rem', marginBottom: '1.5rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() => { setIsAdmin(false); setError(''); setPassword(''); setShowPassword(false); }}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              background: !isAdmin ? 'var(--primary)' : 'transparent',
              color: !isAdmin ? '#fff' : 'var(--text-secondary)',
              boxShadow: !isAdmin ? '0 4px 10px var(--primary-glow)' : 'none'
            }}
          >
            Resident
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => { setIsAdmin(true); setError(''); setPassword(''); setShowPassword(false); }}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              background: isAdmin ? 'var(--primary)' : 'transparent',
              color: isAdmin ? '#fff' : 'var(--text-secondary)',
              boxShadow: isAdmin ? '0 4px 10px var(--primary-glow)' : 'none'
            }}
          >
            Admin
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          {!isAdmin ? (
            <>
              <div className="input-group">
                <label htmlFor="flat-select">Flat Number</label>
                <select
                  id="flat-select"
                  className="input-field"
                  value={flatNo}
                  onChange={(e) => setFlatNo(e.target.value)}
                  style={{ appearance: 'none', background: 'rgba(255,255,255,0.03) url("data:image/svg+xml;utf8,<svg fill=\'%2394a3b8\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 12px center' }}
                >
                  {flats.map(no => (
                    <option key={no} value={no} style={{ background: 'var(--bg-secondary)', color: 'white' }}>
                      Flat {no}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="residentRole"
                    checked={residentRole === 'owner'}
                    onChange={() => { setResidentRole('owner'); setError(''); setPassword(''); }}
                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  Owner
                </label>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="residentRole"
                    checked={residentRole === 'tenant'}
                    onChange={() => { setResidentRole('tenant'); setError(''); setPassword(''); }}
                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  Tenant
                </label>
              </div>
            </>
          ) : (
            <div className="input-group">
              <label htmlFor="admin-username">Admin Username</label>
              <input
                id="admin-username"
                type="text"
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Username"
              />
            </div>
          )}

          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label htmlFor="password-field">Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
              <input
                id="password-field"
                type={showPassword ? "text" : "password"}
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={isAdmin ? "••••••••" : "e.g. flat001"}
                style={{ width: '100%', paddingRight: '3.5rem' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {!isAdmin && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                Default: {residentRole} + flat number (e.g. {residentRole}001, {residentRole}102)
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.85rem' }}
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
