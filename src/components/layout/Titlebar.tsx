import './Titlebar.css';

export default function Titlebar() {
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
          {/* Raidar — radar scope mark (sweep + target blip) */}
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
            {/* sweep wedge */}
            <path d="M12 12 L11.2 2.85 A9.2 9.2 0 0 1 19.05 6.05 Z" fill="currentColor" fillOpacity="0.22" />
            {/* leading edge */}
            <line x1="12" y1="12" x2="19.05" y2="6.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            {/* target blip */}
            <circle cx="16.3" cy="7.0" r="1.5" fill="currentColor" />
            {/* hub */}
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <span className="titlebar__title">RAIDAR</span>
        <span className="titlebar__version">v1.0.0</span>
      </div>

      <div className="titlebar__controls">
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
