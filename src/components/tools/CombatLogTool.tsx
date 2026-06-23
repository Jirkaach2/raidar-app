import { useState } from 'react';
import { Terminal, Play, Trash2, Crosshair, Target, Skull, Activity } from 'lucide-react';
import './CombatLogTool.css';

type EventType = 'dealt' | 'taken' | 'invalid' | 'kill' | 'death' | 'generic';

interface CombatEvent {
  time: string;
  attacker: string;   // resolved, human-readable
  victim: string;     // resolved, human-readable
  weapon: string;     // resolved display name ('' when unknown)
  area: string;       // bone / hit area ('' when none)
  distance: string;
  oldHp: number | null;
  newHp: number | null;
  damage: number | null;
  info: string;
  type: EventType;
}

interface OpponentStat {
  name: string;
  damageDealt: number;
  damageTaken: number;
  hitsDealt: number;
  hitsTaken: number;
  headshots: number;
  invalids: number;
}

const emptyStats = { damageDealt: 0, damageTaken: 0, headshots: 0, totalHitsDealt: 0, invalids: 0, kills: 0, deaths: 0 };
const emptyDist = { head: 0, chest: 0, stomach: 0, limbs: 0, total: 0 };

const SAMPLE_LOG_PVP = `00:01.12 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle head 18.2m 100.0 65.2 hit
00:01.35 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 18.1m 65.2 40.5 hit
00:01.55 Ninja_Pete 76561198000000002 you 76561198000000001 assets/prefabs/weapons/mp5/mp5.entity.prefab ammo.pistol chest 18.0m 100.0 80.4 hit
00:01.78 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle head 18.0m 40.5 10.1 hit
00:01.99 Ninja_Pete 76561198000000002 you 76561198000000001 assets/prefabs/weapons/mp5/mp5.entity.prefab ammo.pistol stomach 18.0m 80.4 55.2 hit
00:02.12 you 76561198000000001 Ninja_Pete 76561198000000002 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 18.0m 10.1 0.0 killed
00:03.40 assets/prefabs/npc/scientist/scientistnpc_roam.prefab 0 you 76561198000000001 assets/prefabs/weapons/spas12/spas12.entity.prefab ammo.shotgun chest 9.4m 100.0 71.0 hit
00:03.95 you 76561198000000001 assets/prefabs/npc/scientist/scientistnpc_roam.prefab 0 assets/prefabs/weapons/spear wooden/spear.wooden.entity.prefab ammo.spear head 4.1m 80.0 0.0 killed
00:05.10 Bolt_Andy 76561198000000003 you 76561198000000001 assets/prefabs/weapons/bolt rifle/bolt.entity.prefab ammo.rifle head 115.4m 55.2 0.0 killed`;

const SAMPLE_LOG_DESYNC = `10:14.05 you 76561198000000001 Shifty_Sam 76561198000000004 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 25.4m 100.0 75.1 hit
10:14.22 you 76561198000000001 Shifty_Sam 76561198000000004 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle chest 25.5m 75.1 invalid projectile_invalid
10:14.40 you 76561198000000001 Shifty_Sam 76561198000000004 assets/prefabs/weapons/ak47/ak47.entity.prefab ammo.rifle head 25.5m 75.1 invalid projectile_invalid
10:14.65 Shifty_Sam 76561198000000004 you 76561198000000001 assets/prefabs/weapons/smg/smg.entity.prefab ammo.pistol chest 25.2m 100.0 60.5 hit 0.42 187ms
10:14.80 Shifty_Sam 76561198000000004 you 76561198000000001 assets/prefabs/weapons/smg/smg.entity.prefab ammo.pistol head 25.1m 60.5 15.0 hit 0.39 203ms
10:15.02 Shifty_Sam 76561198000000004 you 76561198000000001 assets/prefabs/weapons/smg/smg.entity.prefab ammo.pistol chest 25.0m 15.0 0.0 killed 0.40 211ms`;

// ── helpers ────────────────────────────────────────────────
const titleCase = (s: string) =>
  s.replace(/[._\-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Turn a weapon column (short name OR full prefab path) into a clean display name. */
function resolveWeapon(raw: string): string {
  if (!raw) return '';
  let seg = raw.trim();
  if (seg.includes('/')) seg = seg.slice(seg.lastIndexOf('/') + 1);
  seg = seg
    .replace(/\.entity\.prefab$/i, '')
    .replace(/\.deployed$/i, '')
    .replace(/\.prefab$/i, '')
    .replace(/\.entity$/i, '');
  const n = seg.toLowerCase().replace(/[._\-\s]/g, '');
  if (!n) return '';

  if (n.includes('ak47') || n.includes('rifleak')) return 'AK-47';
  if (n.includes('lr300') || n.includes('lr3') || n === 'lr') return 'LR-300';
  if (n.includes('m249')) return 'M249';
  if (n.includes('m39')) return 'M39';
  if (n.includes('mp5')) return 'MP5';
  if (n.includes('thompson')) return 'Thompson';
  if (n.includes('customsmg') || n.includes('smg') || n.includes('custom')) return 'Custom SMG';
  if (n.includes('bolt')) return 'Bolt Action';
  if (n.includes('l96') || n.includes('m92')) return n.includes('l96') ? 'L96' : 'M92';
  if (n.includes('semiautorifle') || n.includes('sar')) return 'Semi-Auto Rifle';
  if (n.includes('crossbow')) return 'Crossbow';
  if (n.includes('bow') || n.includes('compound')) return 'Bow';
  if (n.includes('spas') || n.includes('pump') || n.includes('double') || n.includes('shotgun') || n.includes('waterpipe')) return 'Shotgun';
  if (n.includes('nailgun') || n.includes('nail')) return 'Nailgun';
  if (n.includes('rocket') || n.includes('rpg')) return 'Rocket';
  if (n.includes('grenade') || n.includes('f1')) return 'Grenade';
  if (n.includes('revolver')) return 'Revolver';
  if (n.includes('python')) return 'Python';
  if (n.includes('m92')) return 'M92';
  if (n.includes('semiautopistol') || n.includes('semiauto') || n.includes('pistol')) return 'Pistol';
  if (n.includes('spear')) return 'Spear';
  if (n.includes('machete') || n.includes('knife') || n.includes('salvaged') || n.includes('mace') || n.includes('sword')) return 'Melee';
  if (n.includes('rock')) return 'Rock';
  if (n.includes('eoka')) return 'Eoka';
  if (n.includes('flame')) return 'Flamethrower';
  if (n.includes('beancan') || n.includes('satchel')) return 'Explosive';
  return titleCase(seg) || raw;
}

/** Turn an attacker/target column (name, steamID64, or prefab path) into a clean label. */
function resolveName(raw: string): string {
  if (!raw) return 'Unknown';
  const v = raw.trim();
  if (v.toLowerCase() === 'you') return 'You';
  if (/^\d{17}$/.test(v)) return `Steam …${v.slice(-5)}`;

  if (v.includes('/')) {
    const lower = v.toLowerCase();
    if (lower.includes('scientist')) return 'Scientist';
    if (lower.includes('tunneldweller') || lower.includes('tunnel_dweller')) return 'Tunnel Dweller';
    if (lower.includes('scarecrow')) return 'Scarecrow';
    if (lower.includes('murderer')) return 'Murderer';
    if (lower.includes('bradley')) return 'Bradley APC';
    if (lower.includes('patrolhelicopter') || lower.includes('helicopter')) return 'Patrol Heli';
    if (lower.includes('bear')) return 'Bear';
    if (lower.includes('wolf')) return 'Wolf';
    if (lower.includes('boar')) return 'Boar';
    if (lower.includes('stag') || lower.includes('deer')) return 'Stag';
    if (lower.includes('chicken')) return 'Chicken';
    if (lower.includes('shark')) return 'Shark';
    let seg = v.slice(v.lastIndexOf('/') + 1)
      .replace(/\.prefab$/i, '').replace(/\.entity$/i, '')
      .replace(/npc[_\s]*/i, '').replace(/[_\s]*roam$/i, '');
    return titleCase(seg) || 'NPC';
  }
  return v; // plain readable player name
}

const HEAD = ['head'];
const CHEST = ['chest', 'breast', 'spine', 'body', 'neck'];
const STOMACH = ['stomach', 'pelvis', 'hip', 'abdomen', 'groin'];
function zoneOf(area: string): 'head' | 'chest' | 'stomach' | 'limbs' {
  const a = area.toLowerCase();
  if (HEAD.includes(a)) return 'head';
  if (CHEST.includes(a)) return 'chest';
  if (STOMACH.includes(a)) return 'stomach';
  return 'limbs';
}

export function CombatLogTool() {
  const [logText, setLogText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [stats, setStats] = useState({ ...emptyStats });
  const [opponents, setOpponents] = useState<Record<string, OpponentStat>>({});
  const [hitDistribution, setHitDistribution] = useState({ ...emptyDist });

  const loadSample = (sample: string) => { setLogText(sample); parseLog(sample); };

  const clearLog = () => {
    setLogText(''); setEvents([]); setParsed(false); setShowInput(true);
    setStats({ ...emptyStats }); setOpponents({}); setHitDistribution({ ...emptyDist });
  };

  const parseLog = (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : logText;
    if (!text.trim()) return;

    const parsedEvents: CombatEvent[] = [];
    let dmgDealt = 0, dmgTaken = 0, hs = 0, hits = 0, invalids = 0, kills = 0, deaths = 0;
    let head = 0, chest = 0, stomach = 0, limbs = 0, hitTotal = 0;
    const opponentMap: Record<string, OpponentStat> = {};

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const low = line.toLowerCase();
      if (low.startsWith('time') || low.startsWith('active') || low.startsWith('attacker')) continue;

      const t = line.split(/\s+/);
      if (t.length < 6) continue;

      // Anchor on the distance token (e.g. "18.2m") — everything is positioned around it.
      const di = t.findIndex((tok, idx) => idx > 0 && /^\d+(\.\d+)?m$/i.test(tok));
      if (di < 4) continue; // not a parseable combat line

      const time = t[0];
      const distance = t[di];
      const oldRaw = t[di + 1];
      const newRaw = t[di + 2];
      const info = t.slice(di + 3).join(' ').trim();
      const area = di - 1 > 0 ? t[di - 1] : '';
      // ammo lives at di-2 (we don't surface it, but it bounds the weapon)
      const middle = t.slice(1, di - 2); // attacker, attackerId, target, targetId, weapon…

      // Locate the two numeric ID columns inside `middle`.
      const idIdx: number[] = [];
      middle.forEach((tok, i) => { if (/^\d+$/.test(tok)) idIdx.push(i); });

      let attackerRaw = '', victimRaw = '', weaponRaw = '';
      if (idIdx.length >= 2) {
        const a = idIdx[0], b = idIdx[1];
        attackerRaw = middle.slice(0, a).join(' ');
        victimRaw = middle.slice(a + 1, b).join(' ');
        weaponRaw = middle.slice(b + 1).join(' ');
      } else if (idIdx.length === 1) {
        const a = idIdx[0];
        attackerRaw = middle.slice(0, a).join(' ');
        const rest = middle.slice(a + 1);
        victimRaw = rest[0] || '';
        weaponRaw = rest.slice(1).join(' ');
      } else {
        attackerRaw = middle[0] || '';
        victimRaw = middle[1] || '';
        weaponRaw = middle.slice(2).join(' ');
      }

      const attacker = resolveName(attackerRaw);
      const victim = resolveName(victimRaw);
      const weapon = resolveWeapon(weaponRaw);

      const oldHp = oldRaw && /^\d+(\.\d+)?$/.test(oldRaw) ? parseFloat(oldRaw) : null;
      const newHp = newRaw && /^\d+(\.\d+)?$/.test(newRaw) ? parseFloat(newRaw) : null;
      const isInvalid = /invalid|projectile_invalid|desync/i.test(newRaw + ' ' + info);
      const damage = oldHp !== null && newHp !== null ? Math.max(0, Math.round(oldHp - newHp)) : null;

      const isAtkYou = attacker === 'You';
      const isVicYou = victim === 'You';
      const isKill = /killed|death/i.test(info) || newHp === 0;

      let type: EventType = 'generic';
      if (isInvalid) type = 'invalid';
      else if (isKill) type = isAtkYou ? 'kill' : (isVicYou ? 'death' : 'generic');
      else if (isAtkYou) type = 'dealt';
      else if (isVicYou) type = 'taken';

      parsedEvents.push({ time, attacker, victim, weapon, area: area || '', distance, oldHp, newHp, damage, info, type });

      if (type === 'kill') kills++;
      else if (type === 'death') deaths++;

      // opponent aggregation (skip self / unknown)
      const opName = isAtkYou ? victim : attacker;
      if (opName && opName !== 'You' && opName !== 'Unknown') {
        const op = opponentMap[opName] ?? (opponentMap[opName] = { name: opName, damageDealt: 0, damageTaken: 0, hitsDealt: 0, hitsTaken: 0, headshots: 0, invalids: 0 });
        const zone = zoneOf(area);
        if (isInvalid) { invalids++; op.invalids++; }
        else if (type === 'dealt' || type === 'kill') {
          hits++; op.hitsDealt++; hitTotal++;
          const dmg = damage ?? (zone === 'head' ? 50 : 25);
          dmgDealt += dmg; op.damageDealt += dmg;
          if (zone === 'head') { hs++; op.headshots++; head++; }
          else if (zone === 'chest') chest++;
          else if (zone === 'stomach') stomach++;
          else limbs++;
        } else if (type === 'taken' || type === 'death') {
          op.hitsTaken++;
          const dmg = damage ?? (zone === 'head' ? 50 : 20);
          dmgTaken += dmg; op.damageTaken += dmg;
        }
      }
    }

    setEvents(parsedEvents);
    setStats({ damageDealt: Math.round(dmgDealt), damageTaken: Math.round(dmgTaken), headshots: hs, totalHitsDealt: hits, invalids, kills, deaths });
    setOpponents(opponentMap);
    setHitDistribution({ head, chest, stomach, limbs, total: hitTotal });
    setParsed(true);
    setShowInput(false);
  };

  const pct = (n: number) => hitDistribution.total > 0 ? Math.round((n / hitDistribution.total) * 100) : 0;

  const shotsFired = stats.totalHitsDealt + stats.invalids;
  const accuracy = shotsFired > 0 ? Math.round((stats.totalHitsDealt / shotsFired) * 100) : 0;
  const headshotRate = stats.totalHitsDealt > 0 ? Math.round((stats.headshots / stats.totalHitsDealt) * 100) : 0;
  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : String(stats.kills);

  const zones: { key: 'head' | 'chest' | 'stomach' | 'limbs'; label: string; n: number }[] = [
    { key: 'head', label: 'Head', n: hitDistribution.head },
    { key: 'chest', label: 'Chest', n: hitDistribution.chest },
    { key: 'stomach', label: 'Stomach', n: hitDistribution.stomach },
    { key: 'limbs', label: 'Limbs', n: hitDistribution.limbs },
  ];

  const tagFor = (ev: CombatEvent) => {
    switch (ev.type) {
      case 'kill': return 'KILL';
      case 'death': return 'DEATH';
      case 'invalid': return 'INVALID';
      case 'dealt': return 'HIT';
      case 'taken': return 'TOOK';
      default: return (ev.info || 'EVENT').toUpperCase().slice(0, 12);
    }
  };

  const descFor = (ev: CombatEvent) => {
    const d = ev.damage != null && ev.damage > 0 ? ` · −${ev.damage}` : '';
    switch (ev.type) {
      case 'dealt': return `${ev.victim} · ${ev.distance}${d}`;
      case 'kill': return `eliminated ${ev.victim} · ${ev.distance}`;
      case 'taken': return `from ${ev.attacker} · ${ev.distance}${d}`;
      case 'death': return `killed by ${ev.attacker} · ${ev.distance}`;
      case 'invalid': return `${ev.victim} · rejected hit`;
      default: return `${ev.attacker} → ${ev.victim} · ${ev.distance}`;
    }
  };

  return (
    <div className="cl">
      <header className="cl-header">
        <div className="cl-header-title">
          <span className="cl-header-icon"><Terminal size={20} /></span>
          <div>
            <h2>Combat Log Analyzer</h2>
            <p>Paste your in-game <code>combatlog</code> output for damage, accuracy and hit telemetry.</p>
          </div>
        </div>
        {parsed && (
          <div className="cl-header-actions">
            <button className="cl-mini-btn" onClick={() => setShowInput((v) => !v)}>{showInput ? 'Hide log' : 'Edit log'}</button>
            <button className="cl-mini-btn cl-mini-btn--danger" onClick={clearLog}><Trash2 size={13} /> Reset</button>
          </div>
        )}
      </header>

      {/* Input */}
      {(showInput || !parsed) && (
        <section className="cl-input-card">
          <div className="cl-term">
            <div className="cl-term-bar">
              <span className="cl-dot red" /><span className="cl-dot amber" /><span className="cl-dot green" />
              <span className="cl-term-title">RUST_CONSOLE · combatlog</span>
            </div>
            <textarea
              className="cl-textarea"
              placeholder="Press F1 in-game → type 'combatlog' → copy the output and paste it here…"
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="cl-input-actions">
            <button className="cl-parse" onClick={() => parseLog()}><Play size={14} /> Analyze</button>
            <button className="cl-sample" onClick={() => loadSample(SAMPLE_LOG_PVP)}>PVP sample</button>
            <button className="cl-sample" onClick={() => loadSample(SAMPLE_LOG_DESYNC)}>Desync sample</button>
          </div>
        </section>
      )}

      {!parsed ? (
        <div className="cl-hint-empty">
          <Crosshair size={34} />
          <p>Your damage breakdown, accuracy, headshot rate and a full event timeline appear here once you analyze a log.</p>
        </div>
      ) : (
        <>
          {/* Metric strip */}
          <div className="cl-metrics">
            <div className="cl-metric cl-metric--dealt"><span className="cl-metric-k">Damage dealt</span><span className="cl-metric-v">{stats.damageDealt}</span></div>
            <div className="cl-metric cl-metric--taken"><span className="cl-metric-k">Damage taken</span><span className="cl-metric-v">{stats.damageTaken}</span></div>
            <div className="cl-metric"><span className="cl-metric-k">K / D</span><span className="cl-metric-v">{stats.kills}/{stats.deaths} <small>({kd})</small></span></div>
            <div className="cl-metric"><span className="cl-metric-k">Accuracy</span><span className="cl-metric-v">{accuracy}<small>%</small></span></div>
            <div className="cl-metric"><span className="cl-metric-k">Headshot</span><span className="cl-metric-v">{headshotRate}<small>%</small></span></div>
            <div className={`cl-metric ${stats.invalids > 0 ? 'cl-metric--warn' : ''}`}><span className="cl-metric-k">Invalid</span><span className="cl-metric-v">{stats.invalids}</span></div>
          </div>

          <div className="cl-grid">
            {/* LEFT: hit distribution + opponents */}
            <div className="cl-col">
              <section className="cl-card">
                <h3 className="cl-card-h"><Target size={14} /> Hit distribution</h3>
                {hitDistribution.total === 0 ? (
                  <div className="cl-none">No landed hits to chart.</div>
                ) : (
                  <div className="cl-hit">
                    {/* clean silhouette heatmap */}
                    <div className="cl-figure" aria-hidden="true">
                      <span className={`cl-fig cl-fig--head cl-z-head`} style={{ opacity: 0.25 + pct(hitDistribution.head) / 100 * 0.75 }} />
                      <span className={`cl-fig cl-fig--chest cl-z-chest`} style={{ opacity: 0.25 + pct(hitDistribution.chest) / 100 * 0.75 }} />
                      <span className={`cl-fig cl-fig--stomach cl-z-stomach`} style={{ opacity: 0.25 + pct(hitDistribution.stomach) / 100 * 0.75 }} />
                      <span className={`cl-fig cl-fig--arm-l cl-z-limbs`} style={{ opacity: 0.25 + pct(hitDistribution.limbs) / 100 * 0.75 }} />
                      <span className={`cl-fig cl-fig--arm-r cl-z-limbs`} style={{ opacity: 0.25 + pct(hitDistribution.limbs) / 100 * 0.75 }} />
                      <span className={`cl-fig cl-fig--leg-l cl-z-limbs`} style={{ opacity: 0.25 + pct(hitDistribution.limbs) / 100 * 0.75 }} />
                      <span className={`cl-fig cl-fig--leg-r cl-z-limbs`} style={{ opacity: 0.25 + pct(hitDistribution.limbs) / 100 * 0.75 }} />
                    </div>
                    {/* zone bars */}
                    <div className="cl-zones">
                      {zones.map((z) => (
                        <div className="cl-zone" key={z.key}>
                          <span className={`cl-zone-key cl-z-${z.key}`}>{z.label}</span>
                          <div className="cl-zone-track">
                            <div className={`cl-zone-fill cl-zbg-${z.key}`} style={{ width: `${pct(z.n)}%` }} />
                          </div>
                          <span className="cl-zone-n">{z.n}</span>
                          <span className="cl-zone-pct">{pct(z.n)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="cl-card">
                <h3 className="cl-card-h"><Skull size={14} /> Targets</h3>
                <div className="cl-opps">
                  {Object.values(opponents).map((op) => {
                    const tot = op.damageDealt + op.damageTaken;
                    const dealtPct = tot > 0 ? Math.round((op.damageDealt / tot) * 100) : 50;
                    const hsRate = op.hitsDealt > 0 ? Math.round((op.headshots / op.hitsDealt) * 100) : 0;
                    return (
                      <div key={op.name} className="cl-opp">
                        <div className="cl-opp-top">
                          <span className="cl-opp-name">{op.name}</span>
                          <span className="cl-opp-acc">{hsRate}% hs</span>
                        </div>
                        <div className="cl-opp-bar">
                          <div className="cl-opp-bar-dealt" style={{ width: `${dealtPct}%` }} />
                          <div className="cl-opp-bar-taken" style={{ width: `${100 - dealtPct}%` }} />
                        </div>
                        <div className="cl-opp-nums">
                          <span className="cl-up">▲ {op.damageDealt} dealt</span>
                          <span className="cl-down">▼ {op.damageTaken} taken</span>
                          <span className="cl-mut">{op.hitsDealt} hits{op.invalids ? ` · ${op.invalids} inv` : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(opponents).length === 0 && <div className="cl-none">No opponents parsed.</div>}
                </div>
              </section>
            </div>

            {/* RIGHT: timeline */}
            <div className="cl-col">
              <section className="cl-card cl-card--fill">
                <h3 className="cl-card-h"><Activity size={14} /> Event timeline</h3>
                <div className="cl-timeline">
                  {events.map((ev, i) => (
                    <div key={i} className={`cl-ev cl-ev--${ev.type}`}>
                      <span className="cl-ev-time">{ev.time}</span>
                      <span className="cl-ev-dot" />
                      <div className="cl-ev-body">
                        <div className="cl-ev-line">
                          <span className="cl-ev-label">{tagFor(ev)}</span>
                          {ev.weapon && <span className="cl-ev-weapon">{ev.weapon}</span>}
                          {ev.area && <span className={`cl-area cl-area--${zoneOf(ev.area)}`}>{ev.area}</span>}
                        </div>
                        <span className="cl-ev-desc">{descFor(ev)}</span>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && <div className="cl-none">No events parsed.</div>}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
