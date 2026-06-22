import { useState } from 'react';
import { Sprout, Trash2, Plus, Info, Check, AlertTriangle } from 'lucide-react';
import './FarmingTool.css';

interface Clone {
  id: string;
  genes: string; // 6 characters, e.g., "GGYYYY"
  name: string;
}

const GENE_WEIGHTS: Record<string, number> = {
  G: 0.6,
  Y: 0.6,
  H: 0.6,
  W: 1.0,
  X: 1.0,
};

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

  // Validate gene string
  const validateGenes = (str: string) => {
    const cleaned = str.toUpperCase().replace(/[^GYHWX]/g, '');
    return cleaned.slice(0, 6);
  };

  const handleAddClone = () => {
    const cleaned = validateGenes(newGenes);
    if (cleaned.length !== 6) {
      alert('Genes must be exactly 6 characters of G, Y, H, W, or X.');
      return;
    }
    const name = newName.trim() || `Clone ${String.fromCharCode(65 + clones.length)}`;
    setClones([...clones, { id: Date.now().toString(), genes: cleaned, name }]);
    setNewGenes('');
    setNewName('');
  };

  const handleRemoveClone = (id: string) => {
    setClones(clones.filter((c) => c.id !== id));
  };

  // Helper: Get combinations with replacement
  const getCombinationsWithReplacement = (arr: Clone[], length: number): Clone[][] => {
    if (length === 0) return [[]];
    const results: Clone[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const remaining = getCombinationsWithReplacement(arr.slice(i), length - 1);
      for (const r of remaining) {
        results.push([arr[i], ...r]);
      }
    }
    return results;
  };

  // Solver Algorithm
  const solveCrossbreed = () => {
    setSolved(true);
    const cleanedTarget = validateGenes(target);
    if (cleanedTarget.length !== 6) {
      alert('Target genes must be exactly 6 characters.');
      return;
    }

    if (clones.length === 0) {
      setSolution({ error: 'Please add at least one clone to use as breeding stock.' });
      return;
    }

    // We will search neighbor combinations of size 2 to 8
    for (let size = 2; size <= 8; size++) {
      const combos = getCombinationsWithReplacement(clones, size);
      
      for (const combo of combos) {
        // Try each slot
        let matchesAll = true;
        const slotDetails: any[] = [];

        for (let slot = 0; slot < 6; slot++) {
          // Count weights of genes in this slot
          const weights: Record<string, number> = { G: 0, Y: 0, H: 0, W: 0, X: 0 };
          for (const clone of combo) {
            const gene = clone.genes[slot];
            weights[gene] = (weights[gene] || 0) + GENE_WEIGHTS[gene];
          }

          // Find winning gene
          let maxVal = -1;
          let winner = '';
          let isTie = false;

          for (const [gene, val] of Object.entries(weights)) {
            if (val > maxVal) {
              maxVal = val;
              winner = gene;
              isTie = false;
            } else if (val === maxVal && val > 0) {
              isTie = true;
            }
          }

          const targetGene = cleanedTarget[slot];
          if (isTie || winner !== targetGene) {
            matchesAll = false;
            break;
          }

          slotDetails.push({ slot, weights, winner, targetGene, match: true });
        }

        if (matchesAll) {
          // Found a solution!
          setSolution({
            success: true,
            neighbors: combo,
            size,
            slotDetails,
          });
          return;
        }
      }
    }

    // If no exact solution, look for closest matches (combos of size 3 to 6)
    let bestCombo: Clone[] = [];
    let bestScore = -1;
    let bestSlotDetails: any[] = [];

    for (let size = 3; size <= 6; size++) {
      const combos = getCombinationsWithReplacement(clones, size);
      for (const combo of combos) {
        let score = 0;
        const tempDetails: any[] = [];
        for (let slot = 0; slot < 6; slot++) {
          const weights: Record<string, number> = { G: 0, Y: 0, H: 0, W: 0, X: 0 };
          for (const clone of combo) {
            const gene = clone.genes[slot];
            weights[gene] = (weights[gene] || 0) + GENE_WEIGHTS[gene];
          }
          let maxVal = -1;
          let winner = '';
          let isTie = false;
          for (const [gene, val] of Object.entries(weights)) {
            if (val > maxVal) {
              maxVal = val;
              winner = gene;
              isTie = false;
            } else if (val === maxVal && val > 0) {
              isTie = true;
            }
          }
          const targetGene = cleanedTarget[slot];
          const match = !isTie && winner === targetGene;
          if (match) score++;
          tempDetails.push({ slot, weights, winner, targetGene, match });
        }

        if (score > bestScore) {
          bestScore = score;
          bestCombo = combo;
          bestSlotDetails = tempDetails;
        }
      }
    }

    setSolution({
      success: false,
      closestNeighbors: bestCombo,
      score: bestScore,
      slotDetails: bestSlotDetails,
    });
  };

  // Map neighbor combination to a 3x3 layout
  // Center is the crossbreed spot (shown as ? / Target)
  // Neighbors are distributed around the center
  const getPlanterLayout = (neighbors: Clone[]) => {
    const layout = Array(9).fill(null);
    layout[4] = { name: 'CROSSBREED', type: 'target' }; // Center
    
    // Distribute neighbors into outer slots
    // Available slots: 0, 1, 2, 3, 5, 6, 7, 8
    const neighborSlots = [0, 2, 6, 8, 1, 3, 5, 7]; // Prefer corners, then sides
    for (let i = 0; i < neighbors.length; i++) {
      if (i < neighborSlots.length) {
        layout[neighborSlots[i]] = { name: neighbors[i].name, genes: neighbors[i].genes, type: 'clone' };
      }
    }
    return layout;
  };

  return (
    <div className="farming-tool">
      <div className="farm-header">
        <h2 className="farm-title font-display">
          <Sprout size={22} /> FARMING GENETIC CROSSBREED SOLVER
        </h2>
        <p className="farm-subtitle">
          Input your available plant clones and target genes to calculate the optimal planting grid.
        </p>
      </div>

      <div className="farm-layout">
        {/* Left Column: Clone Inventory & Target Selector */}
        <div className="farm-col">
          {/* Inventory Card */}
          <div className="farm-card">
            <h3 className="farm-card-heading font-display">AVAILABLE CLONES</h3>
            
            <div className="clone-list">
              {clones.map((c) => (
                <div key={c.id} className="clone-card">
                  <div className="clone-info">
                    <strong className="clone-name">{c.name}</strong>
                    <span className="gene-sequence">
                      {c.genes.split('').map((g, idx) => (
                        <span key={idx} className={`gene-pill ${['W', 'X'].includes(g) ? 'gene-pill-red' : 'gene-pill-green'}`}>
                          {g}
                        </span>
                      ))}
                    </span>
                  </div>
                  <button onClick={() => handleRemoveClone(c.id)} className="clone-remove-btn" title="Remove Clone">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {clones.length === 0 && (
                <div className="clone-empty">No clones added yet. Add some below.</div>
              )}
            </div>

            {/* Add Clone Form */}
            <div className="farm-form-row">
              <input 
                type="text" 
                placeholder="Clone Name (e.g. Clone D)" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="farm-input"
              />
              <input 
                type="text" 
                placeholder="GENES" 
                value={newGenes} 
                onChange={(e) => setNewGenes(validateGenes(e.target.value))}
                maxLength={6}
                className="farm-input farm-input-genes font-mono"
              />
              <button onClick={handleAddClone} className="farm-add-btn font-display">
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Target Config Card */}
          <div className="farm-card">
            <h3 className="farm-card-heading font-display">TARGET GENE SEQUENCE</h3>
            <div className="farm-target-row">
              <div className="farm-target-input-wrap">
                <input 
                  type="text" 
                  value={target} 
                  onChange={(e) => setTarget(validateGenes(e.target.value))}
                  maxLength={6}
                  className="farm-target-input font-mono"
                />
              </div>
              <button onClick={solveCrossbreed} className="farm-solve-btn font-display">
                SOLVE MATRIX
              </button>
            </div>
            
            {/* Gene Legend */}
            <div className="gene-legend">
              <div className="gene-legend-title font-display">Gene Specification Legend</div>
              <div className="gene-legend-item">
                <span className="gene-pill gene-pill-green">G</span>
                <span className="gene-legend-label">
                  <span className="gene-legend-name">Growth</span>
                  <span className="gene-legend-weight">0.6</span>
                </span>
              </div>
              <div className="gene-legend-item">
                <span className="gene-pill gene-pill-green">Y</span>
                <span className="gene-legend-label">
                  <span className="gene-legend-name">Yield</span>
                  <span className="gene-legend-weight">0.6</span>
                </span>
              </div>
              <div className="gene-legend-item">
                <span className="gene-pill gene-pill-green">H</span>
                <span className="gene-legend-label">
                  <span className="gene-legend-name">Hardy</span>
                  <span className="gene-legend-weight">0.6</span>
                </span>
              </div>
              <div className="gene-legend-item">
                <span className="gene-pill gene-pill-red">W</span>
                <span className="gene-legend-label">
                  <span className="gene-legend-name">Water</span>
                  <span className="gene-legend-weight">1.0</span>
                </span>
              </div>
              <div className="gene-legend-item" style={{ gridColumn: 'span 2' }}>
                <span className="gene-pill gene-pill-red">X</span>
                <span className="gene-legend-label">
                  <span className="gene-legend-name">Empty / Crossbreeding penalty</span>
                  <span className="gene-legend-weight">1.0</span>
                </span>
              </div>
            </div>

            {/* Info / rules box */}
            <div className="farm-info-box">
              <Info size={16} />
              <div>
                <strong>Rules of Rust Crossbreeding:</strong>
                <ul>
                  <li>Red genes (<span className="farm-info-red">W, X</span>) weigh <strong style={{ color: '#fff' }}>1.0</strong> each.</li>
                  <li>Green genes (<span className="farm-info-green">G, Y, H</span>) weigh <strong style={{ color: '#fff' }}>0.6</strong> each.</li>
                  <li>The gene with the highest total weight in a slot wins and overwrites the center.</li>
                  <li>Ties maintain the center plant's original gene.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Solution Output */}
        <div className="farm-col-right">
          <div className="farm-card farm-solution-card">
            <h3 className="farm-card-heading font-display">SOLVER SOLUTION</h3>

            {!solved ? (
              <div className="farm-empty-state">
                <Sprout size={36} className="farm-empty-icon" />
                <span className="farm-empty-text">Enter your inventory clones and click <strong>SOLVE MATRIX</strong> to compute planting layout.</span>
              </div>
            ) : solution?.error ? (
              <div className="farm-error-text">{solution.error}</div>
            ) : (
              <div className="farm-results">
                {/* Banner */}
                {solution.success ? (
                  <div className="farm-banner farm-banner-success">
                    <Check size={16} />
                    <span>EXACT BREEDING MATCH FOUND! ({solution.size} neighbors)</span>
                  </div>
                ) : (
                  <div className="farm-banner farm-banner-warning">
                    <AlertTriangle size={16} />
                    <span>NO EXACT 1-STEP MATCH (Closest: {solution.score}/6 match)</span>
                  </div>
                )}

                {/* Planter Layout Visual */}
                <div className="planter-wrap">
                  <div className="planter-grid">
                    {getPlanterLayout(solution.neighbors || solution.closestNeighbors).map((cell, idx) => {
                      if (!cell) {
                        return <div key={idx} className="planter-cell planter-cell-empty" />;
                      }
                      const isCenter = cell.type === 'target';
                      const cellClass = isCenter 
                        ? `planter-cell planter-cell-center ${solution.success ? 'planter-cell-center-success' : 'planter-cell-center-warning'}`
                        : 'planter-cell planter-cell-clone';
                      
                      return (
                        <div key={idx} className={cellClass}>
                          <span className={`planter-cell-name ${
                            isCenter 
                              ? (solution.success ? 'planter-cell-name-center' : 'planter-cell-name-center planter-cell-name-warning')
                              : 'planter-cell-name-clone'
                          }`}>
                            {cell.name}
                          </span>
                          {isCenter ? (
                            solution.success ? (
                              <span className="planter-cell-target-genes">{target}</span>
                            ) : (
                              <span className="planter-cell-closest">CLOSEST</span>
                            )
                          ) : (
                            <span className="planter-cell-genes">{cell.genes}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Instructions */}
                <div className="farm-instructions">
                  <strong>Breeding Instructions:</strong>
                  <ol>
                    <li>Plant the surrounding neighbor clones in the positions shown above.</li>
                    <li>Wait for them to grow into the <strong>Crossbreed-compatible stage</strong> (e.g. Crossbreeding / Sapling).</li>
                    <li>Plant the central crop (seed or wild clone) in the center slot.</li>
                    <li>When the central plant enters the Crossbreeding stage, it will absorb the genes and become your target clone. Take cuttings immediately!</li>
                  </ol>
                </div>

                {/* Slot Details Table */}
                <div className="farm-table-wrap">
                  <table className="farm-table">
                    <thead>
                      <tr>
                        <th>Slot</th>
                        <th>Target</th>
                        <th>Winner</th>
                        <th>Weight Distribution</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solution.slotDetails.map((det: any, idx: number) => {
                        const numNeighbors = (solution.neighbors || solution.closestNeighbors || []).length;
                        return (
                          <tr key={idx}>
                            <td>#{det.slot + 1}</td>
                            <td>
                              <span className={`gene-pill ${['W', 'X'].includes(det.targetGene) ? 'gene-pill-red' : 'gene-pill-green'}`}>
                                {det.targetGene}
                              </span>
                            </td>
                            <td>
                              {det.winner ? (
                                <span className={`gene-pill ${['W', 'X'].includes(det.winner) ? 'gene-pill-red' : 'gene-pill-green'}`}>
                                  {det.winner}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--color-text-dim)' }}>Tie</span>
                              )}
                            </td>
                            <td>
                              <div className="weight-bars">
                                {Object.entries(det.weights).map(([gene, val]: [string, any]) => {
                                  if (val === 0) return null;
                                  const isRed = ['W', 'X'].includes(gene);
                                  const isWinner = det.winner === gene;
                                  const fillWidth = numNeighbors > 0 ? (val / numNeighbors) * 100 : 0;
                                  return (
                                    <div className="weight-bar-row" key={gene}>
                                      <span className={`weight-bar-label ${isRed ? 'weight-bar-label-red' : 'weight-bar-label-green'}`}>{gene}</span>
                                      <div className="weight-bar-track">
                                        <div 
                                          className={`weight-bar-fill ${isRed ? 'weight-bar-fill-red' : 'weight-bar-fill-green'} ${isWinner ? 'weight-bar-fill-winner' : ''}`}
                                          style={{ width: `${fillWidth}%` }}
                                        />
                                      </div>
                                      <span className="weight-bar-value">{val.toFixed(1)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td>
                              <span className={`farm-status-pill ${det.match ? 'farm-status-match' : 'farm-status-mismatch'}`}>
                                {det.match ? 'MATCH' : 'MISMATCH'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
