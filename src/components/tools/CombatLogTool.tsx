import { useState } from 'react';
import { Terminal, Play, Trash2, Crosshair, Target, Skull, Activity } from 'lucide-react';
import './CombatLogTool.css';

interface CombatEvent {
  time: string;
  attacker: string;
  victim: string;
  weapon: string;
  ammo: string;
  area: string;
  distance: string;
  oldHp?: string;
  newHp?: string;
  hp: string;
  info: string;
  type: 'dealt' | 'taken' | 'invalid' | 'kill' | 'death' | 'generic';
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

const SAMPLE_LOG_PVP = `00:01.12 you 76561198000000001 Player_Ninja 76561198000000002 ak47 ammo.rifle head 18.2m 100.0 65.2 hit
00:01.35 you 76561198000000001 Player_Ninja 76561198000000002 ak47 ammo.rifle chest 18.1m 65.2 40.5 hit
00:01.55 Player_Ninja 76561198000000002 you 76561198000000001 mp5 ammo.pistol chest 18.0m 100.0 80.4 hit
00:01.78 you 76561198000000001 Player_Ninja 76561198000000002 ak47 ammo.rifle head 18.0m 40.5 10.1 hit
00:01.99 Player_Ninja 76561198000000002 you 76561198000000001 mp5 ammo.pistol stomach 18.0m 80.4 55.2 hit
00:02.12 you 76561198000000001 Player_Ninja 76561198000000002 ak47 ammo.rifle chest 18.0m 10.1 0.0 killed
00:02.40 Player_Sniper 76561198000000003 you 76561198000000001 bolt ammo.rifle head 115.4m 55.2 0.0 killed`;

const SAMPLE_LOG_INVALID = `10:14.05 you 76561198000000001 Shifty_Sam 76561198000000004 ak47 ammo.rifle chest 25.4m 100.0 75.1 hit
10:14.22 you 76561198000000001 Shifty_Sam 76561198000000004 ak47 ammo.rifle chest 25.5m 75.1 invalid projectile_invalid
10:14.40 you 76561198000000001 Shifty_Sam 76561198000000004 ak47 ammo.rifle head 25.5m 75.1 invalid projectile_invalid
10:14.65 Shifty_Sam 76561198000000004 you 76561198000000001 custom ammo.pistol chest 25.2m 100.0 60.5 hit
10:14.80 Shifty_Sam 76561198000000004 you 76561198000000001 custom ammo.pistol head 25.1m 60.5 15.0 hit
10:15.02 Shifty_Sam 76561198000000004 you 76561198000000001 custom ammo.pistol chest 25.0m 15.0 0.0 killed`;

const emptyStats = { damageDealt: 0, damageTaken: 0, headshots: 0, totalHitsDealt: 0, invalids: 0, kills: 0, deaths: 0 };

export function CombatLogTool() {
  const [logText, setLogText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [stats, setStats] = useState({ ...emptyStats });
  const [opponents, setOpponents] = useState<Record<string, OpponentStat>>({});
  const [hitDistribution, setHitDistribution] = useState({ head: 0, chest: 0, stomach: 0, limbs: 0, total: 0 });

  const loadSample = (sample: string) => { setLogText(sample); parseLog(sample); };

  const clearLog = () => {
    setLogText(''); setEvents([]); setParsed(false); setShowInput(true);
    setStats({ ...emptyStats }); setOpponents({});
    setHitDistribution({ head: 0, chest: 0, stomach: 0, limbs: 0, total: 0 });
  };

  const parseLog = (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : logText;
    if (!text.trim()) return;
    const lines = text.split('\n');
    const parsedEvents: CombatEvent[] = [];
    let dmgDealt = 0, dmgTaken = 0, hs = 0, hits = 0, invalids = 0, kills = 0, deaths = 0;
    let head = 0, chest = 0, stomach = 0, limbs = 0, hitTotal = 0;
    const opponentMap: Record<string, OpponentStat> = {};

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.toLowerCase().startsWith('time') || line.toLowerCase().startsWith('active')) continue;
      const t = line.split(/\s+/);
      if (t.length < 5) continue;

      const clean = (s: string) => { if (!s) return 'unknown'; const i = s.indexOf('('); return i > -1 ? s.slice(0, i) : s; };
      let attacker = 'unknown', victim = 'unknown', weapon = 'unknown', ammo = 'unknown', area = 'none', distance = '0m', oldHp = '100.0', newHp = '100.0', hp = '100', info = '';

      if (t.length >= 11) {
        attacker = clean(t[1]); victim = clean(t[3]); weapon = t[5]; ammo = t[6]; area = t[7];
        distance = t[8].endsWith('m') ? t[8] : t[8] + 'm';
        oldHp = t[9]; newHp = t[10]; hp = t[10]; info = t.slice(11).join(' ') || '-';
      } else {
        attacker = clean(t[1]); victim = clean(t[2]); weapon = t[3]; ammo = t[4]; area = t[5];
        distance = t[6].endsWith('m') ? t[6] : t[6] + 'm';
        if (t[7]?.toLowerCase() === 'invalid') { oldHp = '100.0'; newHp = 'invalid'; hp = 'invalid'; info = t.slice(7).join(' '); }
        else { oldHp = '100.0'; newHp = t[7] || '100.0'; hp = newHp; info = t.slice(8).join(' '); }
      }

      let type: CombatEvent['type'] = 'generic';
      const isAtkYou = attacker.toLowerCase() === 'you';
      const isVicYou = victim.toLowerCase() === 'you';
      const isInvalid = info.toLowerCase().includes('invalid') || hp.toLowerCase() === 'invalid' || info.toLowerCase().includes('desync');
      if (isInvalid) type = 'invalid';
      else if (info.toLowerCase().includes('killed') || info.toLowerCase().includes('death') || newHp === '0.0' || newHp === '0') type = isAtkYou ? 'kill' : (isVicYou ? 'death' : 'generic');
      else if (isAtkYou) type = 'dealt';
      else if (isVicYou) type = 'taken';

      parsedEvents.push({ time: t[0] || '00:00', attacker, victim, weapon, ammo, area, distance, oldHp, newHp, hp, info, type });
      if (type === 'kill') kills++; else if (type === 'death') deaths++;

      const opName = isAtkYou ? victim : attacker;
      if (opName && opName !== 'you' && opName !== 'unknown') {
        if (!opponentMap[opName]) opponentMap[opName] = { name: opName, damageDealt: 0, damageTaken: 0, hitsDealt: 0, hitsTaken: 0, headshots: 0, invalids: 0 };
        const op = opponentMap[opName];
        let exact = 0;
        if (oldHp !== 'invalid' && newHp !== 'invalid') { const o = parseFloat(oldHp), n = parseFloat(newHp); if (!isNaN(o) && !isNaN(n)) exact = Math.max(0, o - n); }
        const a = area.toLowerCase();
        if (isInvalid) { invalids++; op.invalids++; }
        else if (type === 'dealt' || type === 'kill') {
          hits++; op.hitsDealt++;
          const dmg = exact > 0 ? exact : (a === 'head' ? 50 : 25);
          dmgDealt += dmg; op.damageDealt += dmg; hitTotal++;
          if (a === 'head') { hs++; op.headshots++; head++; }
          else if (['chest', 'breast', 'spine', 'body'].includes(a)) chest++;
          else if (['stomach', 'pelvis', 'hip', 'abdomen'].includes(a)) stomach++;
          else limbs++;
        } else if (type === 'taken' || type === 'death') {
          op.hitsTaken++;
          const dmg = exact > 0 ? exact : (a === 'head' ? 50 : 20);
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

  const getWeaponName = (w: string) => {
    const n = w.toLowerCase();
    if (n.includes('ak')) return 'AK-47';
    if (n.includes('bolt')) return 'Bolt AR';
    if (n.includes('mp5')) return 'MP5';
    if (n.includes('thompson')) return 'Thompson';
    if (n.includes('m39')) return 'M39';
    if (n.includes('m249')) return 'M249';
    if (n.includes('lr')) return 'LR-300';
    if (n.includes('shotgun') || n.includes('pump') || n.includes('spas') || n.includes('double')) return 'Shotgun';
    if (n.includes('bow') || n.includes('crossbow')) return 'Bow';
    if (n.includes('nail')) return 'Nailgun';
    if (n.includes('custom')) return 'Custom SMG';
    if (n.includes('pistol') || n.includes('revolver') || n.includes('semi')) return 'Pistol';
    return w;
  };

  const areaClass = (area: string) => {
    const a = area.toLowerCase();
    if (a === 'head') return 'cl-area cl-area--head';
    if (['chest', 'breast', 'spine', 'body'].includes(a)) return 'cl-area cl-area--chest';
    if (['stomach', 'pelvis', 'hip', 'abdomen'].includes(a)) return 'cl-area cl-area--stomach';
    return 'cl-area cl-area--limb';
  };

  const pct = (n: number) => hitDistribution.total > 0 ? Math.round((n / hitDistribution.total) * 100) : 0;
  const headPct = pct(hitDistribution.head), chestPct = pct(hitDistribution.chest), stomachPct = pct(hitDistribution.stomach), limbsPct = pct(hitDistribution.limbs);

  const shotsFired = stats.totalHitsDealt + stats.invalids;
  const accuracy = shotsFired > 0 ? Math.round((stats.totalHitsDealt / shotsFired) * 100) : 0;
  const headshotRate = stats.totalHitsDealt > 0 ? Math.round((stats.headshots / stats.totalHitsDealt) * 100) : 0;
  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : String(stats.kills);

  const heat = (base: string, p: number) => `rgba(${base}, ${0.1 + (p / 100) * 0.8})`;

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
            />
          </div>
          <div className="cl-input-actions">
            <button className="cl-parse" onClick={() => parseLog()}><Play size={14} /> Analyze</button>
            <button className="cl-sample" onClick={() => loadSample(SAMPLE_LOG_PVP)}>PVP sample</button>
            <button className="cl-sample" onClick={() => loadSample(SAMPLE_LOG_INVALID)}>Desync sample</button>
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
                <div className="cl-hit">
                  <div className="cl-body">
                    <div className="cl-body-part cl-body-head" style={{ background: heat('59,130,246', headPct) }}>H<em>{headPct}%</em></div>
                    <div className="cl-body-part cl-body-chest" style={{ background: heat('34,197,94', chestPct) }}>C<em>{chestPct}%</em></div>
                    <div className="cl-body-part cl-body-stomach" style={{ background: heat('245,158,11', stomachPct) }}>S<em>{stomachPct}%</em></div>
                    <div className="cl-body-part cl-body-limbs" style={{ background: heat('229,92,37', limbsPct) }}>L<em>{limbsPct}%</em></div>
                  </div>
                  <div className="cl-hit-bars">
                    {[['Head', hitDistribution.head, headPct, 'head'], ['Chest', hitDistribution.chest, chestPct, 'chest'], ['Stomach', hitDistribution.stomach, stomachPct, 'stomach'], ['Limbs', hitDistribution.limbs, limbsPct, 'limbs']].map(([label, n, p, k]) => (
                      <div className="cl-hit-row" key={k as string}>
                        <span className="cl-hit-label">{label} <em>{n as number}</em></span>
                        <div className="cl-hit-track"><div className={`cl-hit-fill cl-hit-fill--${k}`} style={{ width: `${p}%` }} /></div>
                        <span className="cl-hit-pct">{p as number}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="cl-card">
                <h3 className="cl-card-h"><Skull size={14} /> Targets</h3>
                <div className="cl-opps">
                  {Object.values(opponents).map((op) => {
                    const acc = op.hitsDealt > 0 ? Math.round(((op.hitsDealt - op.invalids) / op.hitsDealt) * 100) : 0;
                    const tot = op.damageDealt + op.damageTaken;
                    const dealtPct = tot > 0 ? Math.round((op.damageDealt / tot) * 100) : 50;
                    return (
                      <div key={op.name} className="cl-opp">
                        <div className="cl-opp-top">
                          <span className="cl-opp-name">{op.name}</span>
                          <span className="cl-opp-acc">acc {acc}%</span>
                        </div>
                        <div className="cl-opp-bar"><div className="cl-opp-bar-dealt" style={{ width: `${dealtPct}%` }} /><div className="cl-opp-bar-taken" style={{ width: `${100 - dealtPct}%` }} /></div>
                        <div className="cl-opp-nums">
                          <span className="cl-up">▲ {op.damageDealt}</span>
                          <span className="cl-down">▼ {op.damageTaken}</span>
                          <span className="cl-mut">{op.hitsDealt} hits · {op.headshots} hs{op.invalids ? ` · ${op.invalids} inv` : ''}</span>
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
                  {events.map((ev, i) => {
                    const dmg = ev.oldHp && ev.newHp && ev.newHp !== 'invalid' ? Math.round(parseFloat(ev.oldHp) - parseFloat(ev.newHp)) : null;
                    let label = 'EVENT', desc = '', tone = 'gen';
                    if (ev.type === 'dealt') { tone = 'dealt'; label = 'HIT'; desc = `${ev.victim} · ${ev.area} · ${ev.distance}${dmg ? ` · −${dmg}` : ''}`; }
                    else if (ev.type === 'taken') { tone = 'taken'; label = 'TOOK'; desc = `${ev.attacker} · ${ev.area} · ${ev.distance}${dmg ? ` · −${dmg}` : ''}`; }
                    else if (ev.type === 'invalid') { tone = 'invalid'; label = 'INVALID'; desc = `→ ${ev.victim} · ${ev.info}`; }
                    else if (ev.type === 'kill') { tone = 'kill'; label = 'KILL'; desc = `${ev.victim} · ${ev.distance}`; }
                    else if (ev.type === 'death') { tone = 'death'; label = 'DEATH'; desc = `by ${ev.attacker} · ${ev.distance}`; }
                    else { label = (ev.info || 'event').toUpperCase(); desc = `${ev.attacker} → ${ev.victim}`; }
                    return (
                      <div key={i} className={`cl-ev cl-ev--${tone}`}>
                        <span className="cl-ev-time">{ev.time}</span>
                        <span className="cl-ev-dot" />
                        <div className="cl-ev-body">
                          <span className="cl-ev-label">{label}</span>
                          {ev.weapon !== 'unknown' && <span className="cl-ev-weapon">{getWeaponName(ev.weapon)}</span>}
                          {ev.area !== 'none' && <span className={areaClass(ev.area)}>{ev.area}</span>}
                          <span className="cl-ev-desc">{desc}</span>
                        </div>
                      </div>
                    );
                  })}
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
