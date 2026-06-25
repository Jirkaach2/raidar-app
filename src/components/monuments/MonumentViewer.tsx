import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  listMonuments,
  getMonumentInfo,
  getMonumentImageUrl,
  getItemIcon,
  MonumentInfo,
  PuzzleItem,
  CardType,
} from '../../utils/monuments';
import { getLootTable } from '../../utils/loot';
import { LootTableView } from '../common/LootTableView';
import { getGridCoordinate } from '../../utils/grid';
import { useMapStore } from '../../stores/map-store';
import './MonumentViewer.css';

type TierFilter = 'all' | 't1' | 't2' | 't3' | 'safe' | 'onmap';

const RUSTMAPS_3D_URL = 'https://rustmaps.com/monuments';

const RADIATION_LABEL: Record<MonumentInfo['radiation'], string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const CARD_LABEL: Record<CardType, string> = {
  green: 'Green',
  blue: 'Blue',
  red: 'Red',
};

/** Highest numeric tier in a tier string ("1/2/3" -> 3). Safe zones rank 0. */
function tierRank(info: MonumentInfo): number {
  if (info.safezone) return 0;
  const digits = info.tier.match(/\d/g);
  if (!digits) return 0;
  return Math.max(...digits.map(Number));
}

/** Whether a monument satisfies the active tier filter chip. */
function matchesTier(info: MonumentInfo, filter: TierFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'safe':
      return info.safezone;
    case 't1':
      return !info.safezone && info.tier.includes('1');
    case 't2':
      return !info.safezone && info.tier.includes('2');
    case 't3':
      return !info.safezone && info.tier.includes('3');
    default:
      return true;
  }
}

/** Monument thumbnail / hero image with graceful placeholder fallback. */
function MonImage({ monKey, name, variant }: { monKey: string; name: string; variant: 'thumb' | 'hero' }) {
  const url = getMonumentImageUrl(monKey);
  const [failed, setFailed] = useState(false);
  const cls = variant === 'hero' ? 'mon-hero-img' : 'mon-thumb-img';
  if (!url || failed) {
    return (
      <div className={`mon-img-ph mon-img-ph--${variant}`} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <polygon points="12 3 22 21 2 21" />
        </svg>
      </div>
    );
  }
  return <img className={cls} src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}

/** A puzzle / reward item with its CDN icon and optional quantity. */
function ItemChip({ item }: { item: PuzzleItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="mon-item" title={item.name}>
      {item.icon && !failed ? (
        <img
          className="mon-item-icon"
          src={getItemIcon(item.icon)}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="mon-item-icon mon-item-icon--ph" aria-hidden="true" />
      )}
      <span className="mon-item-name">{item.name}</span>
      {item.qty && <span className="mon-item-qty">{item.qty}</span>}
    </span>
  );
}

/** Colored keycard pill. */
function CardPill({ card, kind }: { card: CardType; kind: 'req' | 'opt' | 'gives' }) {
  return (
    <span className={`mon-card mon-card--${card} ${kind === 'opt' ? 'mon-card--opt' : ''}`}>
      <span className="mon-card-dot" />
      {CARD_LABEL[card]}
      {kind === 'opt' && <span className="mon-card-tag">optional</span>}
    </span>
  );
}

export function MonumentViewer() {
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<TierFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string>('launch_site');

  // Live map data from the currently connected server (may be empty).
  const liveMonuments = useMapStore((s) => s.monuments);
  const mapSize = useMapStore((s) => s.mapSize);

  // Resolve every monument to its full info, sorted by tier desc then name.
  const monuments = useMemo<MonumentInfo[]>(() => {
    return listMonuments()
      .map((m) => getMonumentInfo(m.key))
      .filter((m): m is MonumentInfo => m != null)
      .sort((a, b) => {
        const r = tierRank(b) - tierRank(a);
        return r !== 0 ? r : a.name.localeCompare(b.name);
      });
  }, []);

  // Map catalog monument key -> grid coords present on the current live map.
  const onMapCoords = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    if (mapSize <= 0) return map;
    for (const lm of liveMonuments) {
      const key = getMonumentInfo(lm.token)?.key;
      if (!key) continue;
      const grid = getGridCoordinate(lm.x, lm.y, mapSize);
      const list = map.get(key);
      if (list) {
        if (!list.includes(grid)) list.push(grid);
      } else {
        map.set(key, [grid]);
      }
    }
    return map;
  }, [liveMonuments, mapSize]);

  const hasLiveMap = onMapCoords.size > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monuments.filter((m) => {
      if (tier === 'onmap') {
        if (!onMapCoords.has(m.key)) return false;
      } else if (!matchesTier(m, tier)) {
        return false;
      }
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [monuments, query, tier, onMapCoords]);

  const selected = useMemo(
    () => monuments.find((m) => m.key === selectedKey) ?? monuments[0] ?? null,
    [monuments, selectedKey],
  );

  const chips: { id: TierFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(hasLiveMap ? [{ id: 'onmap' as TierFilter, label: 'On Map' }] : []),
    { id: 't3', label: 'Tier 3' },
    { id: 't2', label: 'Tier 2' },
    { id: 't1', label: 'Tier 1' },
    { id: 'safe', label: 'Safe Zone' },
  ];

  return (
    <div className="mon-panel">
      <div className="mon-head">
        <div>
          <h1 className="mon-title">MONUMENTS</h1>
          <p className="mon-sub">Rust monument intelligence — loot, puzzles, keycards &amp; hazards</p>
        </div>
      </div>

      <div className="mon-body">
        {/* ── Left list ── */}
        <aside className="mon-list-pane">
          <div className="mon-search-wrap">
            <svg className="mon-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="mon-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search monuments…"
            />
          </div>

          <div className="mon-chips">
            {chips.map((c) => (
              <button
                key={c.id}
                className={`mon-chip ${tier === c.id ? 'mon-chip--active' : ''} ${c.id === 'onmap' ? 'mon-chip--onmap' : ''}`}
                onClick={() => setTier(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mon-list">
            {filtered.length === 0 && <div className="mon-list-empty">No monuments match.</div>}
            {filtered.map((m) => {
              const grids = onMapCoords.get(m.key);
              return (
                <button
                  key={m.key}
                  className={`mon-list-item ${selected?.key === m.key ? 'mon-list-item--active' : ''}`}
                  onClick={() => setSelectedKey(m.key)}
                >
                  <div className="mon-thumb">
                    <MonImage monKey={m.key} name={m.name} variant="thumb" />
                  </div>
                  <div className="mon-list-meta">
                    <span className="mon-list-name">{m.name}</span>
                    <span className="mon-list-tags">
                      <span className={`mon-tier mon-tier--${tierRank(m)}`}>
                        {m.safezone ? 'Safe' : `T${m.tier}`}
                      </span>
                      {grids && grids.length > 0 && (
                        <span className="mon-onmap-badge" title={`On this map · ${grids.join(', ')}`}>
                          <span className="mon-onmap-dot" />
                          ON MAP
                          <span className="mon-onmap-grid">{grids.join(' · ')}</span>
                        </span>
                      )}
                      <span className={`mon-rad-dot mon-rad-dot--${m.radiation}`} title={`Radiation: ${RADIATION_LABEL[m.radiation]}`} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Detail pane ── */}
        <section className="mon-detail">
          {selected ? (
            <MonumentDetail key={selected.key} info={selected} grids={onMapCoords.get(selected.key)} />
          ) : (
            <div className="mon-list-empty">Select a monument.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function MonumentDetail({ info, grids }: { info: MonumentInfo; grids?: string[] }) {
  const [openCrates, setOpenCrates] = useState<Set<number>>(() => new Set());
  const [show3d, setShow3d] = useState(false);

  const radText =
    info.radMedian != null || info.radMax != null
      ? `${RADIATION_LABEL[info.radiation]} (median ${info.radMedian ?? '–'} / max ${info.radMax ?? '–'})`
      : RADIATION_LABEL[info.radiation];

  const toggleCrate = (i: number) =>
    setOpenCrates((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const open3dExternal = async () => {
    try {
      await invoke('open_external_url', { url: RUSTMAPS_3D_URL });
    } catch (err) {
      console.error('Failed to open RustMaps 3D viewer:', err);
    }
  };

  return (
    <div className="mon-detail-inner">
      <div className="mon-hero">
        <MonImage monKey={info.key} name={info.name} variant="hero" />
        <div className="mon-hero-overlay">
          <span className={`mon-tier mon-tier--${tierRank(info)} mon-tier--lg`}>
            {info.safezone ? 'Safe Zone' : `Tier ${info.tier}`}
          </span>
          <h2 className="mon-name">{info.name}</h2>
          <span className="mon-type">{info.type}</span>
        </div>
      </div>

      {/* On this map */}
      {grids && grids.length > 0 && (
        <div className="mon-onmap-line">
          <span className="mon-onmap-dot mon-onmap-dot--lg" />
          On this map
          <span className="mon-onmap-line-grids">{grids.join(' · ')}</span>
        </div>
      )}

      {/* 3D model viewer (collapsible, loads iframe on demand) */}
      <div className="mon-section mon-3d-section">
        <button
          className={`mon-3d-toggle ${show3d ? 'mon-3d-toggle--open' : ''}`}
          onClick={() => setShow3d((v) => !v)}
          aria-expanded={show3d}
        >
          <svg className="mon-3d-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <span className="mon-3d-toggle-label">{show3d ? 'Hide 3D model' : 'Show 3D model'}</span>
          <span className="mon-3d-toggle-tag">3D MODEL</span>
        </button>

        {show3d && (
          <div className="mon-3d-body">
            <div className="mon-3d-frame-wrap">
              <iframe
                className="mon-3d-frame"
                src={RUSTMAPS_3D_URL}
                title="RustMaps 3D monument viewer"
                loading="lazy"
              />
            </div>
            <div className="mon-3d-note-row">
              <p className="mon-3d-note">
                Interactive 3D models are hosted by RustMaps. If the viewer doesn't load below, open it
                in your browser.
              </p>
              <button className="mon-3d-open" onClick={open3dExternal}>
                Open 3D viewer on RustMaps ↗
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mon-stats">
        <Stat label="Type" value={info.type} />
        <Stat label="Tier" value={info.safezone ? 'Safe Zone' : info.tier} />
        <Stat label="Radiation" value={radText}>
          <span className={`mon-rad-dot mon-rad-dot--${info.radiation}`} />
        </Stat>
        <Stat label="Safe Zone" value={info.safezone ? 'Yes' : 'No'} />
        <Stat label="Recyclers" value={String(info.recyclers)} />
        {info.barrels != null && <Stat label="Barrels" value={String(info.barrels)} />}
        {info.crateCount != null && <Stat label="Crates" value={String(info.crateCount)} />}
      </div>

      {/* Keycards */}
      {(info.requiresCards.length > 0 || (info.optionalCards?.length ?? 0) > 0 || info.givesCards.length > 0) && (
        <Section title="Keycards">
          <div className="mon-keycards">
            {info.requiresCards.length > 0 && (
              <div className="mon-keycard-group">
                <span className="mon-keycard-label">Requires</span>
                <div className="mon-pill-row">
                  {info.requiresCards.map((c) => (
                    <CardPill key={`req-${c}`} card={c} kind="req" />
                  ))}
                </div>
              </div>
            )}
            {info.optionalCards && info.optionalCards.length > 0 && (
              <div className="mon-keycard-group">
                <span className="mon-keycard-label">Optional</span>
                <div className="mon-pill-row">
                  {info.optionalCards.map((c) => (
                    <CardPill key={`opt-${c}`} card={c} kind="opt" />
                  ))}
                </div>
              </div>
            )}
            {info.givesCards.length > 0 && (
              <div className="mon-keycard-group">
                <span className="mon-keycard-label">Gives</span>
                <div className="mon-pill-row">
                  {info.givesCards.map((c) => (
                    <CardPill key={`gives-${c}`} card={c} kind="gives" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Puzzles */}
      {info.puzzles.length > 0 && (
        <Section title="Puzzles">
          <div className="mon-puzzles">
            {info.puzzles.map((p, i) => (
              <div className="mon-puzzle" key={i}>
                <div className="mon-puzzle-head">
                  <span className="mon-puzzle-num">Puzzle {i + 1}</span>
                  {p.resetTime && <span className="mon-puzzle-reset">Reset {p.resetTime}</span>}
                </div>
                <div className="mon-puzzle-step">
                  <span className="mon-step-label">Bring</span>
                  <div className="mon-item-row">
                    {p.bring.map((it, k) => (
                      <ItemChip key={`b-${k}`} item={it} />
                    ))}
                  </div>
                </div>
                {p.activate && p.activate.length > 0 && (
                  <div className="mon-puzzle-step">
                    <span className="mon-step-label">Activate</span>
                    <div className="mon-item-row">
                      {p.activate.map((it, k) => (
                        <ItemChip key={`a-${k}`} item={it} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="mon-puzzle-step">
                  <span className="mon-step-label mon-step-label--reward">Rewards</span>
                  <div className="mon-item-row">
                    {p.rewards.map((it, k) => (
                      <ItemChip key={`r-${k}`} item={it} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Crates */}
      {info.crates.length > 0 && (
        <Section title="Crates">
          <ul className="mon-line-list">
            {info.crates.map((c, i) => {
              const table = getLootTable(c.loot);
              const expandable = table != null;
              const isOpen = openCrates.has(i);
              return (
                <li key={i} className={`mon-line mon-line--crate ${expandable ? 'mon-line--expandable' : ''}`}>
                  {expandable ? (
                    <button
                      className={`mon-crate-toggle ${isOpen ? 'mon-crate-toggle--open' : ''}`}
                      onClick={() => toggleCrate(i)}
                      aria-expanded={isOpen}
                    >
                      <svg className="mon-crate-chevron" viewBox="0 0 24 24" aria-hidden="true">
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                      <span className="mon-line-name">{c.label}</span>
                      <span className="mon-line-count">{c.count}</span>
                    </button>
                  ) : (
                    <div className="mon-crate-static">
                      <span className="mon-line-name">{c.label}</span>
                      <span className="mon-line-count">{c.count}</span>
                    </div>
                  )}
                  {expandable && isOpen && (
                    <div className="mon-crate-loot">
                      <LootTableView table={table!} className="mon-crate-ltv" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Scientists */}
      {info.scientists.length > 0 && (
        <Section title="Scientists">
          <ul className="mon-line-list">
            {info.scientists.map((s, i) => (
              <li key={i} className="mon-line">
                <span className="mon-line-name">{s.label}</span>
                <span className="mon-line-count">×{s.count}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Mining */}
      {info.mining && (
        <Section title="Mining">
          <div className="mon-kv">
            <span className="mon-kv-key">Fuel</span>
            <span className="mon-kv-val">{info.mining.fuel}</span>
          </div>
          {info.mining.runTime && (
            <div className="mon-kv">
              <span className="mon-kv-key">Run time</span>
              <span className="mon-kv-val">{info.mining.runTime}</span>
            </div>
          )}
          <ul className="mon-bullets">
            {info.mining.outputs.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Bradley */}
      {info.bradley && (
        <Section title="Bradley APC">
          <div className="mon-kv">
            <span className="mon-kv-key">Destroy</span>
            <span className="mon-kv-val">{info.bradley.destroy}</span>
          </div>
          <div className="mon-kv">
            <span className="mon-kv-key">Drops</span>
            <span className="mon-kv-val">{info.bradley.drops}</span>
          </div>
          <ul className="mon-bullets">
            {info.bradley.loot.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Notes */}
      {info.notes.length > 0 && (
        <Section title="Notes">
          <ul className="mon-bullets">
            {info.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="mon-stat">
      <span className="mon-stat-label">{label}</span>
      <span className="mon-stat-value">
        {children}
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mon-section">
      <h3 className="mon-section-title">{title}</h3>
      {children}
    </div>
  );
}
