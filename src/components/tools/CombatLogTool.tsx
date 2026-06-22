import { useState } from 'react';
import { Terminal, Play, Trash2 } from 'lucide-react';
import './CombatLogTool.css';

interface CombatEvent {
  time: string;
  attacker: string;
  attackerId?: string;
  victim: string;
  victimId?: string;
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

export function CombatLogTool() {
  const [logText, setLogText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [stats, setStats] = useState({
    damageDealt: 0,
    damageTaken: 0,
    headshots: 0,
    totalHitsDealt: 0,
    invalids: 0,
  });
  const [opponents, setOpponents] = useState<Record<string, OpponentStat>>({});
  const [hitDistribution, setHitDistribution] = useState({
    head: 0,
    chest: 0,
    stomach: 0,
    limbs: 0,
    total: 0,
  });

  const loadSample = (sample: string) => {
    setLogText(sample);
    parseLog(sample);
  };

  const clearLog = () => {
    setLogText('');
    setEvents([]);
    setParsed(false);
    setStats({
      damageDealt: 0,
      damageTaken: 0,
      headshots: 0,
      totalHitsDealt: 0,
      invalids: 0,
    });
    setOpponents({});
    setHitDistribution({
      head: 0,
      chest: 0,
      stomach: 0,
      limbs: 0,
      total: 0,
    });
  };

  const parseLog = (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : logText;
    if (!text.trim()) return;

    const lines = text.split('\n');
    const parsedEvents: CombatEvent[] = [];
    
    let totalDmgDealt = 0;
    let totalDmgTaken = 0;
    let headshotCount = 0;
    let totalHits = 0;
    let invalidCount = 0;
    const opponentMap: Record<string, OpponentStat> = {};

    let headHits = 0;
    let chestHits = 0;
    let stomachHits = 0;
    let limbsHits = 0;
    let totalHitDealtDealt = 0;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      // Skip headers
      if (line.toLowerCase().startsWith('time') || line.toLowerCase().startsWith('active')) {
        continue;
      }

      // Split by whitespace
      const tokens = line.split(/\s+/);
      if (tokens.length < 5) continue; // Not a valid combat log entry

      const time = tokens[0] || '00:00';
      
      const cleanName = (str: string) => {
        if (!str) return 'unknown';
        const idx = str.indexOf('(');
        return idx > -1 ? str.slice(0, idx) : str;
      };

      let attacker = 'unknown';
      let attackerId = '';
      let victim = 'unknown';
      let victimId = '';
      let weapon = 'unknown';
      let ammo = 'unknown';
      let area = 'none';
      let distance = '0m';
      let oldHp = '100.0';
      let newHp = '100.0';
      let hp = '100';
      let info = '';

      if (tokens.length >= 11) {
        // Real Rust 12-column format (or 11 column if info is empty)
        // e.g. "time attacker attacker_id target target_id weapon ammo area distance old_hp new_hp info"
        attacker = cleanName(tokens[1]);
        attackerId = tokens[2];
        victim = cleanName(tokens[3]);
        victimId = tokens[4];
        weapon = tokens[5];
        ammo = tokens[6];
        area = tokens[7];
        distance = tokens[8].endsWith('m') ? tokens[8] : tokens[8] + 'm';
        oldHp = tokens[9];
        newHp = tokens[10];
        hp = tokens[10];
        info = tokens.slice(11).join(' ') || '-';
      } else {
        // Fallback/Legacy 9-column format
        // time attacker victim weapon ammo area distance hp info
        attacker = cleanName(tokens[1]);
        attackerId = '';
        victim = cleanName(tokens[2]);
        victimId = '';
        weapon = tokens[3];
        ammo = tokens[4];
        area = tokens[5];
        distance = tokens[6].endsWith('m') ? tokens[6] : tokens[6] + 'm';
        
        const isDmgInvalid = tokens[7]?.toLowerCase() === 'invalid';
        if (isDmgInvalid) {
          oldHp = '100.0';
          newHp = 'invalid';
          hp = 'invalid';
          info = tokens.slice(7).join(' ');
        } else {
          oldHp = '100.0';
          newHp = tokens[7] || '100.0';
          hp = newHp;
          info = tokens.slice(8).join(' ');
        }
      }

      // Determine Event Type
      let type: CombatEvent['type'] = 'generic';
      const isAttackerYou = attacker.toLowerCase() === 'you';
      const isVictimYou = victim.toLowerCase() === 'you';
      const isInvalid = info.toLowerCase().includes('invalid') || hp.toLowerCase() === 'invalid' || info.toLowerCase().includes('desync');

      if (isInvalid) {
        type = 'invalid';
      } else if (info.toLowerCase().includes('killed') || info.toLowerCase().includes('death') || newHp === '0.0' || newHp === '0') {
        type = isAttackerYou ? 'kill' : (isVictimYou ? 'death' : 'generic');
      } else if (isAttackerYou) {
        type = 'dealt';
      } else if (isVictimYou) {
        type = 'taken';
      }

      const event: CombatEvent = {
        time,
        attacker,
        attackerId,
        victim,
        victimId,
        weapon,
        ammo,
        area,
        distance,
        oldHp,
        newHp,
        hp,
        info,
        type
      };

      parsedEvents.push(event);

      const opponentName = isAttackerYou ? victim : attacker;
      if (opponentName && opponentName !== 'you' && opponentName !== 'unknown') {
        if (!opponentMap[opponentName]) {
          opponentMap[opponentName] = {
            name: opponentName,
            damageDealt: 0,
            damageTaken: 0,
            hitsDealt: 0,
            hitsTaken: 0,
            headshots: 0,
            invalids: 0,
          };
        }

        const op = opponentMap[opponentName];
        
        // Calculate exact damage delta if numeric
        let exactDamage = 0;
        if (oldHp !== 'invalid' && newHp !== 'invalid') {
          const oldVal = parseFloat(oldHp);
          const newVal = parseFloat(newHp);
          if (!isNaN(oldVal) && !isNaN(newVal)) {
            exactDamage = Math.max(0, oldVal - newVal);
          }
        }

        if (isInvalid) {
          invalidCount++;
          op.invalids++;
        } else if (type === 'dealt' || type === 'kill') {
          totalHits++;
          op.hitsDealt++;
          
          // Use exact damage or fallback to estimation
          const dmg = exactDamage > 0 ? exactDamage : (area.toLowerCase() === 'head' ? 50 : 25);
          totalDmgDealt += dmg;
          op.damageDealt += dmg;

          // Track hit distributions for dealt hits
          totalHitDealtDealt++;
          const cleanArea = area.toLowerCase();
          if (cleanArea === 'head') {
            headshotCount++;
            op.headshots++;
            headHits++;
          } else if (cleanArea === 'chest' || cleanArea === 'breast' || cleanArea === 'spine' || cleanArea === 'body') {
            chestHits++;
          } else if (cleanArea === 'stomach' || cleanArea === 'pelvis' || cleanArea === 'hip' || cleanArea === 'abdomen') {
            stomachHits++;
          } else {
            limbsHits++; // arm, leg, hand, foot, shoulder etc.
          }
        } else if (type === 'taken' || type === 'death') {
          op.hitsTaken++;
          const dmg = exactDamage > 0 ? exactDamage : (area.toLowerCase() === 'head' ? 50 : 20);
          totalDmgTaken += dmg;
          op.damageTaken += dmg;
        }
      }
    }

    setEvents(parsedEvents);
    setStats({
      damageDealt: Math.round(totalDmgDealt),
      damageTaken: Math.round(totalDmgTaken),
      headshots: headshotCount,
      totalHitsDealt: totalHits,
      invalids: invalidCount,
    });
    setOpponents(opponentMap);
    setHitDistribution({
      head: headHits,
      chest: chestHits,
      stomach: stomachHits,
      limbs: limbsHits,
      total: totalHitDealtDealt,
    });
    setParsed(true);
  };

  const getWeaponBadge = (weaponName: string) => {
    const name = weaponName.toLowerCase();
    let emoji = '🔫';
    let cleanName = weaponName;

    if (name.includes('ak') || name.includes('rifle.ak')) {
      emoji = '🔫';
      cleanName = 'AK-47';
    } else if (name.includes('bolt') || name.includes('rifle.bolt')) {
      emoji = '🎯';
      cleanName = 'Bolt';
    } else if (name.includes('mp5')) {
      emoji = '🔫';
      cleanName = 'MP5';
    } else if (name.includes('custom')) {
      emoji = '🔫';
      cleanName = 'Custom';
    } else if (name.includes('thompson')) {
      emoji = '🔫';
      cleanName = 'Thompson';
    } else if (name.includes('m39')) {
      emoji = '🎯';
      cleanName = 'M39';
    } else if (name.includes('m249')) {
      emoji = '🔥';
      cleanName = 'M249';
    } else if (name.includes('lr300') || name.includes('lr-300')) {
      emoji = '🔫';
      cleanName = 'LR-300';
    } else if (name.includes('shotgun') || name.includes('pump') || name.includes('spas') || name.includes('double')) {
      emoji = '💥';
      cleanName = 'Shotgun';
    } else if (name.includes('bow') || name.includes('crossbow')) {
      emoji = '🏹';
      cleanName = 'Bow';
    } else if (name.includes('nail')) {
      emoji = '🔨';
      cleanName = 'Nailgun';
    } else if (name.includes('pistol') || name.includes('revolver') || name.includes('semi')) {
      emoji = '🔫';
      cleanName = 'Pistol';
    }

    return (
      <span className="combatlog__weapon-badge" title={weaponName}>
        <span className="combatlog__weapon-icon">{emoji}</span>
        <span>{cleanName}</span>
      </span>
    );
  };

  const getAreaBadgeClass = (area: string) => {
    const cleanArea = area.toLowerCase();
    if (cleanArea === 'head') return 'combatlog__area-badge combatlog__area-badge--head';
    if (cleanArea === 'chest' || cleanArea === 'breast' || cleanArea === 'spine' || cleanArea === 'body') return 'combatlog__area-badge combatlog__area-badge--chest';
    if (cleanArea === 'stomach' || cleanArea === 'pelvis' || cleanArea === 'hip' || cleanArea === 'abdomen') return 'combatlog__area-badge combatlog__area-badge--stomach';
    return 'combatlog__area-badge combatlog__area-badge--limb';
  };

  // Percentages for body parts
  const headPct = hitDistribution.total > 0 ? Math.round((hitDistribution.head / hitDistribution.total) * 100) : 0;
  const chestPct = hitDistribution.total > 0 ? Math.round((hitDistribution.chest / hitDistribution.total) * 100) : 0;
  const stomachPct = hitDistribution.total > 0 ? Math.round((hitDistribution.stomach / hitDistribution.total) * 100) : 0;
  const limbsPct = hitDistribution.total > 0 ? Math.round((hitDistribution.limbs / hitDistribution.total) * 100) : 0;

  // Heatmap colors for body diagram
  const headHeat = `rgba(59, 130, 246, ${0.12 + (headPct / 100) * 0.85})`;
  const chestHeat = `rgba(34, 197, 94, ${0.12 + (chestPct / 100) * 0.85})`;
  const stomachHeat = `rgba(245, 158, 11, ${0.12 + (stomachPct / 100) * 0.85})`;
  const limbsHeat = `rgba(229, 92, 37, ${0.12 + (limbsPct / 100) * 0.85})`;

  return (
    <div className="combatlog">
      <div className="combatlog__header">
        <h2 className="combatlog__title font-display">
          <Terminal size={22} /> COMBAT LOG PARSER & VISUALIZER
        </h2>
        <p className="combatlog__subtitle">
          Paste your in-game <code>combatlog</code> console output. Supports the modern 12-column format.
        </p>
      </div>

      <div className="combatlog__grid">
        {/* Left Column: Log Paste Terminal */}
        <div className="combatlog__col">
          <div className="glass-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 className="combatlog__panel-title font-display">CONSOLE OUTPUT PASTE</h3>
            
            <div className="combatlog__terminal-wrap">
              <div className="combatlog__terminal-bar">
                <span className="combatlog__terminal-dot combatlog__terminal-dot--red" />
                <span className="combatlog__terminal-dot combatlog__terminal-dot--amber" />
                <span className="combatlog__terminal-dot combatlog__terminal-dot--green" />
                <span style={{ marginLeft: 6 }}>RUST_CONSOLE_COMBAT_LOG</span>
              </div>
              <textarea
                placeholder="Paste Rust console combatlog here... (Press F1 in-game, type combatlog, copy and paste)"
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                className="combatlog__textarea"
              />
              {!logText && (
                <div className="combatlog__terminal-prompt">
                  <span>&gt;</span>
                  <span className="combatlog__cursor" />
                </div>
              )}
            </div>

            <div className="combatlog__btn-row">
              <button onClick={() => parseLog()} className="combatlog__btn-parse font-display">
                <Play size={14} /> Parse Log
              </button>
              <button onClick={() => loadSample(SAMPLE_LOG_PVP)} className="combatlog__btn-sample">
                Load PVP Sample
              </button>
              <button onClick={() => loadSample(SAMPLE_LOG_INVALID)} className="combatlog__btn-sample">
                Load Invalid Sample
              </button>
              <button onClick={clearLog} className="combatlog__btn-clear" title="Clear log text">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Opponent Aggregated Stats */}
          <div className="glass-panel" style={{ padding: 16 }}>
            <h3 className="combatlog__panel-title combatlog__panel-title--mb font-display">TARGET COMBAT SUMMARY</h3>
            <div className="combatlog__opponents">
              {Object.values(opponents).map((op) => {
                const totalDmg = op.damageDealt + op.damageTaken;
                const dealtPct = totalDmg > 0 ? Math.round((op.damageDealt / totalDmg) * 100) : 50;
                const takenPct = totalDmg > 0 ? Math.round((op.damageTaken / totalDmg) * 100) : 50;
                const accuracy = op.hitsDealt > 0 ? Math.round(((op.hitsDealt - op.invalids) / op.hitsDealt) * 100) : 0;

                return (
                  <div key={op.name} className="combatlog__opponent-card">
                    <div className="combatlog__opponent-header">
                      <span className="combatlog__opponent-name">{op.name}</span>
                      <span className="combatlog__opponent-accuracy">
                        Valid Accuracy: <strong>{accuracy}%</strong>
                      </span>
                    </div>
                    
                    <div className="combatlog__opponent-stats">
                      <div>
                        <span className="combatlog__opponent-stat-label">Damage Dealt</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cl-green)' }}>{op.damageDealt}</span>
                      </div>
                      <div>
                        <span className="combatlog__opponent-stat-label">Damage Taken</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cl-red)' }}>{op.damageTaken}</span>
                      </div>
                      <div>
                        <span className="combatlog__opponent-stat-label">Hits (HS / Invalid)</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          {op.hitsDealt} <span style={{ color: 'var(--cl-blue)' }}>({op.headshots})</span> / <span style={{ color: 'var(--cl-amber)' }}>{op.invalids}</span>
                        </span>
                      </div>
                    </div>

                    <div className="combatlog__dmg-bar-wrap">
                      <div className="combatlog__dmg-bar-label">Damage Contribution</div>
                      <div className="combatlog__dmg-bar-track">
                        <div className="combatlog__dmg-bar-dealt" style={{ width: `${dealtPct}%` }} />
                        <div className="combatlog__dmg-bar-taken" style={{ width: `${takenPct}%` }} />
                      </div>
                      <div className="combatlog__dmg-bar-legends">
                        <span>Dealt: {dealtPct}%</span>
                        <span>Taken: {takenPct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {Object.keys(opponents).length === 0 && (
                <div className="combatlog__empty-msg">No opponent data parsed yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Statistics Cards, Hit Distribution, and Timeline */}
        <div className="combatlog__col--right">
          <div className="glass-panel" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h3 className="combatlog__panel-title font-display">PARSED DIAGNOSTICS REPORT</h3>

            {!parsed ? (
              <div className="combatlog__empty">
                <Terminal size={38} />
                <span className="combatlog__empty-text">
                  Paste console output and parse it to view damage heatmaps, timelines, and invalid telemetry.
                </span>
              </div>
            ) : (
              <div className="combatlog__report-content">
                {/* Stats Cards Row */}
                <div className="combatlog__stats-row">
                  <div className="combatlog__stat-card combatlog__stat-card--dealt">
                    <span className="combatlog__stat-label">Dmg Dealt</span>
                    <span className="combatlog__stat-value combatlog__stat-value--dealt">{stats.damageDealt}</span>
                  </div>
                  <div className="combatlog__stat-card combatlog__stat-card--taken">
                    <span className="combatlog__stat-label">Dmg Taken</span>
                    <span className="combatlog__stat-value combatlog__stat-value--taken">{stats.damageTaken}</span>
                  </div>
                  <div className="combatlog__stat-card combatlog__stat-card--headshot">
                    <span className="combatlog__stat-label">Headshots</span>
                    <span className="combatlog__stat-value combatlog__stat-value--headshot">{stats.headshots}</span>
                  </div>
                  <div className={`combatlog__stat-card ${stats.invalids > 0 ? 'combatlog__stat-card--invalid-active' : 'combatlog__stat-card--invalid'}`}>
                    <span className="combatlog__stat-label">Invalids</span>
                    <span className={`combatlog__stat-value ${stats.invalids > 0 ? 'combatlog__stat-value--invalid-active' : 'combatlog__stat-value--invalid'}`}>{stats.invalids}</span>
                  </div>
                </div>

                {/* Global Damage Compare Bar Chart */}
                <div className="combatlog__dmg-compare">
                  <span className="combatlog__section-title font-display">DAMAGE SHARE COMPARISON</span>
                  <div style={{ marginTop: 8 }}>
                    <div className="combatlog__dmg-compare-row">
                      <span className="combatlog__dmg-compare-label">DEALT</span>
                      <div className="combatlog__dmg-compare-track">
                        <div 
                          className="combatlog__dmg-compare-fill combatlog__dmg-compare-fill--dealt" 
                          style={{ width: `${stats.damageDealt + stats.damageTaken > 0 ? (stats.damageDealt / (stats.damageDealt + stats.damageTaken)) * 100 : 50}%` }}
                        >
                          {stats.damageDealt}
                        </div>
                      </div>
                    </div>
                    <div className="combatlog__dmg-compare-row">
                      <span className="combatlog__dmg-compare-label">TAKEN</span>
                      <div className="combatlog__dmg-compare-track">
                        <div 
                          className="combatlog__dmg-compare-fill combatlog__dmg-compare-fill--taken" 
                          style={{ width: `${stats.damageDealt + stats.damageTaken > 0 ? (stats.damageTaken / (stats.damageDealt + stats.damageTaken)) * 100 : 50}%` }}
                        >
                          {stats.damageTaken}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hit Distribution Body Diagram */}
                <div>
                  <span className="combatlog__section-title font-display">HIT ANATOMY DISTRIBUTION</span>
                  <div className="combatlog__hitdist">
                    {/* Bars */}
                    <div className="combatlog__hitdist-bars">
                      <div className="combatlog__hitdist-row">
                        <span className="combatlog__hitdist-label">Head ({hitDistribution.head})</span>
                        <div className="combatlog__hitdist-track">
                          <div className="combatlog__hitdist-fill combatlog__hitdist-fill--head" style={{ width: `${headPct}%` }} />
                        </div>
                        <span className="combatlog__hitdist-pct">{headPct}%</span>
                      </div>
                      <div className="combatlog__hitdist-row">
                        <span className="combatlog__hitdist-label">Chest ({hitDistribution.chest})</span>
                        <div className="combatlog__hitdist-track">
                          <div className="combatlog__hitdist-fill combatlog__hitdist-fill--chest" style={{ width: `${chestPct}%` }} />
                        </div>
                        <span className="combatlog__hitdist-pct">{chestPct}%</span>
                      </div>
                      <div className="combatlog__hitdist-row">
                        <span className="combatlog__hitdist-label">Stomach ({hitDistribution.stomach})</span>
                        <div className="combatlog__hitdist-track">
                          <div className="combatlog__hitdist-fill combatlog__hitdist-fill--stomach" style={{ width: `${stomachPct}%` }} />
                        </div>
                        <span className="combatlog__hitdist-pct">{stomachPct}%</span>
                      </div>
                      <div className="combatlog__hitdist-row">
                        <span className="combatlog__hitdist-label">Limbs ({hitDistribution.limbs})</span>
                        <div className="combatlog__hitdist-track">
                          <div className="combatlog__hitdist-fill combatlog__hitdist-fill--limbs" style={{ width: `${limbsPct}%` }} />
                        </div>
                        <span className="combatlog__hitdist-pct">{limbsPct}%</span>
                      </div>
                    </div>

                    {/* Silhouette */}
                    <div className="combatlog__body-diagram">
                      <div className="combatlog__body-part combatlog__body-head" style={{ background: headHeat, border: `1px solid rgba(59,130,246, ${headPct > 0 ? 0.4 : 0.08})` }}>H</div>
                      <div className="combatlog__body-part combatlog__body-chest" style={{ background: chestHeat, border: `1px solid rgba(34,197,94, ${chestPct > 0 ? 0.4 : 0.08})` }}>C</div>
                      <div className="combatlog__body-part combatlog__body-stomach" style={{ background: stomachHeat, border: `1px solid rgba(245,158,11, ${stomachPct > 0 ? 0.4 : 0.08})` }}>S</div>
                      <div className="combatlog__body-part combatlog__body-limbs" style={{ background: limbsHeat, border: `1px solid rgba(229,92,37, ${limbsPct > 0 ? 0.4 : 0.08})` }}>L</div>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="combatlog__timeline-wrap">
                  <span className="combatlog__section-title font-display">EVENT TELEMETRY TIMELINE</span>
                  <div className="combatlog__timeline">
                    {events.map((ev, idx) => {
                      let dotColor = 'var(--color-text-dim)';
                      let label = 'EVENT';
                      let desc = '';

                      if (ev.type === 'dealt') {
                        dotColor = 'var(--cl-green)';
                        label = 'HIT DEALT';
                        const dmgStr = (ev.oldHp && ev.newHp) ? ` (-${Math.round(parseFloat(ev.oldHp) - parseFloat(ev.newHp))}hp)` : '';
                        desc = `to ${ev.victim} in the ${ev.area} at ${ev.distance}${dmgStr}`;
                      } else if (ev.type === 'taken') {
                        dotColor = 'var(--cl-red)';
                        label = 'HIT TAKEN';
                        const dmgStr = (ev.oldHp && ev.newHp) ? ` (-${Math.round(parseFloat(ev.oldHp) - parseFloat(ev.newHp))}hp)` : '';
                        desc = `from ${ev.attacker} in the ${ev.area} at ${ev.distance}${dmgStr}`;
                      } else if (ev.type === 'invalid') {
                        dotColor = 'var(--cl-amber)';
                        label = 'SHOT INVALID';
                        desc = `to ${ev.victim} (${ev.info})`;
                      } else if (ev.type === 'kill') {
                        dotColor = 'var(--cl-kill)';
                        label = 'TARGET KILLED';
                        desc = `${ev.victim} with ${ev.weapon} (${ev.distance})`;
                      } else if (ev.type === 'death') {
                        dotColor = 'var(--cl-death)';
                        label = 'YOU DIED';
                        desc = `killed by ${ev.attacker} using ${ev.weapon} (${ev.distance})`;
                      } else {
                        label = ev.info.toUpperCase() || 'EVENT';
                        desc = `${ev.attacker} -> ${ev.victim} (${ev.weapon})`;
                      }

                      return (
                        <div key={idx} className="combatlog__event">
                          <span className="combatlog__event-time">{ev.time}</span>
                          <span className="combatlog__event-dot" style={{ color: dotColor, background: dotColor }} />
                          <div className="combatlog__event-body">
                            <strong className="combatlog__event-label" style={{ color: dotColor }}>{label}</strong>
                            {getWeaponBadge(ev.weapon)}
                            {ev.area !== 'none' && (
                              <span className={getAreaBadgeClass(ev.area)}>{ev.area}</span>
                            )}
                            <span className="combatlog__event-desc"> {desc}</span>
                          </div>
                        </div>
                      );
                    })}
                    {events.length === 0 && (
                      <div className="combatlog__empty-msg">No parsed events.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
