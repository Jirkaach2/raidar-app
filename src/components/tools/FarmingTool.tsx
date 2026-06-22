import { useState, useMemo } from 'react';
import { Sprout, Trash2, Plus, Check, AlertTriangle, RotateCcw, Dna, Wand2 } from 'lucide-react';
import './FarmingTool.css';

interface Clone {
  id: string;
  genes: string; // 6 characters, e.g. "GGYYYY"
  name: string;
}

const GENE_WEIGHTS: Record<string, number> = { G: 0.6, Y: 0.6, H: 0.6, W: 1.0, X: 1.0 };
const GENE_ORDER = ['G', 'Y', 'H', 'W', 'X'];
const GENE_META: Record<string, { name: string; desc: string; good: boolean }> = {
  G: { name: 'Growth', desc: 'Faster growth speed', good: true },
  Y: { name: 'Yield', desc: 'More produce / clones', good: true },
  H: { name: 'Hardiness', desc: 'Resists harsh conditions', good: true },
  W: { name: 'Water', desc: 'Higher water need — undesirable', good: false },
  X: { name: 'Empty', desc: 'Blank gene — undesirable', good: false },
};

function cycleGene(g: string, dir: 1 | -1 = 1): string {
  const i = GENE_ORDER.indexOf(g);
  const n = (i + dir + GENE_ORDER.length) % GENE_ORDER.length;
  return GENE_ORDER[n];
}

export function FarmingTool() {
  const [clones, setClones] = useState<Clone[]>([
    { id: '1', genes: 'GYYYYX', name: 'Clone A' },
    { id: '2', genes: 'GGYYXX', name: 'Clone B' },
    { id: '3', genes: 'HHYYGG', name: 'Clone C' },
  ]);
  const [newGenes, setNewGenes] = useState('');
  const [newName, setNewName] = useState('');
  const [target, setTarget] = useState('YYYYGG');
  const [solution, setSolution] = useState<any | null>(null);
  const [solved, setSolved] = useState(false);
  const [solving, setSolving] = useState(false);

  const validateGenes = (str: string) => str.toUpperCase().replace(/[^GYHWX]/g, '').slice(0, 6);

  const targetArr = useMemo(() => {
    const t = (target + 'XXXXXX').slice(0, 6);
    return t.split('');
  }, [target]);

  const setTargetSlot = (idx: number, g: string) => {
    const arr = targetArr.slice();
    arr[idx] = g;
    setTarget(arr.join(''));
  };

  const handleAddClone = () => {
    const cleaned = validateGenes(newGenes);
    if (cleaned.length !== 6) return;
    const name = newName.trim() || `Clone ${String.fromCharCode(65 + clones.length)}`;
    setClones([...clones, { id: Date.now().toString(), genes: cleaned, name }]);
    setNewGenes('');
    setNewName('');
  };

  const handleRemoveClone = (id: string) => setClones(clones.filter((c) => c.id !== id));

  const getCombinationsWithReplacement = (arr: Clone[], length: number): Clone[][] => {
    if (length === 0) return [[]];
    const results: Clone[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const remaining = getCombinationsWithReplacement(arr.slice(i), length - 1);
      for (const r of remaining) results.push([arr[i], ...r]);
    }
    return results;
  };

  const evalSlot = (combo: Clone[], slot: number, targetGene: string) => {
    const weights: Record<string, number> = { G: 0, Y: 0, H: 0, W: 0, X: 0 };
    for (const clone of combo) {
      const gene = clone.genes[slot];
      weights[gene] = (weights[gene] || 0) + GENE_WEIGHTS[gene];
    }
    let maxVal = -1, winner = '', isTie = false;
    for (const [gene, val] of Object.entries(weights)) {
      if (val > maxVal) { maxVal = val; winner = gene; isTie = false; }
      else if (val === maxVal && val > 0) { isTie = true; }
    }
    const match = !isTie && winner === targetGene;
    return { slot, weights, winner, targetGene, match, isTie };
  };

  const solveCrossbreed = () => {
    setSolved(true);
    const cleanedTarget = validateGenes(target);
    if (cleanedTarget.length !== 6) return;
    if (clones.length === 0) { setSolution({ error: 'Add at least one clone to breed from.' }); return; }

    const n = clones.length;
    let maxSize = 8;
    if (n >= 16) maxSize = 5; else if (n >= 10) maxSize = 6; else if (n >= 7) maxSize = 7;

    setSolving(true);
    setSolution(null);
    setTimeout(() => {
      setSolution(runSolver(cleanedTarget, maxSize));
      setSolving(false);
    }, 30);
  };

  const runSolver = (cleanedTarget: string, maxSize: number): any => {
    for (let size = 2; size <= maxSize; size++) {
      for (const combo of getCombinationsWithReplacement(clones, size)) {
        const slotDetails: any[] = [];
        let ok = true;
        for (let slot = 0; slot < 6; slot++) {
          const d = evalSlot(combo, slot, cleanedTarget[slot]);
          if (!d.match) { ok = false; break; }
          slotDetails.push(d);
        }
        if (ok) return { success: true, neighbors: combo, size, slotDetails };
      }
    }
    let bestCombo: Clone[] = [], bestScore = -1, bestSlotDetails: any[] = [];
    const closestMax = Math.min(maxSize, 6);
    for (let size = 3; size <= closestMax; size++) {
      for (const combo of getCombinationsWithReplacement(clones, size)) {
        let score = 0;
        const tmp: any[] = [];
        for (let slot = 0; slot < 6; slot++) {
          const d = evalSlot(combo, slot, cleanedTarget[slot]);
          if (d.match) score++;
          tmp.push(d);
        }
        if (score > bestScore) { bestScore = score; bestCombo = combo; bestSlotDetails = tmp; }
      }
    }
    return { success: false, closestNeighbors: bestCombo, score: bestScore, slotDetails: bestSlotDetails };
  };

  const getPlanterLayout = (neighbors: Clone[]) => {
    const layout = Array(9).fill(null);
    layout[4] = { name: 'CROSSBREED', type: 'target' };
    const neighborSlots = [0, 2, 6, 8, 1, 3, 5, 7];
    for (let i = 0; i < neighbors.length && i < neighborSlots.length; i++) {
      layout[neighborSlots[i]] = { name: neighbors[i].name, genes: neighbors[i].genes, type: 'clone' };
    }
    return layout;
  };

  const renderGenes = (genes: string) => (
    <span className="fg-seq">
      {genes.split('').map((g, i) => (
        <span key={i} className={`fg-pill ${GENE_META[g]?.good ? 'fg-pill--good' : 'fg-pill--bad'}`}>{g}</span>
      ))}
    </span>
  );

  const neighbors = solution?.neighbors || solution?.closestNeighbors || [];

  return (
    <div className="fg">
      <header className="fg-header">
        <div className="fg-header-title">
          <span className="fg-header-icon"><Dna size={20} /></span>
          <div>
            <h2>Farming Genetic Solver</h2>
            <p>Find the planting grid that crossbreeds your clones into a target genotype.</p>
          </div>
        </div>
      </header>

      <div className="fg-body">
        {/* LEFT */}
        <div className="fg-col">
          {/* Target */}
          <section className="fg-card">
            <div className="fg-card-head">
              <h3>Target genotype</h3>
              <span className="fg-hint">click a slot to cycle</span>
            </div>
            <div className="fg-target">
              {targetArr.map((g, i) => (
                <button
                  key={i}
                  className={`fg-slot ${GENE_META[g]?.good ? 'fg-slot--good' : 'fg-slot--bad'}`}
                  onClick={() => setTargetSlot(i, cycleGene(g))}
                  onContextMenu={(e) => { e.preventDefault(); setTargetSlot(i, cycleGene(g, -1)); }}
                  title={`${GENE_META[g]?.name} — left-click next, right-click previous`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="fg-target-actions">
              <button className="fg-btn-solve" onClick={solveCrossbreed} disabled={solving}>
                <Wand2 size={14} /> {solving ? 'Solving…' : 'Solve grid'}
              </button>
              <button className="fg-btn-ghost" onClick={() => setTarget('GGYYHH')} title="Reset to a strong default">
                <RotateCcw size={13} /> GGYYHH
              </button>
            </div>
          </section>

          {/* Clones */}
          <section className="fg-card">
            <div className="fg-card-head">
              <h3>Your clones</h3>
              <span className="fg-count">{clones.length}</span>
            </div>
            <div className="fg-clone-list">
              {clones.map((c) => (
                <div key={c.id} className="fg-clone">
                  <span className="fg-clone-name">{c.name}</span>
                  {renderGenes(c.genes)}
                  <button className="fg-clone-del" onClick={() => handleRemoveClone(c.id)} title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {clones.length === 0 && <div className="fg-empty-line">No clones yet — add some below.</div>}
            </div>
            <div className="fg-add">
              <input className="fg-input" placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input
                className="fg-input fg-input--genes"
                placeholder="GENES"
                value={newGenes}
                maxLength={6}
                onChange={(e) => setNewGenes(validateGenes(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClone()}
              />
              <button className="fg-btn-add" onClick={handleAddClone} disabled={validateGenes(newGenes).length !== 6}>
                <Plus size={14} /> Add
              </button>
            </div>
            <div className="fg-legend">
              {GENE_ORDER.map((g) => (
                <span key={g} className="fg-legend-item">
                  <span className={`fg-pill ${GENE_META[g].good ? 'fg-pill--good' : 'fg-pill--bad'}`}>{g}</span>
                  <span className="fg-legend-text">{GENE_META[g].name}<em>{GENE_WEIGHTS[g].toFixed(1)}</em></span>
                </span>
              ))}
            </div>
            <p className="fg-rule">
              Each of the 8 surrounding plants votes on every slot with its gene's weight. Highest total wins and
              overwrites the centre. Reds (<b>W/X</b>) weigh <b>1.0</b> and dominate greens (<b>G/Y/H</b>) at <b>0.6</b>. A tie keeps the centre plant's gene.
            </p>
          </section>
        </div>

        {/* RIGHT */}
        <div className="fg-col fg-col--result">
          <section className="fg-card fg-card--fill">
            <div className="fg-card-head"><h3>Planting solution</h3></div>

            {!solved ? (
              <div className="fg-placeholder">
                <Sprout size={40} />
                <p>Set your target and hit <b>Solve grid</b> to compute the optimal planter layout.</p>
              </div>
            ) : solving ? (
              <div className="fg-placeholder">
                <Dna size={40} className="fg-spin" />
                <p>Searching crossbreed combinations…</p>
              </div>
            ) : solution?.error ? (
              <div className="fg-placeholder fg-placeholder--err">
                <AlertTriangle size={36} />
                <p>{solution.error}</p>
              </div>
            ) : (
              <>
                <div className={`fg-banner ${solution.success ? 'fg-banner--ok' : 'fg-banner--warn'}`}>
                  {solution.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                  {solution.success
                    ? `Exact match — plant ${solution.size} neighbour${solution.size > 1 ? 's' : ''}`
                    : `No exact 1-step match · closest ${solution.score}/6 slots`}
                </div>

                <div className="fg-planter">
                  {getPlanterLayout(neighbors).map((cell, idx) => {
                    if (!cell) return <div key={idx} className="fg-cell fg-cell--empty" />;
                    if (cell.type === 'target') {
                      return (
                        <div key={idx} className={`fg-cell fg-cell--center ${solution.success ? 'ok' : 'warn'}`}>
                          <span className="fg-cell-label">CENTRE</span>
                          {solution.success ? renderGenes(validateGenes(target)) : <span className="fg-cell-closest">closest</span>}
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className="fg-cell fg-cell--clone">
                        <span className="fg-cell-label">{cell.name}</span>
                        {renderGenes(cell.genes)}
                      </div>
                    );
                  })}
                </div>

                <ol className="fg-steps">
                  <li>Plant the surrounding neighbour clones shown above.</li>
                  <li>Let them reach the <b>Crossbreeding / Sapling</b> stage.</li>
                  <li>Plant the centre crop. When it crossbreeds it absorbs the winning genes.</li>
                  <li>Take cuttings of the centre immediately once it flips to the target.</li>
                </ol>

                <div className="fg-table-wrap">
                  <table className="fg-table">
                    <thead>
                      <tr><th>Slot</th><th>Target</th><th>Winner</th><th>Weights</th><th></th></tr>
                    </thead>
                    <tbody>
                      {solution.slotDetails.map((d: any, i: number) => (
                        <tr key={i} className={d.match ? '' : 'fg-row-miss'}>
                          <td>#{d.slot + 1}</td>
                          <td><span className={`fg-pill ${GENE_META[d.targetGene]?.good ? 'fg-pill--good' : 'fg-pill--bad'}`}>{d.targetGene}</span></td>
                          <td>{d.winner ? <span className={`fg-pill ${GENE_META[d.winner]?.good ? 'fg-pill--good' : 'fg-pill--bad'}`}>{d.winner}</span> : <span className="fg-tie">tie</span>}</td>
                          <td>
                            <div className="fg-weights">
                              {Object.entries(d.weights).map(([g, v]: [string, any]) => v > 0 && (
                                <span key={g} className={`fg-weight ${d.winner === g ? 'win' : ''} ${GENE_META[g]?.good ? 'good' : 'bad'}`}>
                                  {g}<em>{v.toFixed(1)}</em>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>{d.match ? <Check size={14} className="fg-ok-ico" /> : <span className="fg-x">×</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
