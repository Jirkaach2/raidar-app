import { useState, useMemo, useEffect } from 'react';
import { useMapStore } from '../../stores/map-store';
import { triggerSound } from '../../utils/sounds';
import { 
  Fish, Calculator, Play, Square, RefreshCw, 
  HelpCircle, Info, Flame, AlertCircle
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

  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [timerActive, setTimerActive] = useState(false);
  const [timerLeft, setTimerLeft] = useState(90);

  // Sound testing
  const playSplash = () => {
    triggerSound('fish_catch');
  };

  // Timer logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (timerActive && timerLeft > 0) {
      interval = setInterval(() => {
        setTimerLeft((t) => t - 1);
      }, 1000);
    } else if (timerLeft === 0 && timerActive) {
      setTimerActive(false);
      triggerSound('fish_catch');
      useMapStore.getState().addToast('FISH TRAP', '💦 Splash! Your fish trap caught something!', 'info');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive, timerLeft]);

  const startTimer = () => {
    setTimerLeft(timerSeconds);
    setTimerActive(true);
  };

  const stopTimer = () => {
    setTimerActive(false);
  };

  const resetTimer = () => {
    setTimerActive(false);
    setTimerLeft(timerSeconds);
  };

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
    { name: 'Raw Chicken Breast', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Raw Deer Meat', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Raw Horse Meat', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Raw Pork', lvl: 5, stack: 1, maxLvl: 5 },
    { name: 'Black Berry', lvl: 1, stack: 5, maxLvl: 5 },
    { name: 'Blue Berry', lvl: 1, stack: 5, maxLvl: 5 },
    { name: 'Green Berry', lvl: 1, stack: 5, maxLvl: 5 },
    { name: 'Red Berry', lvl: 1, stack: 5, maxLvl: 5 },
    { name: 'White Berry', lvl: 1, stack: 5, maxLvl: 5 },
    { name: 'Yellow Berry', lvl: 1, stack: 5, maxLvl: 5 },
    { name: 'Anchovy', lvl: 2, stack: 2, maxLvl: 4 },
    { name: 'Herring', lvl: 2, stack: 2, maxLvl: 4 },
    { name: 'Sardine', lvl: 2, stack: 2, maxLvl: 4 },
    { name: 'Raw Human Meat', lvl: 3, stack: 1, maxLvl: 3 },
    { name: 'Beehive Nucleus', lvl: 2, stack: 1, maxLvl: 2 },
    { name: 'Raw Fish', lvl: 0.5, stack: 3, maxLvl: 1.5 },
    { name: 'Apple', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Black Raspberries', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Bread Loaf', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Jar of Honey', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Corn', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Potato', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Pumpkin', lvl: 1, stack: 1, maxLvl: 1 },
    { name: 'Wheat', lvl: 1, stack: 1, maxLvl: 1 },
  ], []);

  const filteredBaits = useMemo(() => {
    return baits.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  }, [baits, search]);

  const selectedBaitInfo = useMemo(() => {
    return baits.find(b => b.name === calcBait);
  }, [baits, calcBait]);

  // Calculator results
  const calcResults = useMemo(() => {
    if (!selectedBaitInfo) return null;
    const runs = Math.floor(calcQty / selectedBaitInfo.stack);
    const unused = calcQty % selectedBaitInfo.stack;
    const effectiveBaitLvl = selectedBaitInfo.maxLvl;
    
    let caughtOptions = '';
    if (effectiveBaitLvl >= 5) {
      caughtOptions = 'Salmon, Catfish (Rivers), Small Trout (Ocean), Yellow Perch (Rivers), Anchovy, Herring, Sardine';
    } else if (effectiveBaitLvl >= 3) {
      caughtOptions = 'Small Trout (Ocean), Yellow Perch (Rivers), Anchovy, Herring, Sardine';
    } else {
      caughtOptions = 'Anchovy, Herring, Sardine, Junk items (Diving Fins, Tarp, Bottles, Skulls)';
    }

    return { runs, unused, effectiveBaitLvl, caughtOptions };
  }, [selectedBaitInfo, calcQty]);

  // Catch Simulator
  const runSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      let fails = 0;
      let successes = 0;
      const counts: Record<string, number> = {
        Catfish: 0, Salmon: 0, 'Small Trout': 0, 'Yellow Perch': 0,
        Anchovy: 0, Herring: 0, Sardine: 0, Tarp: 0, 'Diving Fins': 0,
        'Water Jug': 0, 'Human Skull': 0, 'Small Water Bottle': 0, 'Water Bucket': 0
      };

      for (let i = 0; i < simRuns; i++) {
        const roll = Math.random();
        if (roll < 0.5) {
          fails++;
        } else {
          successes++;
          const subRoll = Math.random();
          if (simBaitLvl === '5') {
            if (simWater === 'river') {
              // River 5+ pool
              if (subRoll < 0.25) counts['Catfish']++;
              else if (subRoll < 0.50) counts['Salmon']++;
              else if (subRoll < 0.70) counts['Yellow Perch']++;
              else if (subRoll < 0.80) counts['Anchovy']++;
              else if (subRoll < 0.90) counts['Herring']++;
              else counts['Sardine']++;
            } else {
              // Ocean 5+ pool
              if (subRoll < 0.35) counts['Salmon']++;
              else if (subRoll < 0.70) counts['Small Trout']++;
              else if (subRoll < 0.80) counts['Anchovy']++;
              else if (subRoll < 0.90) counts['Herring']++;
              else counts['Sardine']++;
            }
          } else if (simBaitLvl === '3') {
            if (simWater === 'river') {
              // River 3-4.5 pool
              if (subRoll < 0.40) counts['Yellow Perch']++;
              else if (subRoll < 0.60) counts['Anchovy']++;
              else if (subRoll < 0.80) counts['Herring']++;
              else counts['Sardine']++;
            } else {
              // Ocean 3-4.5 pool
              if (subRoll < 0.40) counts['Small Trout']++;
              else if (subRoll < 0.60) counts['Anchovy']++;
              else if (subRoll < 0.80) counts['Herring']++;
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
      // Catfish/Salmon: 15 Raw Fish, 15 Animal Fat, 20% Blue Card
      // Trout/Perch: 10 Raw Fish, 10 Animal Fat, 0% Card
      // Anchovy/Herring/Sardine: 1 Raw Fish, 0 Fat, 0% Card
      const catfishQty = counts['Catfish'] || 0;
      const salmonQty = counts['Salmon'] || 0;
      const troutQty = counts['Small Trout'] || 0;
      const perchQty = counts['Yellow Perch'] || 0;
      const lowFishQty = (counts['Anchovy'] || 0) + (counts['Herring'] || 0) + (counts['Sardine'] || 0);

      const rawFish = (catfishQty + salmonQty) * 15 + (troutQty + perchQty) * 10 + lowFishQty * 1;
      const animalFat = (catfishQty + salmonQty) * 15 + (troutQty + perchQty) * 10;
      const scrapValue = (catfishQty + salmonQty) * 100; // Salmon/Catfish trade for 100 scrap
      
      // Calculate blue keycard prediction (20% chance per Salmon/Catfish)
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

  return (
    <div className="fishing-panel font-body">
      <div className="fishing-header">
        <h2 className="font-display"><Fish size={22} className="fish-icon" /> FISHING & FISH TRAPS</h2>
        <p className="subtitle">Optimize bait, simulate yields, and manage trap timers to maximize scrap & blue keycards.</p>
      </div>

      <div className="fishing-grid">
        {/* Left Column: Guide & Splash Timer */}
        <div className="fishing-left-col">
          {/* Guide Card */}
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

          {/* Splash Timer Card */}
          <div className="glass-panel card splash-timer-card">
            <h3 className="card-title font-display"><Flame size={16} /> SPLASHING ALARM TIMER</h3>
            <p className="card-desc text-muted">Start the trap timer when you load bait. The alarm will play a splash sound when the trap is ready.</p>
            
            <div className="timer-body">
              <div className="timer-dial">
                <div className="timer-ring">
                  <span className="timer-time font-mono">
                    {Math.floor(timerLeft / 60)}:{(timerLeft % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="timer-status text-dim">{timerActive ? 'FISHING...' : 'READY'}</span>
                </div>
              </div>
              
              <div className="timer-controls">
                <div className="timer-presets">
                  <button className={`preset-btn ${timerSeconds === 60 ? 'active' : ''}`} onClick={() => { setTimerSeconds(60); setTimerLeft(60); }}>60s</button>
                  <button className={`preset-btn ${timerSeconds === 90 ? 'active' : ''}`} onClick={() => { setTimerSeconds(90); setTimerLeft(90); }}>90s</button>
                  <button className={`preset-btn ${timerSeconds === 120 ? 'active' : ''}`} onClick={() => { setTimerSeconds(120); setTimerLeft(120); }}>120s</button>
                </div>
                
                <div className="timer-buttons">
                  {!timerActive ? (
                    <button className="timer-btn play-btn" onClick={startTimer}><Play size={14} /> Start Timer</button>
                  ) : (
                    <button className="timer-btn stop-btn" onClick={stopTimer}><Square size={14} /> Pause</button>
                  )}
                  <button className="timer-btn reset-btn" onClick={resetTimer}><RefreshCw size={14} /> Reset</button>
                  <button className="timer-btn test-btn" onClick={playSplash} title="Test splash alarm noise">Test Sound</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Bait Calculator & Yield Simulator */}
        <div className="fishing-right-col">
          {/* Bait Reference Table */}
          <div className="glass-panel card">
            <h3 className="card-title font-display"><Calculator size={16} /> BAIT CALCULATOR</h3>
            <p className="card-desc text-muted">Rust automatically stacks smaller baits to reach higher bait levels (capped at max lvl).</p>
            
            {/* Quick Calculator Widget */}
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

            {/* Bait Search & Table */}
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
                    <tr key={b.name} className={b.name === calcBait ? 'active-row' : ''} onClick={() => setCalcBait(b.name)}>
                      <td>{b.name}</td>
                      <td>{b.lvl}</td>
                      <td>×{b.stack}</td>
                      <td className="highlight-text">{b.maxLvl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catch Simulator Card */}
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
                  <h5 className="section-subheading">Catch Counts</h5>
                  <div className="catch-chips">
                    {Object.entries(simResults.counts)
                      .filter(([_, qty]) => (qty as number) > 0)
                      .map(([name, qty]) => (
                        <span key={name} className="catch-chip">
                          {name}: <b>{qty as number}</b>
                        </span>
                      ))}
                  </div>
                </div>

                {/* Strategy Suggestion */}
                <div className="strategy-advice">
                  <div className="advice-title font-display"><Info size={13} /> RECOMMENDATION</div>
                  <p className="text-muted" style={{ margin: 0, fontSize: 10.5, lineHeight: 1.4 }}>
                    {simBaitLvl === '5' ? (
                      <>
                        You caught <b className="highlight-text">{simResults.successes}</b> high-tier fish. 
                        We recommend trading them for <b className="text-yellow">{simResults.scrapValue} Scrap</b> at a Fishing Village. 
                        However, if you need Blue Keycards or fuel, gutting them yields <b className="highlight-text">{simResults.animalFat} Animal Fat</b> and has a <b>20% chance</b> to drop a Blue Card per fish!
                      </>
                    ) : simBaitLvl === '3' ? (
                      <>
                        You caught low-tier level 10 baits (Small Trout / Yellow Perch). 
                        <b>DO NOT gut these immediately!</b> Re-fish them back into the traps as level 10 baits. 
                        Even with the 50% trap failure, upgrading trout/perch into Salmon/Catfish is statistically more profitable than gutting them.
                      </>
                    ) : (
                      <>
                        You caught low-tier bait (Anchovies/Sardines) and junk. 
                        Gut Anchovies, Herring, and Sardines for raw fish, and recycle the Diving Fins / Tarps for Cloth & High Quality Metal.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
