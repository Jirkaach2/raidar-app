import { useState, useEffect } from 'react';
import './Titlebar.css';
import AccountButton from './AccountButton';

export default function Titlebar() {
  const [version, setVersion] = useState('1.0.1');

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((v) => setVersion(v))
      .catch(() => {});
  }, []);
  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch { /* browser dev mode */ }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMax) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (e) {
      console.error("Maximize error:", e);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch { /* browser dev mode */ }
  };

  return (
    <header className="titlebar">
      <div className="titlebar__drag" data-tauri-drag-region>
        <div className="titlebar__icon">
          {/* Raidar — hex bolt (rust) + radar sweep/ping */}
          <svg viewBox="0 0 24 24" fill="none">
            <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none">
              <path d="M12 5 L18.06 8.5 L18.06 15.5 L12 19 L5.94 15.5 L5.94 8.5 Z" />
              <line x1="12" y1="12" x2="16.1" y2="7.9" />
            </g>
            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            <circle cx="16.1" cy="7.9" r="1.4" fill="currentColor" />
          </svg>
        </div>
        <span className="titlebar__title">RAIDAR</span>
        <span className="titlebar__version">v{version}</span>
      </div>

      <div className="titlebar__controls">
        <AccountButton />
        <button className="titlebar__btn" onClick={handleMinimize} aria-label="Minimize">
          <svg viewBox="0 0 12 12"><line x1="2" y1="6" x2="10" y2="6" /></svg>
        </button>
        <button className="titlebar__btn" onClick={handleMaximize} aria-label="Maximize">
          <svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>
        </button>
        <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </div>

      <div className="titlebar__sweep" />
    </header>
  );
}
