import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Handle dynamic import failures (often caused by new builds/deployments)
window.addEventListener('error', (e) => {
  const message = e.message || '';
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  ) {
    window.location.reload();
  }
}, true);

window.addEventListener('unhandledrejection', (e) => {
  const reason = (e.reason && e.reason.message) || '';
  if (
    reason.includes('Failed to fetch dynamically imported module') ||
    reason.includes('Importing a module script failed')
  ) {
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
