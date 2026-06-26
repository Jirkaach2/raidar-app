import { useEffect, useMemo, useState } from 'react';
import {
  listMonuments,
  getMonumentInfo,
  getMonumentImageUrl,
  getItemIcon,
  monumentHas3dModel,
  MonumentInfo,
  PuzzleItem,
  CardType,
} from '../../utils/monuments';
import { getLootTable } from '../../utils/loot';
import { LootTableView } from '../common/LootTableView';
import { getGridCoordinate } from '../../utils/grid';
import {
  getMissionsForMonument,
  missionIcon,
  rewardIcon,
  Mission,
  MissionReward,
} from '../../utils/missions';
import { useMapStore } from '../../stores/map-store';
import './MonumentViewer.css';

type TierFilter = 'all' | 't1' | 't2' | 't3' | 'safe' | 'onmap';

/** Base URL for RustMaps monument pages; per-monument slug is appended. */
const RUSTMAPS_3D_BASE = 'https://rustmaps.com/monuments';

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

/** Mission reward chip with CDN icon + graceful fallback. */
function RewardChip({ reward }: { reward: MissionReward }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="mon-item mon-reward" title={reward.name}>
      {!failed ? (
        <img
          className="mon-item-icon"
          src={rewardIcon(reward)}
          alt={reward.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="mon-item-icon mon-item-icon--ph" aria-hidden="true" />
      )}
      <span className="mon-item-name">{reward.name}</span>
      {reward.qty != null && <span className="mon-item-qty">×{reward.qty}</span>}
    </span>
  );
}

/** A single NPC mission card. */
function MissionCard({ mission: m }: { mission: Mission }) {
  const [iconFailed, setIconFailed] = useState(false);
  return (
    <div className="mon-mission">
      <div className="mon-mission-head">
        <div className="mon-mission-icon">
          {!iconFailed ? (
            <img
              src={missionIcon(m.id, 64)}
              alt={m.name}
              loading="lazy"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <span className="mon-mission-icon--ph" aria-hidden="true" />
          )}
        </div>
        <div className="mon-mission-headtext">
          <span className="mon-mission-name">{m.name}</span>
          <span className="mon-mission-provider">{m.provider}</span>
        </div>
      </div>

      <p className="mon-mission-desc">{m.desc}</p>

      {m.requires && m.requires.length > 0 && (
        <div className="mon-mission-meta">
          <span className="mon-mission-tag mon-mission-tag--req">
            Requires: {m.requires.join(', ')}
          </span>
        </div>
      )}

      <div className="mon-mission-block">
        <span className="mon-mission-block-label">Objectives</span>
        <ol className="mon-mission-objectives">
          {m.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      </div>

      <div className="mon-mission-block">
        <span className="mon-mission-block-label mon-mission-block-label--reward">Rewards</span>
        {m.rewards.length > 0 ? (
          <div className="mon-item-row">
            {m.rewards.map((r, i) => (
              <RewardChip key={i} reward={r} />
            ))}
          </div>
        ) : m.rewardNote ? (
          <p className="mon-mission-rewardnote">{m.rewardNote}</p>
        ) : null}
      </div>

      {(m.cooldown || m.timeLimit || m.bonus || (m.rewards.length > 0 && m.rewardNote)) && (
        <div className="mon-mission-meta">
          {m.cooldown && <span className="mon-mission-tag">Cooldown: {m.cooldown}</span>}
          {m.timeLimit && <span className="mon-mission-tag">Time limit: {m.timeLimit}</span>}
          {m.bonus && <span className="mon-mission-tag mon-mission-tag--bonus">{m.bonus}</span>}
          {m.rewards.length > 0 && m.rewardNote && (
            <span className="mon-mission-tag">{m.rewardNote}</span>
          )}
        </div>
      )}
    </div>
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

  // RustMaps and RustHelp share monument slugs; our imageSlug is the RustHelp
  // (dash-separated) slug, so the RustMaps slug uses underscores.
  const rmSlug = info.imageSlug.replace(/-/g, '_');
  const rm3dUrl = `${RUSTMAPS_3D_BASE}/${rmSlug}`;
  // Only monuments RustMaps actually models get the interactive 3D viewer.
  const has3d = monumentHas3dModel(info.key);

  const missions = getMissionsForMonument(info.key);

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

  return (
    <div className="mon-detail-inner">
      <div className="mon-hero">
        <MonImage monKey={info.key} name={info.name} variant="hero" />
        <div className="mon-hero-overlay">
          <div className="mon-hero-chips">
            <span className={`mon-tier mon-tier--${tierRank(info)} mon-tier--lg`}>
              {info.safezone ? 'Safe Zone' : `Tier ${info.tier}`}
            </span>
            {info.radiation !== 'none' && (
              <span className={`mon-hero-chip mon-hero-chip--rad mon-hero-chip--rad-${info.radiation}`}>
                <span className={`mon-rad-dot mon-rad-dot--${info.radiation}`} />
                {RADIATION_LABEL[info.radiation]} rad
              </span>
            )}
            {info.safezone && <span className="mon-hero-chip mon-hero-chip--safe">Safe Zone</span>}
          </div>
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

      {/* 3D model viewer — compact trigger opens a large modal overlay.
          Only the monuments RustMaps actually has a model for get the button;
          the rest show a disabled "not available" note. */}
      <div className="mon-section mon-3d-section">
        {!has3d ? (
          <div className="mon-3d-unavailable" role="note">
            <span className="mon-3d-unavailable-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2 3 7v10l9 5 9-5V7z" />
                <path d="M3 7l9 5 9-5" />
                <path d="M12 12v10" />
              </svg>
            </span>
            <span className="mon-3d-unavailable-text">No interactive 3D model available for {info.name}.</span>
          </div>
        ) : (
          <button
            className="mon-3d-trigger"
            onClick={() => setShow3d(true)}
            aria-haspopup="dialog"
          >
            <span className="mon-3d-trigger-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2 3 7v10l9 5 9-5V7z" />
                <path d="M3 7l9 5 9-5" />
                <path d="M12 12v10" />
              </svg>
            </span>
            <span className="mon-3d-trigger-text">
              <span className="mon-3d-trigger-label">View in 3D</span>
              <span className="mon-3d-trigger-sub">Explore an interactive model of {info.name}</span>
            </span>
            <span className="mon-3d-trigger-tag">3D MODEL</span>
          </button>
        )}
      </div>

      {show3d && has3d && (
        <Monument3dModal name={info.name} src={rm3dUrl} onClose={() => setShow3d(false)} />
      )}

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

      {/* Missions */}
      {missions.length > 0 && (
        <Section title="Missions">
          <div className="mon-missions">
            {missions.map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
          </div>
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

/**
 * Large modal overlay that mounts the RustMaps 3D model iframe on demand.
 *
 * The iframe is rendered taller than its container and shifted up so the
 * RustMaps top navbar AND bottom footer are clipped fully out of view,
 * leaving only the clean 3D viewport. Because the embed is cross-origin we
 * cannot restyle RustMaps' own in-iframe controls/panels — instead we crop
 * their chrome and layer our own loading overlay on top. Closable via the ✕
 * button (kept above the iframe with a high z-index), a backdrop click, or
 * Escape.
 */
function Monument3dModal({
  name,
  src,
  onClose,
}: {
  name: string;
  src: string;
  onClose: () => void;
}) {
  // Tracks the iframe load so we can swap our themed loading overlay for the
  // live 3D viewport once RustMaps' page has finished loading. The iframe's
  // `onLoad` only fires when the PAGE loads — RustMaps then runs its OWN
  // internal 3D-model loader (the red-dot spinner) for a few more seconds. To
  // hide that cross-origin loader behind our own branded screen, we keep our
  // overlay up until BOTH the page has loaded AND a minimum dwell has elapsed.
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const loaded = frameLoaded && minElapsed;

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape — listener lives on window so it works even after the
  // iframe has captured mouse/keyboard focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="mon-3d-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`3D model — ${name}`}
      onClick={onClose}
    >
      <div className="mon-3d-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mon-3d-modal-bar">
          <span className="mon-3d-modal-tag">3D MODEL</span>
          <span className="mon-3d-modal-title">{name}</span>
        </div>
        <div className="mon-3d-modal-body">
          {/* Floating close affordance that always stays above the iframe so
              the modal can be dismissed even once the iframe grabs input. */}
          <button
            className="mon-3d-modal-close mon-3d-modal-close--float"
            onClick={onClose}
            aria-label="Close 3D model"
            title="Close (Esc)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          <iframe
            className="mon-3d-modal-frame"
            src={src}
            title={`RustMaps 3D model — ${name}`}
            onLoad={() => setFrameLoaded(true)}
          />
          {/* Our own loading overlay covers the body until the iframe fires
              onLoad, then fades out. */}
          <div className={`mon-3d-loading ${loaded ? 'mon-3d-loading--done' : ''}`}>
            <span className="mon-3d-spinner" aria-hidden="true" />
            <span className="mon-3d-loading-text">Loading 3D model…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {  return (
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
