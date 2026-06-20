import { useState, useMemo } from 'react';
import {
  RAID_TARGETS, RAID_TOOLS, RESOURCE_META,
  computeRaidCost, computeBestCombo, sumResources,
  RaidTarget, RaidResult, ResourceCost, Category,
} from '../../utils/raidcost';
import { broadcastToTeam, sendDiscordWebhook, useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMapStore } from '../../stores/map-store';
import Toggle from '../ui/Toggle';
import {
  Search, RotateCcw, Info, Bomb, Flame, Hammer,
  Swords, Copy, MessageSquare, Send, Clock, Check, Zap, Trophy, Crown,
} from 'lucide-react';

/** rusthelp CDN icon by item shortname (dots/underscores → dashes). */
function icon(shortname: string): string {
  return `https://cdn.rusthelp.com/images/256/${shortname.replace(/[._]/g, '-')}.webp`;
}
function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
}

const CATEGORY_LABEL: Record<Category, string> = {
  wall: 'WALLS', door: 'DOORS', external: 'EXTERNAL WALLS', window: 'WINDOWS & FRAMES', deployable: 'DEPLOYABLES / TRAPS',
};
const CATEGORY_ORDER: Category[] = ['wall', 'door', 'external', 'window', 'deployable'];

const MODE_META: Record<'explosive' | 'fire' | 'melee' | 'siege', { label: string; Icon: typeof Bomb }> = {
  explosive: { label: 'Explosives', Icon: Bomb },
  fire: { label: 'Fire / Fuel', Icon: Flame },
  melee: { label: 'Melee / Eco', Icon: Hammer },
  siege: { label: 'Siege', Icon: Swords },
};

function fmtTime(secs: number): string {
  if (secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}
/** Exact integer with thousands separators — raiders need precise stack counts. */
function exact(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}
/** Compact sulfur label (1.2k). */
function compact(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

/** A single method or a multi-tool mix, normalised for the plan card. */
interface Plan {
  parts: RaidResult[];
  sulfur: number;
  craftSeconds: number;
  fuseSeconds: number;
  useSeconds: number;
  wb: number;
  isMix: boolean;
}

/** Multiply a result's amounts by structure quantity (reusable rams stay ×1). */
function scaleResult(r: RaidResult, qty: number): RaidResult {
  if (qty <= 1) return r;
  const resMult = r.fixedCost ? 1 : qty; // one battering ram breaks many walls
  const resources: ResourceCost = {};
  for (const { key } of RESOURCE_META) {
    const v = r.resources[key];
    if (v) resources[key] = v * resMult;
  }
  return {
    ...r,
    count: r.count * qty,
    resources,
    sulfur: r.sulfur * resMult,
    craftSeconds: r.craftSeconds * resMult,
    fuseSeconds: r.fuseSeconds * qty,
    useSeconds: r.useSeconds * qty,
  };
}
function scalePlan(p: Plan, qty: number): Plan {
  if (qty <= 1) return p;
  const parts = p.parts.map((r) => scaleResult(r, qty));
  return {
    parts,
    sulfur: parts.reduce((s, r) => s + r.sulfur, 0),
    craftSeconds: parts.reduce((s, r) => s + r.craftSeconds, 0),
    fuseSeconds: parts.reduce((s, r) => s + r.fuseSeconds, 0),
    useSeconds: parts.reduce((s, r) => s + r.useSeconds, 0),
    wb: p.wb,
    isMix: p.isMix,
  };
}

export function RaidCostTool() {
  const [target, setTarget] = useState<RaidTarget>(RAID_TARGETS.find((t) => t.key === 'sheet_wall') || RAID_TARGETS[0]);
  const [hp, setHp] = useState<number>(target.hp);
  // Separate string state so the input can be cleared/typed freely without
  // snapping back to 1 on every keystroke.
  const [hpText, setHpText] = useState<string>(String(target.hp));
  const [qty, setQty] = useState<number>(1);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [raidMode, setRaidMode] = useState<'explosive' | 'fire' | 'melee' | 'siege'>('explosive');
  const [softSide, setSoftSide] = useState(false);
  const [selectedToolKey, setSelectedToolKey] = useState<string | null>(null);

  const connected = useConnectionStore((s) => s.status === 'connected');
  const hasDiscord = useSettingsStore((s) => !!s.discordWebhookUrl.trim());

  const pick = (t: RaidTarget) => {
    setTarget(t);
    setHp(t.hp);
    setHpText(String(t.hp));
    setSoftSide(false);
    setSelectedToolKey(null);
  };

  const applyHp = (v: number) => {
    const c = Math.max(1, Math.min(target.hp, v));
    setHp(c);
    setHpText(String(c));
  };

  // Filter targets based on search query
  const filteredTargets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return RAID_TARGETS;
    return RAID_TARGETS.filter((t) => t.name.toLowerCase().includes(q));
  }, [searchQuery]);

  // Group filtered targets by category
  const grouped = useMemo(() => {
    const g: Partial<Record<Category, RaidTarget[]>> = {};
    for (const t of filteredTargets) {
      (g[t.category] ||= []).push(t);
    }
    return g;
  }, [filteredTargets]);

  const supportsSoftSide = useMemo(() => {
    return Object.keys(target.counts).some((k) => k.endsWith('_soft'));
  }, [target]);

  const results = useMemo(() => computeRaidCost(target, hp, softSide), [target, hp, softSide]);
  const combo = useMemo(() => computeBestCombo(target, hp), [target, hp]);

  // Filter results based on current raidMode (already sorted cheapest-sulfur first)
  const modeResults = useMemo(() => {
    return results.filter((r) => {
      const tool = RAID_TOOLS.find((t) => t.key === r.toolKey);
      return tool?.type === raidMode;
    });
  }, [results, raidMode]);

  // Scaled-by-qty method list with relative cost bars for ranking.
  const rankedMethods = useMemo(() => {
    const scaled = modeResults.map((r) => scaleResult(r, qty));
    const maxSulfur = Math.max(1, ...scaled.map((r) => r.sulfur || 0));
    return scaled.map((r, i) => ({ r, rank: i + 1, barPct: Math.round(((r.sulfur || 0) / maxSulfur) * 100) }));
  }, [modeResults, qty]);

  const cheapest = modeResults.length ? modeResults[0] : null;

  // Active selected tool (defaults to cheapest in the mode if not manually set)
  const activeResult = useMemo(() => {
    if (!modeResults.length) return null;
    const found = modeResults.find((r) => r.toolKey === selectedToolKey);
    return found || modeResults[0];
  }, [modeResults, selectedToolKey]);

  const activeToolMeta = useMemo(() => {
    if (!activeResult) return null;
    return RAID_TOOLS.find((t) => t.key === activeResult.toolKey) || null;
  }, [activeResult]);

  // Cheapest practical single method (non-eco, traditional explosive)
  const cheapestPractical = useMemo(() => {
    const explosives = results.filter((r) => {
      const tool = RAID_TOOLS.find((t) => t.key === r.toolKey);
      return tool?.type === 'explosive' && !tool.eco;
    });
    return explosives.length ? explosives[0] : null;
  }, [results]);

  // Recommended plan: combo mix if cheaper than single practical explosive, else single
  const basePlan = useMemo(() => {
    const useMix = combo && combo.parts.length > 1 && cheapestPractical && combo.sulfur < cheapestPractical.sulfur;
    if (useMix && combo) {
      return { parts: combo.parts, sulfur: combo.sulfur, craftSeconds: combo.craftSeconds, fuseSeconds: combo.fuseSeconds, useSeconds: combo.parts.reduce((s, p) => s + p.useSeconds, 0), wb: combo.wb, isMix: true };
    }
    if (cheapestPractical) {
      return { parts: [cheapestPractical], sulfur: cheapestPractical.sulfur, craftSeconds: cheapestPractical.craftSeconds, fuseSeconds: cheapestPractical.fuseSeconds, useSeconds: cheapestPractical.useSeconds, wb: cheapestPractical.wb, isMix: false };
    }
    return null;
  }, [combo, cheapestPractical]);

  const plan = useMemo(() => (basePlan ? scalePlan(basePlan, qty) : null), [basePlan, qty]);
  const planResources = useMemo(() => (plan ? sumResources(plan.parts) : {}), [plan]);
  const planSaves = basePlan?.isMix && cheapestPractical ? (cheapestPractical.sulfur - basePlan.sulfur) * qty : 0;

  const isFullHp = hp >= target.hp;

  // Share helpers
  const planSummary = (): string => {
    if (!plan) return '';
    const where = qty > 1 ? `${qty}× ${target.name}` : target.name;
    const parts = plan.parts.map((p) => `${p.count}${p.countLabel === 'hits' ? ' hits' : '×'} ${p.toolShort}`).join(' + ');
    return `[RAID] ${where}: ${parts} — ${exact(plan.sulfur)} sulfur, WB${plan.wb}, craft ${fmtTime(plan.craftSeconds)}`;
  };
  const planDetail = (): string => {
    if (!plan) return '';
    const where = qty > 1 ? `${qty}× ${target.name}` : `${target.name} (${target.hp} HP)`;
    const parts = plan.parts.map((p) => `  • ${p.count}${p.countLabel === 'hits' ? ' hits' : '×'} ${p.toolName}`).join('\n');
    const res = RESOURCE_META.filter((m) => (planResources[m.key] || 0) > 0)
      .map((m) => `  ${m.label}: ${exact(planResources[m.key]!)}`).join('\n');
    return `RAID COST — ${where}\n${parts}\n\nResources:\n${res}\n\nWorkbench: Level ${plan.wb}\nCraft: ${fmtTime(plan.craftSeconds)}\nActive Throw/Shoot/Swing: ${fmtTime(plan.useSeconds)}${plan.fuseSeconds > 0 ? `\nFuse/Detonation Delay: ${fmtTime(plan.fuseSeconds)}` : ''}`;
  };
  const toast = (title: string, msg: string, type: 'info' | 'success' | 'warning' = 'info') =>
    useMapStore.getState().addToast(title, msg, type);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(planDetail());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copy failed', 'Clipboard unavailable.', 'warning');
    }
  };
  const onBroadcast = async () => {
    const ok = await broadcastToTeam(planSummary());
    toast(ok ? 'Sent to team' : 'Not sent', ok ? planSummary() : 'You must be in a team and in-game online.', ok ? 'success' : 'warning');
  };
  const onDiscord = async () => {
    if (!plan) return;
    const ok = await sendDiscordWebhook(`🧨 **Raid Cost**\n\`\`\`\n${planDetail()}\n\`\`\``, 'raid', [
      { name: 'Target', value: qty > 1 ? `${qty}× ${target.name}` : target.name, inline: true },
      { name: 'Sulfur', value: `${exact(plan.sulfur)}`, inline: true },
      { name: 'Workbench', value: `Level ${plan.wb}`, inline: true },
      { name: 'Method', value: plan.parts.map((p) => `${p.count}× ${p.toolShort}`).join(' + '), inline: false },
    ]);
    toast(ok ? 'Sent to Discord' : 'Not sent', ok ? 'Raid cost posted to your webhook.' : 'Set a Discord webhook in Settings first.', ok ? 'success' : 'warning');
  };

  const hpPct = Math.round((hp / target.hp) * 100);

  return (
    <div className="rc">
      <div className="rc-head">
        <h3>RAID COST CALCULATOR</h3>
        <p>Pick a target, dial in its remaining HP, and get the cheapest verified way to break it — ranked by sulfur.</p>
      </div>

      <div className="rc-layout">
        {/* ───────── Sidebar: target picker ───────── */}
        <aside className="rc-sidebar">
          <div className="rc-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search structure…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="rc-tgt-list">
            {CATEGORY_ORDER.map((cat) => {
              const list = grouped[cat];
              if (!list || list.length === 0) return null;
              return (
                <div key={cat} className="rc-cat">
                  <div className="rc-cat-title">{CATEGORY_LABEL[cat]}</div>
                  {list.map((t) => (
                    <button
                      key={t.key}
                      className={`rc-tgt ${target.key === t.key ? 'active' : ''}`}
                      onClick={() => pick(t)}
                    >
                      <img src={icon(t.icon || 'building.planner')} alt="" onError={hideOnError} />
                      <span className="rc-tgt-name">{t.name}</span>
                      <span className="rc-tgt-hp">{t.hp}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {Object.keys(grouped).length === 0 && <span className="rc-empty">No structures found.</span>}
          </div>
        </aside>

        {/* ───────── Main panel ───────── */}
        <div className="rc-main">
          {/* Target hero */}
          <div className="rc-hero">
            <div className="rc-hero-id">
              <img className="rc-hero-icon" src={icon(target.icon || 'building.planner')} alt="" onError={hideOnError} />
              <div className="rc-hero-text">
                <span className="rc-hero-cat">{CATEGORY_LABEL[target.category]}</span>
                <span className="rc-hero-name">{target.name}</span>
                {target.blurb && <span className="rc-hero-blurb">{target.blurb}</span>}
              </div>
              <div className="rc-hero-hp">
                <span className="rc-hero-hp-val">{exact(hp)}</span>
                <span className="rc-hero-hp-max">/ {exact(target.hp)} HP</span>
              </div>
            </div>

            {/* HP control */}
            <div className="rc-hp">
              <div className="rc-hp-track">
                <input
                  type="range"
                  min={1}
                  max={target.hp}
                  value={hp}
                  onChange={(e) => applyHp(parseInt(e.target.value))}
                  style={{ ['--rc-fill' as string]: `${hpPct}%` }}
                />
              </div>
              <input
                type="number"
                min={1}
                max={target.hp}
                value={hpText}
                onChange={(e) => {
                  setHpText(e.target.value);
                  const n = parseInt(e.target.value);
                  if (!Number.isNaN(n)) setHp(Math.max(1, Math.min(target.hp, n)));
                }}
                onBlur={() => applyHp(parseInt(hpText) || target.hp)}
                className="rc-hp-num"
              />
              <button className="rc-full" onClick={() => applyHp(target.hp)} disabled={isFullHp} title="Reset to full HP">
                <RotateCcw size={11} /> FULL
              </button>
            </div>

            {/* Quantity + soft side */}
            <div className="rc-opts">
              <div className="rc-qty">
                <span className="rc-opts-label">QUANTITY</span>
                <div className="rc-qty-ctrl">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease">−</button>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
                  />
                  <button onClick={() => setQty((q) => Math.min(999, q + 1))} aria-label="Increase">+</button>
                </div>
              </div>
              {supportsSoftSide && (
                <div className="rc-soft">
                  <span className="rc-opts-label">SOFT SIDE <small>melee / eco</small></span>
                  <Toggle checked={softSide} onChange={setSoftSide} label={softSide ? 'Weak side' : 'Strong side'} />
                </div>
              )}
            </div>
          </div>

          {/* Best value featured card (explosive mode) */}
          {plan && raidMode === 'explosive' && (
            <div className={`rc-best ${plan.isMix ? 'is-mix' : ''}`}>
              <div className="rc-best-glow" />
              <div className="rc-best-head">
                <span className="rc-best-tag">
                  {plan.isMix ? <Zap size={13} /> : <Crown size={13} />}
                  {plan.isMix ? 'BEST VALUE MIX' : 'RECOMMENDED'}
                </span>
                {planSaves > 0 && <span className="rc-best-save">saves {exact(planSaves)} sulfur</span>}
                <span className="rc-wb">WB{plan.wb}</span>
              </div>

              <div className="rc-best-body">
                <div className="rc-best-cost">
                  <img src={icon('sulfur')} alt="" onError={hideOnError} />
                  <div>
                    <span className="rc-best-cost-val">{exact(plan.sulfur)}</span>
                    <span className="rc-best-cost-unit">sulfur total</span>
                  </div>
                </div>
                <div className="rc-best-parts">
                  {plan.parts.map((p) => (
                    <span key={p.toolKey} className="rc-chip">
                      <img src={icon(p.icon)} alt="" onError={hideOnError} />
                      <b>{p.count}{p.countLabel === 'hits' ? ' hits' : '×'}</b> {p.toolShort}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rc-best-mats">
                <span className="rc-mats-label">FULL SHOPPING LIST</span>
                <div className="rc-res big">
                  {RESOURCE_META.filter((m) => (planResources[m.key] || 0) > 0).map((m) => (
                    <span key={m.key} className={`rc-res-cell ${m.key === 'sulfur' ? 'primary' : ''}`} title={m.label}>
                      <img src={icon(m.slug)} alt="" onError={hideOnError} />
                      {exact(planResources[m.key]!)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rc-best-foot">
                <TimeChips craft={plan.craftSeconds} fuse={plan.fuseSeconds} use={plan.useSeconds} />
                <div className="rc-actions">
                  <button className="rc-act" onClick={onCopy}>
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button className="rc-act" onClick={onBroadcast} disabled={!connected} title={connected ? 'Send to team chat' : 'Connect to a server first'}>
                    <MessageSquare size={12} /> Team
                  </button>
                  {hasDiscord && (
                    <button className="rc-act" onClick={onDiscord}>
                      <Send size={12} /> Discord
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mode tabs */}
          <div className="rc-modes">
            {(Object.keys(MODE_META) as (keyof typeof MODE_META)[]).map((m) => {
              const { label, Icon } = MODE_META[m];
              return (
                <button key={m} className={`rc-mode ${raidMode === m ? 'active' : ''}`} onClick={() => setRaidMode(m)}>
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>

          {/* Ranked methods */}
          <div className="rc-methods">
            <div className="rc-methods-head">
              <span className="rc-methods-title"><Trophy size={13} /> BEST METHODS</span>
              <span className="rc-methods-hint">ranked cheapest first · per {qty > 1 ? `${qty} structures` : 'structure'}</span>
            </div>

            {rankedMethods.map(({ r, rank, barPct }) => {
              const isActive = activeResult?.toolKey === r.toolKey;
              const isCheapest = cheapest?.toolKey === r.toolKey;
              const showBar = r.sulfur > 0; // bar ranks sulfur cost — meaningless for eco/melee
              return (
                <button
                  key={r.toolKey}
                  className={`rc-method ${isActive ? 'active' : ''} ${isCheapest ? 'best' : ''}`}
                  onClick={() => setSelectedToolKey(r.toolKey)}
                >
                  <span className={`rc-rank ${rank <= 3 ? `r${rank}` : ''}`}>{rank}</span>
                  <img className="rc-method-icon" src={icon(r.icon)} alt="" onError={hideOnError} />
                  <div className="rc-method-mid">
                    <div className="rc-method-top">
                      <span className="rc-method-name">{r.toolShort}</span>
                      {isCheapest && <span className="rc-best-pill">CHEAPEST</span>}
                      <span className={`rc-method-wb wb${r.wb}`}>{r.wb > 0 ? `WB ${r.wb}` : 'NO WB'}</span>
                    </div>
                    {showBar
                      ? <div className="rc-method-bar"><span style={{ width: `${Math.max(6, barPct)}%` }} /></div>
                      : <span className="rc-method-submeta">{r.fixedCost ? 'reusable tool' : 'no sulfur cost'}</span>}
                  </div>
                  <div className="rc-method-cost">
                    <span className="rc-method-count">{exact(r.count)}<small>{r.countLabel === 'hits' ? ' hits' : '×'}</small></span>
                    {r.sulfur > 0 && (
                      <span className="rc-method-sulfur" title="Total sulfur">
                        <img src={icon('sulfur')} alt="" onError={hideOnError} />{compact(r.sulfur)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {rankedMethods.length === 0 && <p className="rc-empty">No methods of this type apply to this target.</p>}
          </div>

          {/* Blueprint / research detail for the selected method */}
          {activeToolMeta && activeResult && (
            <div className="rc-detail">
              <div className="rc-detail-head">
                <span className="rc-detail-title"><Info size={13} /> {activeToolMeta.name}</span>
                <div className="rc-detail-badges">
                  <span className={`rc-bp wb${activeToolMeta.wb}`}>
                    {activeToolMeta.wb > 0 ? `Workbench ${activeToolMeta.wb}` : 'No Workbench'}
                  </span>
                  {activeToolMeta.researchScrap ? (
                    <span className="rc-bp scrap">Research {activeToolMeta.researchScrap} scrap</span>
                  ) : activeToolMeta.key === 'jackhammer' ? (
                    <span className="rc-bp scrap">150 scrap @ Outpost</span>
                  ) : (
                    <span className="rc-bp wb0">Default Blueprint</span>
                  )}
                </div>
              </div>
              <p className="rc-detail-blurb">{activeToolMeta.blurb}</p>

              <div className="rc-detail-grid">
                <div className="rc-mats">
                  <span className="rc-mats-label">COST PER UNIT</span>
                  <ResourceBar resources={activeToolMeta.cost} compact />
                </div>
                <div className="rc-mats">
                  <span className="rc-mats-label">
                    TOTAL · {qty > 1 ? `${qty}× ${target.name}` : target.name} ({exact(scaleResult(activeResult, qty).count)} {activeResult.countLabel || 'units'})
                  </span>
                  <ResourceBar resources={scaleResult(activeResult, qty).resources} />
                </div>
              </div>

              <TimeChips
                craft={activeResult.craftSeconds * (activeToolMeta.fixedCost ? 1 : qty)}
                fuse={activeResult.fuseSeconds * qty}
                use={activeResult.useSeconds * qty}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceBar({ resources, compact: isCompact }: { resources: ResourceCost; compact?: boolean }) {
  const cells = RESOURCE_META.filter((m) => (resources[m.key] || 0) > 0);
  if (cells.length === 0) return null;
  return (
    <div className={`rc-res ${isCompact ? 'compact' : ''}`}>
      {cells.map((m) => (
        <span key={m.key} className={`rc-res-cell ${m.key === 'sulfur' ? 'primary' : ''}`} title={m.label}>
          <img src={icon(m.slug)} alt="" onError={hideOnError} />
          {exact(resources[m.key]!)}
        </span>
      ))}
    </div>
  );
}

function TimeChips({ craft, fuse, use }: { craft: number; fuse: number; use: number }) {
  return (
    <div className="rc-times">
      <span title="Total time to craft every placement">
        <Hammer size={12} /> craft {fmtTime(craft)}
      </span>
      {use > 0 && (
        <span title="Total time spent actively throwing, shooting, or swinging">
          <Clock size={12} /> use {fmtTime(use)}
        </span>
      )}
      {fuse > 0 && (
        <span title="Total in-raid detonation/fuse time for every placement">
          <Flame size={12} /> fuse {fmtTime(fuse)}
        </span>
      )}
    </div>
  );
}
