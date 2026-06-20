import { useEffect, useRef, useState } from 'react';
import { useCameraStore } from '../../stores/camera-store';
import { useSavedCamerasStore, SavedCamera } from '../../stores/saved-cameras-store';
import { renderCameraFrames, CAMERA_BUTTONS } from '../../utils/camera';
import { useConnectionStore } from '../../stores/connection-store';

/**
 * Live Rust+ camera viewer + saved-camera manager.
 *
 * Camera identifiers are exactly what the player typed at the Computer Station
 * (case-sensitive — "nicers1234" ≠ "NICERS1234"). Save multiple cameras with
 * friendly labels, edit/remove them, and one-click to watch.
 *
 * NOTE: Rust+ rejects camera subscriptions (access_denied) unless you have
 * access rights to that camera, and the game blocks remote camera viewing
 * while you are actively connected/alive in the server — same as the official
 * companion app. We surface those errors clearly.
 */
export function CameraView() {
  const connectionStatus = useConnectionStore((s) => s.status);
  const { activeCameraId, info, connecting, error, entities, frameTick, subscribe, unsubscribe, sendInput } = useCameraStore();
  const { cameras, addCamera, updateCamera, removeCamera } = useSavedCamerasStore();

  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonsRef = useRef(0);
  const draggingRef = useRef(false);

  // Composite + paint accumulated ray frames, throttled to animation frames so
  // a burst of ray broadcasts doesn't re-composite the whole image many times
  // per tick (keeps the feed smooth).
  useEffect(() => {
    if (!info) return;
    let raf = 0;
    let lastPainted = -1;
    const paint = () => {
      raf = requestAnimationFrame(paint);
      const st = useCameraStore.getState();
      if (st.frameTick === lastPainted || !canvasRef.current || st.rayFrames.length === 0) return;
      lastPainted = st.frameTick;
      const img = renderCameraFrames(st.rayFrames, info.width, info.height);
      if (!img) return;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [info]);

  // Clean up the subscription when leaving the view.
  useEffect(() => {
    return () => { if (useCameraStore.getState().activeCameraId) useCameraStore.getState().unsubscribe(); };
  }, []);

  // Keyboard movement controls (only while a camera is active).
  useEffect(() => {
    if (!activeCameraId) return;
    const keyToButton = (k: string): number => {
      switch (k.toLowerCase()) {
        case 'w': return CAMERA_BUTTONS.FORWARD;
        case 's': return CAMERA_BUTTONS.BACKWARD;
        case 'a': return CAMERA_BUTTONS.LEFT;
        case 'd': return CAMERA_BUTTONS.RIGHT;
        case ' ': return CAMERA_BUTTONS.JUMP;
        case 'control': return CAMERA_BUTTONS.DUCK;
        case 'shift': return CAMERA_BUTTONS.SPRINT;
        default: return 0;
      }
    };
    const down = (e: KeyboardEvent) => {
      const b = keyToButton(e.key);
      if (!b) return;
      e.preventDefault();
      buttonsRef.current |= b;
      sendInput(buttonsRef.current, 0, 0);
    };
    const up = (e: KeyboardEvent) => {
      const b = keyToButton(e.key);
      if (!b) return;
      buttonsRef.current &= ~b;
      sendInput(buttonsRef.current, 0, 0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [activeCameraId, sendInput]);

  const onMouseDown = () => { draggingRef.current = true; };
  const onMouseUp = () => { draggingRef.current = false; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current || !activeCameraId) return;
    sendInput(buttonsRef.current, e.movementX, e.movementY);
  };

  const connected = connectionStatus === 'connected';

  const submitForm = () => {
    if (!code.trim()) return;
    if (editingId) {
      updateCamera(editingId, { code, label });
      setEditingId(null);
    } else {
      addCamera(code, label);
    }
    setCode('');
    setLabel('');
  };

  const startEdit = (cam: SavedCamera) => {
    setEditingId(cam.id);
    setCode(cam.code);
    setLabel(cam.label || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCode('');
    setLabel('');
  };

  const watch = (c: string) => subscribe(c);

  return (
    <div className="camview">
      <div className="camview-notice">
        <span className="camview-notice-icon">ℹ</span>
        <span>
          Enter your <b>base camera codes</b>. Monument cameras cannot be viewed here.
        </span>
      </div>

      {/* Add / edit camera form (code is case-sensitive — NOT forced upper) */}
      <div className="camview-form">
        <input
          className="camview-input"
          placeholder="Camera identifier (case-sensitive)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitForm(); }}
          spellCheck={false}
          autoCapitalize="off"
        />
        <input
          className="camview-input camview-input--label"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitForm(); }}
        />
        <button className="camview-btn" onClick={submitForm} disabled={!code.trim()}>
          {editingId ? 'SAVE' : 'ADD'}
        </button>
        {editingId && <button className="camview-btn camview-btn--ghost" onClick={cancelEdit}>CANCEL</button>}
      </div>

      {/* Saved cameras list */}
      {cameras.length > 0 && (
        <div className="camview-list">
          {cameras.map((cam) => (
            <div key={cam.id} className={`camview-saved ${activeCameraId === cam.code ? 'active' : ''}`}>
              <div className="camview-saved-info">
                {cam.label && <span className="camview-saved-label">{cam.label}</span>}
                <span className="camview-saved-code">{cam.code}</span>
              </div>
              <div className="camview-saved-actions">
                <button
                  className="camview-mini-btn camview-mini-btn--watch"
                  onClick={() => (activeCameraId === cam.code ? unsubscribe() : watch(cam.code))}
                  disabled={!connected}
                  title={connected ? 'Watch this camera' : 'Connect to a server first'}
                >
                  {activeCameraId === cam.code ? 'STOP' : 'WATCH'}
                </button>
                <button className="camview-mini-btn" onClick={() => startEdit(cam)} title="Edit">✎</button>
                <button className="camview-mini-btn camview-mini-btn--del" onClick={() => removeCamera(cam.id)} title="Remove">×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!connected && (
        <div className="camview-hint">Connect to a server to watch a camera feed.</div>
      )}
      {error && (
        <div className="camview-error">
          {/player.?online|already.?connected|in.?game|online/i.test(error)
            ? 'You must be OFFLINE from the server to view cameras. Rust blocks remote camera access while you are connected and alive — disconnect from the game first.'
            : /access[_ ]denied|not.?allowed|denied/i.test(error)
            ? 'Access denied for this camera. It must be powered, and personal base cameras generally can only be viewed while you are offline.'
            : /not.?found|no.?camera|unknown/i.test(error)
            ? 'Camera not found. Check the identifier is typed exactly (case-sensitive) and the camera is powered.'
            : error}
        </div>
      )}

      {/* Live feed */}
      {activeCameraId && info && (
        <>
          <div
            className="camview-screen"
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseMove={onMouseMove}
          >
            <canvas ref={canvasRef} width={info.width} height={info.height} className="camview-canvas" />
            <div className="camview-overlay-label">
              <span className="camview-rec-dot" /> {activeCameraId}
            </div>
            {entities.filter((e) => e.type === 2).length > 0 && (
              <div className="camview-entities">
                <span className="camview-warn">⚠ {entities.filter((e) => e.type === 2).length} player(s) in view</span>
              </div>
            )}
            {frameTick === 0 && <div className="camview-waiting">Awaiting feed…</div>}
          </div>
          {entities.length > 0 && (
            <div className="camview-entitybar">
              {entities.slice(0, 8).map((e, idx) => (
                <span key={idx} className={`camview-ent ${e.type === 2 ? 'player' : ''}`}>
                  {e.type === 2 ? '👤' : e.type === 1 ? '🌲' : '▪'} {e.name || (e.type === 2 ? 'Player' : e.type === 1 ? 'Tree' : 'Object')}
                </span>
              ))}
            </div>
          )}
          {(() => {
            const flags = info.control_flags || 0;
            const canMove = (flags & 1) !== 0;     // MOVEMENT
            const canLook = (flags & 2) !== 0;     // MOUSE
            const canFire = (flags & 8) !== 0;     // FIRE (auto turret / PTZ)
            if (!canMove && !canLook && !canFire) {
              return <div className="camview-help">Fixed CCTV camera — no movement controls (view only).</div>;
            }
            const parts: string[] = [];
            if (canMove) parts.push('WASD move', 'Shift sprint', 'Space up · Ctrl down');
            if (canLook) parts.push('drag to look');
            if (canFire) parts.push('click to zoom/fire');
            return <div className="camview-help">{parts.join(' · ')}</div>;
          })()}
        </>
      )}
      {connecting && <div className="camview-hint">Connecting…</div>}
    </div>
  );
}
