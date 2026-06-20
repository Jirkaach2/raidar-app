import { useMemo, useState, useEffect } from 'react';
import { useMapStore } from '../../stores/map-store';
import { useUiStore } from '../../stores/ui-store';
import { analyzeRichBases, richTier } from '../../utils/richbase';
import { getItemIconUrl } from '../../utils/items';
import { getNormalizedCoordinates } from '../../utils/grid';
import { normalizeMonumentKey, getMonumentInfo } from '../../utils/monuments';

/**
 * Rich Base Tracker — scans live vending machines for high-value raid loot
 * and ranks the shops/areas most likely to belong to a wealthy clan worth raiding.
 */
export function RichBaseTool() {
  const markers = useMapStore((s) => s.markers);
  const monuments = useMapStore((s) => s.monuments);
  const mapSize = useMapStore((s) => s.mapSize);
  const oceanMargin = useMapStore((s) => s.oceanMargin || 0);
  const imageWidth = useMapStore((s) => s.mapImageWidth || 0);
  const imageHeight = useMapStore((s) => s.mapImageHeight || 0);
  const selectMarker = useMapStore((s) => s.selectMarker);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 20_000);
    return () => clearInterval(id);
  }, []);

  const shops = useMemo(() => {
    // Predicate: is a normalized point inside an Outpost / Bandit Camp zone?
    const isNpcZone = (nx: number, ny: number): boolean => {
      for (const m of monuments) {
        const key = normalizeMonumentKey(m.token);
        const k = getMonumentInfo(m.token)?.key || key;
        if (
          k === 'outpost' || k === 'bandit_camp' || k.includes('fishing') || k.includes('barn') || k.includes('stable') || k.includes('ranch') ||
          key.includes('outpost') || key.includes('bandit') || key.includes('fishing') || key.includes('barn') || key.includes('stable') || key.includes('ranch')
        ) {
          const p = getNormalizedCoordinates(m.x, m.y, mapSize, imageWidth, imageHeight, oceanMargin);
          if (Math.hypot(nx - p.x, ny - p.y) < 0.05) return true;
        }
      }
      return false;
    };
    return analyzeRichBases(markers, isNpcZone);
  }, [markers, monuments, mapSize, oceanMargin, imageWidth, imageHeight]);

  const handleCardClick = (sh: any) => {
    // Switch to Map tab
    useUiStore.getState().setActivePage('map');

    // Open the shop vending popup on the map
    selectMarker(sh.id);
    
    // Smoothly pan & zoom the map viewport to center on the shop
    const MAP_SIZE = 800;
    const zoom = 2.0;
    useMapStore.getState().setViewport({
      x: -(sh.x - 0.5) * MAP_SIZE * zoom,
      y: -(sh.y - 0.5) * MAP_SIZE * zoom,
      zoom: zoom
    });
  };

  return (
    <div className="decay richbase">
      <div className="decay-section-head"><h3>RICH PLAYER BASES ({shops.length})</h3></div>
      <p className="text-dim" style={{ margin: '0 0 14px 0', fontSize: 11, lineHeight: 1.4 }}>
        Ranked by the scrap value of the valuables each player shop has <b>in stock</b> (per-unit worth × stock, shared-storage aware). High value means a wealthy clan worth raiding — click a base to locate and inspect.
      </p>

      {shops.length === 0 ? (
        <div className="decay-empty">No valuable player shops detected on the map yet.</div>
      ) : (
        <div className="rich-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shops.slice(0, 30).map((sh) => {
            const tier = richTier(sh.score);
            return (
              <button 
                key={sh.id} 
                className="rich-card" 
                onClick={() => handleCardClick(sh)} 
                title="Center and open on map"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                }}
              >
                <div className="rich-card-head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="rich-grid" style={{ fontSize: 11, fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: 4, color: '#fff' }}>{sh.grid || '??'}</span>
                  <span className="rich-name" style={{ fontSize: 12, fontWeight: 600, color: '#eee', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sh.shopName}</span>
                  <span className="rich-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: tier.color, fontWeight: 700 }} title="Total scrap-equivalent asking price of in-stock offers (each item once)">
                    {sh.score >= 1000 ? `${(sh.score / 1000).toFixed(1).replace('.0', '')}k` : sh.score}
                  </span>
                  <span className="rich-tier" style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, border: '1px solid', color: tier.color, borderColor: `${tier.color}66`, background: `${tier.color}1a` }}>{tier.label}</span>
                </div>
                
                <div className="rich-highlights" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {sh.highlights.map((h: any, i: number) => {
                    const icon = getItemIconUrl(h.itemId);
                    return (
                      <span key={i} className="rich-hl" title={`${h.qty.toLocaleString('en-US')} in stock · ~${h.value.toLocaleString('en-US')} scrap value`}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: h.isRaid ? 'rgba(239,107,107,0.14)' : 'rgba(0, 0, 0, 0.25)', border: h.isRaid ? '1px solid rgba(239,107,107,0.3)' : '1px solid transparent', padding: '3px 6px', borderRadius: 4, fontSize: 10 }}>
                        {icon && <img src={icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                        <span className="rich-hl-qty" style={{ fontWeight: 'bold', color: 'var(--color-warning)' }}>{h.qty >= 1000 ? `${(h.qty / 1000).toFixed(1).replace('.0', '')}k` : h.qty}×</span>
                        <span className="rich-hl-name" style={{ color: '#ccc' }}>{h.name}</span>
                      </span>
                    );
                  })}
                </div>
                
                <div className="rich-score-bar" style={{ height: 4, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div className="rich-score-fill" style={{ height: '100%', width: `${Math.min(100, (sh.score / 8000) * 100)}%`, background: tier.color, transition: 'width 0.3s ease' }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
