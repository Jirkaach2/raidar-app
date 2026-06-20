import { useState } from 'react';
import { CCTV_CODES } from '../../utils/cctv';
import { CameraView } from './CameraView';

export function CctvTool() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1200);
  };

  return (
    <div className="cctv">
      <div className="cctv-section-head"><h3>LIVE CAMERA FEED</h3></div>
      <CameraView />

      <p className="cctv-intro" style={{ marginTop: 16 }}>
        Enter these identifiers at a Computer Station — or in the live feed above —
        to view monument cameras. Tap a code to copy it.
      </p>
      <div className="cctv-list">
        {CCTV_CODES.map((mon) => (
          <div key={mon.monument} className="cctv-monument">
            <div className="cctv-monument-head">
              <span className="cctv-monument-name">{mon.monument}</span>
              <span className="cctv-count">{mon.codes.length} cam{mon.codes.length !== 1 ? 's' : ''}</span>
            </div>
            {mon.note && <div className="cctv-note">{mon.note}</div>}
            <div className="cctv-codes">
              {mon.codes.map((code) => (
                <button key={code} className={`cctv-code ${copied === code ? 'copied' : ''}`} onClick={() => copy(code)}>
                  <span className="cctv-code-text">{code}</span>
                  <span className="cctv-code-action">{copied === code ? 'COPIED' : 'COPY'}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
