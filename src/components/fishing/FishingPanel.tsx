import { useState, useMemo } from 'react';
import { Fish, Calculator, Play, Search, Hammer, Gauge, Waves, Info, AlertTriangle } from 'lucide-react';
import './FishingPanel.css';

interface BaitItem { name: string; lvl: number; stack: number; maxLvl: number; }

const BAITS: BaitItem[] = [
  { name: 'Grub', lvl: 3.5, stack: 3, maxLvl: 10.5 },
  { name: 'Small Trout', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Yellow Perch', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Raw Bear Meat', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Raw Big Cat Meat', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Raw Crocodile Meat', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Raw Snake Meat', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Raw Wolf Meat', lvl: 10, stack: 1, maxLvl: 10 },
  { name: 'Worm', lvl: 2.5, stack: 3, maxLvl: 7.5 },
  { name: 'Raw Pork', lvl: 5, stack: 1, maxLvl: 5 },
  { name: 'Raw Deer Meat', lvl: 5, stack: 1, maxLvl: 5 },
  { name: 'Raw Horse Meat', lvl: 5, stack: 1, maxLvl: 5 },
  { name: 'Raw Fish Meat', lvl: 0.5, stack: 10, maxLvl: 5 },
  { name: 'Blueberries', lvl: 1, stack: 5, maxLvl: 5 },
  { name: 'Blackberries', lvl: 1, stack: 5, maxLvl: 5 },
  { name: 'Raspberries', lvl: 1, stack: 5, maxLvl: 5 },
  { name: 'White Berries', lvl: 1, stack: 5, maxLvl: 5 },
  { name: 'Red Berries', lvl: 1, stack: 5, maxLvl: 5 },
  { name: 'Yellow Berries', lvl: 1, stack: 5, maxLvl: 5 },
  { name: 'Anchovy', lvl: 2, stack: 2, maxLvl: 4 },
  { name: 'Herring', lvl: 2, stack: 2, maxLvl: 4 },
  { name: 'Sardine', lvl: 2, stack: 2, maxLvl: 4 },
  { name: 'Raw Human Meat', lvl: 3, stack: 1, maxLvl: 3 },
];

const tierOf = (maxVal: number) => (maxVal >= 7.5 ? 'S' : maxVal >= 4 ? 'A' : 'B');
const fishTier = (name: string) =>
  ['Catfish', 'Salmon'].includes(name) ? 'S'
  : ['Small Trout', 'Yellow Perch'].includes(name) ? 'A'
  : ['Anchovy', 'Herring', 'Sardine'].includes(name) ? 'B' : 'J';

export function FishingPanel() {
  const [search, setSearch] = useState('');
  const [calcBait, setCalcBait] = useState('Grub');
  const [calcQty, setCalcQty] = useState(30);

  const [simBaitLvl, setSimBaitLvl] = useState<'5' | '3' | '1'>('5');
  const [simRuns, setSimRuns] = useState(50);
  const [simFailRate, setSimFailRate] = useState(50);
  const [simResults, setSimResults] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const filtered = useMemo(() => BAITS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase())), [search]);

  const calc = useMemo(() => {
    const b = BAITS.find((x) => x.name === calcBait);
    if (!b) return null;
    const effective = Math.min(b.lvl * b.stack, b.maxLvl);
    const runs = Math.floor(calcQty / b.stack);
    const unused = calcQty % b.stack;
    const pool = effective >= 5 ? 'Salmon & Catfish' : effective >= 3 ? 'Trout & Perch (some Salmon)' : 'Small fish (Anchovy, Herring, Sardine)';
    return { effective, runs, unused, pool };
  }, [calcBait, calcQty]);

  const runSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      let ok = 0, fail = 0;
      const counts: Record<string, number> = {};
      const add = (k: string) => { counts[k] = (counts[k] || 0) + 1; };
      for (let i = 0; i < simRuns; i++) {
        if (Math.random() < simFailRate / 100) { fail++; continue; }
        ok++;
        const r = Math.random();
        if (simBaitLvl === '5') {
          if (r < 0.55) add('Salmon'); else if (r < 0.9) add('Catfish'); else add('Small Trout');
        } else if (simBaitLvl === '3') {
          if (r < 0.45) add('Small Trout'); else if (r < 0.8) add('Yellow Perch'); else if (r < 0.92) add('Salmon'); else add('Sardine');
        } else {
          if (r < 0.3) add('Anchovy'); else if (r < 0.55) add('Herring'); else if (r < 0.8) add('Sardine'); else add('Small Trout');
        }
      }
      const big = (counts['Salmon'] || 0) + (counts['Catfish'] || 0);
      const mid = (counts['Small Trout'] || 0) + (counts['Yellow Perch'] || 0);
      const small = (counts['Anchovy'] || 0) + (counts['Herring'] || 0) + (counts['Sardine'] || 0);
      const rawFish = big * 15 + mid * 10 + small * 2;
      const animalFat = big * 15 + mid * 8;
      const scrap = big * 100; // salmon/catfish sell ~100 scrap at fishing villages
      const durabilityUsed = ok * 10;
      const trapsNeeded = Math.max(1, Math.ceil(durabilityUsed / 100));
      setSimResults({ ok, fail, counts, rawFish, animalFat, scrap, durabilityUsed, trapsNeeded });
      setIsSimulating(false);
    }, 350);
  };

  return (
    <div className="fp">
      <header className="fp-header">
        <div className="fp-header-title">
          <span className="fp-header-icon"><Fish size={20} /></span>
          <div>
            <h2>Fishing &amp; Fish Traps</h2>
            <p>Pick the right bait, calculate effective bait level, and estimate trap yields.</p>
          </div>
        </div>
      </header>

      {/* Quick facts */}
      <div className="fp-facts">
        <div className="fp-fact"><Hammer size={15} /><div><span className="fp-fact-k">Craft cost</span><span className="fp-fact-v">200 Wood · 5 Cloth</span></div></div>
        <div className="fp-fact"><Gauge size={15} /><div><span className="fp-fact-k">Durability</span><span className="fp-fact-v">−10 per catch (~10 fish)</span></div></div>
        <div className="fp-fact"><Waves size={15} /><div><span className="fp-fact-k">Depth</span><span className="fp-fact-v">Acts as 5 m — no sharks</span></div></div>
      </div>

      <div className="fp-body">
        {/* LEFT */}
        <div className="fp-col">
          <section className="fp-card">
            <h3 className="fp-card-h"><Info size={14} /> How fish traps work</h3>
            <ol className="fp-steps">
              <li>Place the trap so its base sits just under the water line.</li>
              <li>Load it with bait — the trap catches <b>small fish or trout based on the total calorie value</b> of the bait inside.</li>
              <li>Wait 1–2 minutes; a splash sound means a catch. Higher bait level → better fish.</li>
              <li>Collect the fish and re-bait. Each catch costs <b>10 durability</b>, so repair after ~10 fish.</li>
            </ol>
            <div className="fp-note fp-note--warn">
              <AlertTriangle size={13} />
              <span>Traps act as if in 5 m water, so they <b>can't</b> catch Sharks or Orange Roughy — but they will land Salmon and Catfish with strong bait.</span>
            </div>
          </section>

          <section className="fp-card">
            <div className="fp-card-head">
              <h3 className="fp-card-h"><Fish size={14} /> Bait reference</h3>
              <div className="fp-search"><Search size={13} /><input placeholder="Search bait…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            </div>
            <div className="fp-table-wrap">
              <table className="fp-table">
                <thead><tr><th>Bait</th><th>Lvl</th><th>Stack</th><th>Max</th></tr></thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.name} className={b.name === calcBait ? 'active' : ''} onClick={() => setCalcBait(b.name)}>
                      <td><span className={`fp-tier fp-tier--${tierOf(b.lvl * b.stack)}`}>{tierOf(b.lvl * b.stack)}</span>{b.name}</td>
                      <td>{b.lvl}</td><td>{b.stack}</td><td className="fp-max">{b.maxLvl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* RIGHT */}
        <div className="fp-col">
          <section className="fp-card">
            <h3 className="fp-card-h"><Calculator size={14} /> Bait calculator</h3>
            <p className="fp-card-sub">Rust stacks smaller baits to reach higher bait levels, capped at each item's max.</p>
            <div className="fp-calc-row">
              <label className="fp-field"><span>Bait</span>
                <select value={calcBait} onChange={(e) => setCalcBait(e.target.value)}>
                  {BAITS.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </label>
              <label className="fp-field"><span>Quantity</span>
                <input type="number" min={1} value={calcQty} onChange={(e) => setCalcQty(Math.max(1, parseInt(e.target.value) || 1))} />
              </label>
            </div>
            {calc && (
              <div className="fp-calc-out">
                <div className="fp-calc-stat"><span>Effective level</span><b className="fp-accent">{calc.effective}</b></div>
                <div className="fp-calc-stat"><span>Trap loads</span><b>{calc.runs}</b></div>
                {calc.unused > 0 && <div className="fp-calc-stat"><span>Leftover</span><b className="fp-dim">{calc.unused}</b></div>}
                <div className="fp-calc-stat fp-calc-stat--wide"><span>Likely catch</span><b className="fp-mut">{calc.pool}</b></div>
              </div>
            )}
          </section>

          <section className="fp-card">
            <h3 className="fp-card-h"><Play size={14} /> Yield simulator</h3>
            <p className="fp-card-sub">Monte-Carlo estimate of catches over many trap cycles. Adjust the fail chance to match your server.</p>

            <div className="fp-field"><span>Bait strength</span>
              <div className="fp-seg">
                <button className={simBaitLvl === '5' ? 'on' : ''} onClick={() => setSimBaitLvl('5')}>Lvl 5+</button>
                <button className={simBaitLvl === '3' ? 'on' : ''} onClick={() => setSimBaitLvl('3')}>Lvl 3–4.5</button>
                <button className={simBaitLvl === '1' ? 'on' : ''} onClick={() => setSimBaitLvl('1')}>Lvl 0–2.5</button>
              </div>
            </div>

            <div className="fp-slider">
              <div className="fp-slider-head"><span>Trap cycles</span><b>{simRuns}</b></div>
              <input type="range" min={10} max={200} step={10} value={simRuns} onChange={(e) => setSimRuns(parseInt(e.target.value))} />
            </div>
            <div className="fp-slider">
              <div className="fp-slider-head"><span>Trap fail chance</span><b>{simFailRate}%</b></div>
              <input type="range" min={0} max={90} step={5} value={simFailRate} onChange={(e) => setSimFailRate(parseInt(e.target.value))} />
            </div>

            <button className="fp-run" onClick={runSimulation} disabled={isSimulating}>
              <Play size={14} /> {isSimulating ? 'Simulating…' : 'Run simulation'}
            </button>

            {simResults && (
              <div className="fp-results">
                <div className="fp-ratio">
                  <div className="fp-ratio-track"><div className="fp-ratio-fill" style={{ width: `${(simResults.ok / simRuns) * 100}%` }} /></div>
                  <div className="fp-ratio-legend"><span className="fp-ok">{simResults.ok} caught</span><span className="fp-fail">{simResults.fail} failed</span></div>
                </div>

                <div className="fp-est">
                  <div className="fp-est-card"><span>Raw fish</span><b>{simResults.rawFish}</b></div>
                  <div className="fp-est-card"><span>Animal fat</span><b>{simResults.animalFat}</b></div>
                  <div className="fp-est-card fp-est-card--scrap"><span>Scrap value</span><b>{simResults.scrap}</b></div>
                  <div className="fp-est-card"><span>Traps used</span><b>{simResults.trapsNeeded}</b></div>
                </div>
                <p className="fp-est-note">Yields are estimates from gutting/selling at fishing villages. {simResults.durabilityUsed} durability spent across the run.</p>

                <div className="fp-catches">
                  {Object.entries(simResults.counts).sort((a: any, b: any) => b[1] - a[1]).map(([name, qty]) => {
                    const p = simResults.ok > 0 ? ((qty as number) / simResults.ok) * 100 : 0;
                    const t = fishTier(name);
                    return (
                      <div key={name} className="fp-catch-row">
                        <span className="fp-catch-name"><span className={`fp-tier fp-tier--${t}`}>{t}</span>{name}</span>
                        <div className="fp-catch-track"><div className={`fp-catch-fill fp-tier-fill--${t}`} style={{ width: `${p}%` }} /></div>
                        <span className="fp-catch-qty">{qty as number}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
