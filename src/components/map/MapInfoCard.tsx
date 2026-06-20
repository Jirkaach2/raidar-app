import { useState } from 'react';
import { useRustMapsStore } from '@/stores/rustmaps-store';
import { useConnectionStore } from '@/stores/connection-store';
import { Globe2, ChevronDown } from 'lucide-react';
import './MapInfoCard.css';

/** Biome breakdown + terrain counts from RustMaps. Collapsible chip. */
export function MapInfoCard() {
  const stats = useRustMapsStore((s) => s.stats);
  const serverInfo = useConnectionStore((s) => s.serverInfo);
  const [open, setOpen] = useState(false);

  if (!stats) return null;

  // Biome % — RustMaps returns fractions or whole numbers; normalize to %.
  const norm = (v: number) => (v <= 1.0001 ? v * 100 : v);
  const biomes = [
    { key: 's', label: 'Snow', color: '#cfe6f5', v: norm(stats.biome_s) },
    { key: 'd', label: 'Desert', color: '#e3c989', v: norm(stats.biome_d) },
    { key: 'f', label: 'Forest', color: '#7fc08a', v: norm(stats.biome_f) },
    { key: 't', label: 'Tundra', color: '#b7a36a', v: norm(stats.biome_t) },
    { key: 'j', label: 'Jungle', color: '#4caf6e', v: norm(stats.biome_j) },
  ].filter((b) => b.v > 0.5);

  return (
    <div className={`mic ${open ? 'open' : ''}`}>
      <button className="mic-toggle" onClick={() => setOpen((v) => !v)} title="Map info">
        <Globe2 size={13} /> MAP INFO
        <ChevronDown size={12} className="mic-chev" />
      </button>

      {open && (
        <div className="mic-body">
          {serverInfo && (
            <div className="mic-seed">
              <span>Seed <b>{serverInfo.seed}</b></span>
              <span>{serverInfo.map_size}m</span>
            </div>
          )}

          {biomes.length > 0 && (
            <>
              <div className="mic-bar">
                {biomes.map((b) => (
                  <span key={b.key} style={{ width: `${b.v}%`, background: b.color }} title={`${b.label} ${b.v.toFixed(0)}%`} />
                ))}
              </div>
              <div className="mic-legend">
                {biomes.map((b) => (
                  <span key={b.key} className="mic-leg">
                    <i style={{ background: b.color }} /> {b.label} {b.v.toFixed(0)}%
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="mic-grid">
            <div><b>{stats.land_percent}%</b><span>land</span></div>
            <div><b>{stats.total_monuments}</b><span>monuments</span></div>
            <div><b>{stats.islands}</b><span>islands</span></div>
            <div><b>{stats.mountains}</b><span>mountains</span></div>
            <div><b>{stats.rivers}</b><span>rivers</span></div>
            <div><b>{stats.lakes}</b><span>lakes</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
