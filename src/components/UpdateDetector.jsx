import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export default function UpdateDetector() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hasDetectedUpdate = useRef(false);

  useEffect(() => {
    // Get current local build ID
    const currentBuildId = document.querySelector('meta[name="build-id"]')?.getAttribute('content');

    if (!currentBuildId || currentBuildId === 'development') {
      // In development mode or if build-id is missing, skip the check
      return;
    }

    const checkForUpdates = async () => {
      if (hasDetectedUpdate.current) return;

      try {
        // Construct the correct root index.html URL regardless of subdirectories
        let appRoot = window.location.pathname;
        if (appRoot.endsWith('.html') || appRoot.endsWith('.htm')) {
          appRoot = appRoot.substring(0, appRoot.lastIndexOf('/') + 1);
        }
        if (!appRoot.endsWith('/')) {
          appRoot += '/';
        }
        const fetchUrl = `${window.location.origin}${appRoot}index.html?cb=${Date.now()}`;

        const response = await fetch(fetchUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        if (!response.ok) return;

        const htmlText = await response.text();
        const match = htmlText.match(
          /<meta[^>]*name=["']build-id["'][^>]*content=["']([^"']+)["']/
        );
        const serverBuildId = match ? match[1] : null;

        if (serverBuildId && serverBuildId !== currentBuildId) {
          hasDetectedUpdate.current = true;
          setUpdateAvailable(true);
        }
      } catch (err) {
        console.error('[UpdateDetector] Error checking for updates:', err);
      }
    };

    // Run check on mount after a small delay (5 seconds)
    const initialTimeout = setTimeout(checkForUpdates, 5000);

    // Run check periodically (every 60 seconds)
    const interval = setInterval(checkForUpdates, 60000);

    // Run check on tab visibility change (e.g. user returns to the tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 99999,
      background: 'rgba(30, 32, 47, 0.9)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 12px 40px 0 rgba(0, 0, 0, 0.5)',
      borderRadius: '16px',
      padding: '1.2rem',
      maxWidth: '340px',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.9rem',
      animation: 'mmhSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <style>{`
        @keyframes mmhSlideUp {
          from { transform: translateY(120px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .btn-update-popup {
          background: linear-gradient(135deg, var(--primary, #a855f7) 0%, #7c3aed 100%);
          color: white;
          border: none;
          padding: 0.6rem 1.2rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s ease;
          font-size: 0.85rem;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }
        .btn-update-popup:hover {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.4);
        }
        .btn-update-popup:active {
          transform: translateY(0);
        }
      `}</style>
      <div>
        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--primary, #a855f7)' }}>
          Update Available
        </h4>
        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.45' }}>
          A new version of Megha Maanay Homes has been deployed. Reload to get the latest features.
        </p>
      </div>
      <button 
        type="button" 
        className="btn-update-popup"
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={14} />
        Update Now
      </button>
    </div>
  );
}
