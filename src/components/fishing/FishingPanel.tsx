import { useState, useMemo } from 'react';
import { 
  Fish, Calculator, RefreshCw, 
  HelpCircle, Info, AlertCircle
} from 'lucide-react';
import './FishingPanel.css';

interface BaitItem {
  name: string;
  lvl: number;
  stack: number;
  maxLvl: number;
}

export function FishingPanel() {
  const [search, setSearch] = useState('');
  const [calcBait, setCalcBait] = useState<string>('Grub');
  const [calcQty, setCalcQty] = useState<number>(30);
  
  // Simulator State
  const [simWater, setSimWater] = useState<'river' | 'ocean'>('ocean');
  const [simBaitLvl, setSimBaitLvl] = useState<'5' | '3' | '1'>('5');
  const [simRuns, setSimRuns] = useState<number>(50);
  const [simResults, setSimResults] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Bait Data
  const baits: BaitItem[] = useMemo(() => [
    { name: 'Grub', lvl: 3.5, stack: 3, maxLvl: 10.5 },
    { name: 'Small Trout', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Yellow Perch', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Raw Bear Meat', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Raw Big Cat Meat', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Raw Crocodile Meat', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Raw Snake Meat', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Raw Wolf Meat', lvl: 10, stack: 1, maxLvl: 10 },
    { name: 'Worm', lvl: 2.5, stack: 3, maxLvl: 7.5 },
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
    { name: 'Raw Pork', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Raw Deer Meat', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Raw Horse Meat', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Raw Fish Meat', lvl: 0.5, stack: 10, maxLvl: 5 },
  ], []);

  // Filtered Baits
  const filteredBaits = useMemo(() => {
    return baits.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  }, [baits, search]);

  // Calculator Logic
  const calcResults = useMemo(() => {
    const selected = baits.find(b => b.name === calcBait);
    if (!selected) return null;

    // effective bait calculation
    const effectiveBaitLvl = Math.min(selected.lvl * selected.stack, selected.maxLvl);
    const runs = Math.floor(calcQty / selected.stack);
    const unused = calcQty % selected.stack;

    // determine catch options
    let caughtOptions = '';
    if (effectiveBaitLvl >= 5) {
      caughtOptions = 'Salmon, Catfish (River/Ocean)';
    } else if (effectiveBaitLvl >= 3) {
      caughtOptions = 'Small Trout, Yellow Perch, Salmon (Low %)';
    } else {
      caughtOptions = 'Anchovy, Herring, Sardine, Tarps/Junk';
    }

    return {
      effectiveBaitLvl,
      runs,
      unused,
      caughtOptions
    };
  }, [baits, calcBait, calcQty]);

  // Run Yield Simulation (Monte Carlo)
  const runSimulation = () => {
    setIsSimulating(true);
    
    setTimeout(() => {
      let successes = 0;
      let fails = 0;
      const counts: Record<string, number> = {
        'Catfish': 0,
        'Salmon': 0,
        'Small Trout': 0,
        'Yellow Perch': 0,
        'Anchovy': 0,
        'Herring': 0,
        'Sardine': 0,
        'Tarp': 0,
        'Diving Fins': 0,
        'Water Jug': 0,
        'Human Skull': 0,
        'Small Water Bottle': 0,
        'Water Bucket': 0,
      };

      for (let i = 0; i < simRuns; i++) {
        // 50% Trap Fail Rate
        if (Math.random() < 0.5) {
          fails++;
        } else {
          successes++;
          const subRoll = Math.random();

          if (simBaitLvl === '5') {
            // Bait level 5+ pool
            if (simWater === 'river') {
              if (subRoll < 0.60) counts['Catfish']++;
              else if (subRoll < 0.90) counts['Salmon']++;
              else counts['Small Trout']++;
            } else {
              // Ocean
              if (subRoll < 0.50) counts['Salmon']++;
              else if (subRoll < 0.85) counts['Catfish']++;
              else counts['Small Trout']++;
            }
          } else if (simBaitLvl === '3') {
            // Bait level 3-4.5 pool
            if (simWater === 'river') {
              if (subRoll < 0.40) counts['Small Trout']++;
              else if (subRoll < 0.80) counts['Yellow Perch']++;
              else if (subRoll < 0.90) counts['Salmon']++;
              else counts['Sardine']++;
            } else {
              // Ocean
              if (subRoll < 0.50) counts['Small Trout']++;
              else if (subRoll < 0.80) counts['Yellow Perch']++;
              else if (subRoll < 0.90) counts['Salmon']++;
              else counts['Sardine']++;
            }
          } else {
            // Bait level 0-2.5 pool (includes junk)
            if (subRoll < 0.15) counts['Anchovy']++;
            else if (subRoll < 0.30) counts['Herring']++;
            else if (subRoll < 0.45) counts['Sardine']++;
            else if (subRoll < 0.60) counts['Tarp']++;
            else if (subRoll < 0.70) counts['Diving Fins']++;
            else if (subRoll < 0.80) counts['Water Jug']++;
            else if (subRoll < 0.90) counts['Human Skull']++;
            else if (subRoll < 0.95) counts['Small Water Bottle']++;
            else counts['Water Bucket']++;
          }
        }
      }

      // Calculate yields
      const catfishQty = counts['Catfish'] || 0;
      const salmonQty = counts['Salmon'] || 0;
      const troutQty = counts['Small Trout'] || 0;
      const perchQty = counts['Yellow Perch'] || 0;
      const lowFishQty = (counts['Anchovy'] || 0) + (counts['Herring'] || 0) + (counts['Sardine'] || 0);

      const rawFish = (catfishQty + salmonQty) * 15 + (troutQty + perchQty) * 10 + lowFishQty * 1;
      const animalFat = (catfishQty + salmonQty) * 15 + (troutQty + perchQty) * 10;
      const scrapValue = (catfishQty + salmonQty) * 100; // Salmon/Catfish trade for 100 scrap
      const blueCardChance = (catfishQty + salmonQty) * 0.2;

      setSimResults({
        fails,
        successes,
        counts,
        rawFish,
        animalFat,
        scrapValue,
        blueCardChance
      });
      setIsSimulating(false);
    }, 400);
  };

  // Helper to determine tier CSS styling
  const getBaitRowClass = (bait: BaitItem) => {
    const activeClass = bait.name === calcBait ? 'active-row ' : '';
    const maxVal = bait.lvl * bait.stack;
    if (maxVal >= 7.5) return activeClass + 'tier-high';
    if (maxVal >= 4.0) return activeClass + 'tier-mid';
    return activeClass + 'tier-low';
  };

  const getBaitBadgeTier = (bait: BaitItem) => {
    const maxVal = bait.lvl * bait.stack;
    if (maxVal >= 7.5) return 'S';
    if (maxVal >= 4.0) return 'A';
    return 'B';
  };

  const getFishTierBadge = (name: string) => {
    if (['Catfish', 'Salmon'].includes(name)) return <span className="fish-tier-badge tier-s">S</span>;
    if (['Small Trout', 'Yellow Perch'].includes(name)) return <span className="fish-tier-badge tier-a">A</span>;
    if (['Anchovy', 'Herring', 'Sardine'].includes(name)) return <span className="fish-tier-badge tier-b">B</span>;
    return <span className="fish-tier-badge tier-j">J</span>;
  };

  const getFishTierClass = (name: string) => {
    if (['Catfish', 'Salmon'].includes(name)) return 'bar-tier-high';
    if (['Small Trout', 'Yellow Perch'].includes(name)) return 'bar-tier-mid';
    if (['Anchovy', 'Herring', 'Sardine'].includes(name)) return 'bar-tier-low';
    return 'bar-tier-junk';
  };

  const getFishChipTierClass = (name: string) => {
    if (['Catfish', 'Salmon'].includes(name)) return 'catch-chip chip-tier-high';
    if (['Small Trout', 'Yellow Perch'].includes(name)) return 'catch-chip chip-tier-mid';
    return 'catch-chip';
  };

  return (
    <div className="fishing-panel font-body">
      <div className="fishing-header">
        <h2 className="font-display"><Fish size={22} className="fish-icon" /> FISHING & FISH TRAPS</h2>
        <p className="subtitle">Optimize bait and simulate yields to maximize scrap & blue keycards.</p>
      </div>

      <div className="fishing-grid">
        <div className="fishing-left-col">
          <div className="glass-panel card">
            <h3 className="card-title font-display"><HelpCircle size={16} /> TRAP PLACEMENT & USAGE</h3>
            <div className="guide-content text-muted">
              <p>Fish traps cost <b className="highlight-text">200 Wood</b> & <b className="highlight-text">5 Cloth</b> to craft. No blueprint is required.</p>
              <ol>
                <li>Place the trap slightly under water level (on ground or building block).</li>
                <li>Load the trap with bait (higher levels catch better fish).</li>
                <li>Wait 1–2 minutes. When you hear a <b className="highlight-text">splashing noise</b>, it has caught something!</li>
                <li>Interact to re-arm the trap, retrieve your fish, and repeat.</li>
              </ol>
              <div className="info-box danger">
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span><b>50% FAIL RATE:</b> Traps have a 50% chance of failing, consuming the bait without catching anything. No reset is required on fail.</span>
              </div>
              <div className="info-box info">
                <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span><b>5m DEPTH LIMIT:</b> Traps always act as if they are in 5-meter deep water. They <b>cannot</b> catch Small Sharks or Orange Roughies, but can catch Salmon and Catfish.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="fishing-right-col">
          <div className="glass-panel card">
            <h3 className="card-title font-display"><Calculator size={16} /> BAIT CALCULATOR</h3>
            <p className="card-desc text-muted">Rust automatically stacks smaller baits to reach higher bait levels (capped at max lvl).</p>
            
            <div className="bait-calc-widget">
              <div className="calc-row">
                <div className="field-group">
                  <label>Select Bait</label>
                  <select value={calcBait} onChange={(e) => setCalcBait(e.target.value)}>
                    {baits.map(b => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label>Quantity</label>
                  <input 
                    type="number" 
                    min={1} 
                    value={calcQty} 
                    onChange={(e) => setCalcQty(Math.max(1, parseInt(e.target.value) || 1))} 
                  />
                </div>
              </div>
              {calcResults && (
                <div className="calc-results font-mono">
                  <div className="calc-result-row">
                    <span>Effective Bait Level:</span>
                    <span className="result-val highlight-text">{calcResults.effectiveBaitLvl}</span>
                  </div>
                  <div className="calc-result-row">
                    <span>Trap Runs Available:</span>
                    <span className="result-val">{calcResults.runs}</span>
                  </div>
                  {calcResults.unused > 0 && (
                    <div className="calc-result-row">
                      <span>Unused Items:</span>
                      <span className="result-val text-dim">{calcResults.unused}</span>
                    </div>
                  )}
                  <div className="calc-result-row catch-pool">
                    <span>Catch Pool:</span>
                    <span className="result-val pool-text text-muted">{calcResults.caughtOptions}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="table-search-container">
              <input 
                type="text" 
                placeholder="Search baits..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="bait-search"
              />
            </div>
            <div className="table-wrapper">
              <table className="bait-table font-mono">
                <thead>
                  <tr>
                    <th>Bait Item</th>
                    <th>Base Lvl</th>
                    <th>Stack Size</th>
                    <th>Max Lvl</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBaits.map((b) => (
                    <tr key={b.name} className={getBaitRowClass(b)} onClick={() => setCalcBait(b.name)}>
                      <td>
                        <span className="bait-name-cell">
                          {b.name}
                          <span className="bait-tier-badge">{getBaitBadgeTier(b)}</span>
                        </span>
                      </td>
                      <td>{b.lvl}</td>
                      <td>{b.stack}</td>
                      <td className="highlight-text">{b.maxLvl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-panel card">
            <h3 className="card-title font-display"><RefreshCw size={16} /> CATCH & YIELD SIMULATOR</h3>
            <p className="card-desc text-muted">Simulate the results of placing multiple loaded traps over time using Monte Carlo rolls.</p>
            
            <div className="sim-controls">
              <div className="sim-control-group">
                <label>Water Type</label>
                <div className="radio-group">
                  <button className={simWater === 'ocean' ? 'active' : ''} onClick={() => setSimWater('ocean')}>Ocean / Shore</button>
                  <button className={simWater === 'river' ? 'active' : ''} onClick={() => setSimWater('river')}>River / Swamp</button>
                </div>
              </div>

              <div className="sim-control-group">
                <label>Bait Strength</label>
                <div className="radio-group">
                  <button className={simBaitLvl === '5' ? 'active' : ''} onClick={() => setSimBaitLvl('5')}>Lvl 5+ (Salmon/Cat)</button>
                  <button className={simBaitLvl === '3' ? 'active' : ''} onClick={() => setSimBaitLvl('3')}>Lvl 3-4.5 (Trout/Perch)</button>
                  <button className={simBaitLvl === '1' ? 'active' : ''} onClick={() => setSimBaitLvl('1')}>Lvl 0-2.5 (Junk/Sardine)</button>
                </div>
              </div>

              <div className="sim-control-row">
                <div className="sim-control-group flex-1">
                  <label>Trap Runs</label>
                  <input 
                    type="range" 
                    min={10} 
                    max={200} 
                    step={10} 
                    value={simRuns} 
                    onChange={(e) => setSimRuns(parseInt(e.target.value))} 
                    style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                  />
                  <div className="slider-label font-mono text-muted">{simRuns} Trap Cycles</div>
                </div>
                <button 
                  className="sim-run-btn font-display" 
                  onClick={runSimulation}
                  disabled={isSimulating}
                >
                  {isSimulating ? 'SIMULATING...' : 'RUN SIMULATION'}
                </button>
              </div>
            </div>

            {simResults && (
              <div className="sim-results font-mono">
                <h4 className="results-heading font-display">SIMULATION REPORT</h4>
                
                <div className="ratio-bar-container">
                  <div className="ratio-bar-labels">
                    <span className="success-label">SUCCESS: {simResults.successes} ({Math.round((simResults.successes / simRuns) * 100)}%)</span>
                    <span className="fail-label">FAIL: {simResults.fails} ({Math.round((simResults.fails / simRuns) * 100)}%)</span>
                  </div>
                  <div className="ratio-bar">
                    <div 
                      className="ratio-bar-fill" 
                      style={{ width: `${(simResults.successes / simRuns) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="results-grid">
                  <div className="res-card">
                    <span className="res-lbl">SUCCESS / FAIL</span>
                    <span className="res-val">{simResults.successes} caught / {simResults.fails} failed</span>
                  </div>
                  <div className="res-card font-mono highlight">
                    <span className="res-lbl text-yellow">SCRAP VALUE</span>
                    <span className="res-val text-yellow">{simResults.scrapValue} Scrap</span>
                    <span className="res-note text-muted">Salmon/Catfish at Village</span>
                  </div>
                </div>

                <div className="yields-card font-mono">
                  <h5 className="section-subheading">Estimated Gutting Yields</h5>
                  <div className="yield-row">
                    <span>Animal Fat:</span>
                    <span className="yield-val highlight-text">{simResults.animalFat}</span>
                  </div>
                  <div className="yield-row">
                    <span>Raw Fish:</span>
                    <span className="yield-val">{simResults.rawFish}</span>
                  </div>
                  <div className="yield-row">
                    <span>Blue Keycard Probability:</span>
                    <span className="yield-val text-info">~{Math.round(simResults.blueCardChance)} Cards ({Math.round(simResults.blueCardChance * 100)}%)</span>
                  </div>
                </div>

                <div className="catches-breakdown">
                  <h5 className="section-subheading">Catch Counts & Distribution</h5>
                  <div className="catch-chart">
                    {Object.entries(simResults.counts)
                      .filter(([_, qty]) => (qty as number) > 0)
                      .map(([name, qty]) => {
                        const count = qty as number;
                        const percentage = simResults.successes > 0 ? (count / simResults.successes) * 100 : 0;
                        return (
                          <div key={name} className="catch-bar-row">
                            <span className="catch-bar-name">
                              {getFishTierBadge(name)}
                              {name}
                            </span>
                            <div className="catch-bar-track">
                              <div 
                                className={`catch-bar-fill ${getFishTierClass(name)}`} 
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="catch-bar-count">{count}</span>
                          </div>
                        );
                      })}
                  </div>

                  <div className="catch-chips" style={{ marginTop: 10 }}>
                    {Object.entries(simResults.counts)
                      .filter(([_, qty]) => (qty as number) > 0)
                      .map(([name, qty]) => (
                        <span key={name} className={getFishChipTierClass(name)}>
                          {getFishTierBadge(name)}
                          {name}: <b>{qty as number}</b>
                        </span>
                      ))}
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
