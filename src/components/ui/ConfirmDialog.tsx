import { useConfirmStore } from '../../stores/confirm-store';

/** Themed confirmation modal, replaces the native window.confirm dialog. */
export function ConfirmDialog() {
  const { open, title, message, confirmLabel, cancelLabel, danger, respond } = useConfirmStore();
  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={() => respond(false)}>
      <div className="confirm-box glass-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-cancel" onClick={() => respond(false)}>{cancelLabel}</button>
          <button className={`confirm-btn ${danger ? 'confirm-danger' : 'confirm-ok'}`} onClick={() => respond(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
