/**
 * Rust in-game grid cell size in world units.
 * This is the value used by the official companion app / rustplusplus to
 * reproduce the exact in-game grid letters (A1, D7, ...). It is NOT exactly
 * 150 — the map is divided into ~146.25u cells after correcting the map size.
 */
export const GRID_DIAMETER = 146.25;

/**
 * Rounds the raw map size to a clean multiple of the grid diameter so the
 * number of grid cells matches what the game shows.
 * Ported from rustplusplus (getCorrectedMapSize).
 */
export function getCorrectedMapSize(mapSize: number): number {
  const remainder = mapSize % GRID_DIAMETER;
  const offset = GRID_DIAMETER - remainder;
  return remainder < 120 ? mapSize - remainder : mapSize + offset;
}

/** Number of grid divisions (columns / rows) for a given map size. */
export function getGridDivisions(mapSize: number): number {
  if (mapSize <= 0) return 0;
  return Math.floor(getCorrectedMapSize(mapSize) / GRID_DIAMETER);
}

/**
 * Converts a 1-based grid index into spreadsheet-style letters (1->A, 26->Z, 27->AA).
 * Ported from rustplusplus (numberToLetters).
 */
export function numberToLetters(num: number): string {
  const mod = num % 26;
  let pow = (num / 26) | 0;
  const out = mod ? String.fromCharCode(64 + mod) : (pow--, 'Z');
  return pow ? numberToLetters(pow) + out : out;
}

/**
 * Converts a 0-based column index into letters (0->A, 25->Z, 26->AA).
 * Used by the visual grid overlay; equivalent to numberToLetters(index + 1).
 */
export function columnIndexToLetters(index: number): string {
  return numberToLetters(index + 1);
}

/**
 * Normalizes raw world coordinates to 0..1 coordinates over the FULL map image.
 *
 * Rust+ returns world coordinates with origin (0,0) at the SOUTH-WEST corner of
 * the playable area, X growing East and Y growing North, in the range
 * [0, mapSize].
 *
 * The map IMAGE is `imageWidth` x `imageHeight` pixels and contains an ocean
 * border of `oceanMargin` PIXELS (not world units) on every side. The playable
 * area therefore occupies (imageWidth - 2*oceanMargin) pixels, offset by
 * oceanMargin. This is the exact transform the official companion app uses, so
 * markers, monuments and the grid line up with the rendered image.
 */
export function getNormalizedCoordinates(
  rawX: number,
  rawY: number,
  mapSize: number,
  imageWidth: number = 0,
  imageHeight: number = 0,
  oceanMargin: number = 0
): { x: number; y: number } {
  if (mapSize <= 0) {
    return { x: 0, y: 0 };
  }

  // Fall back to a square image if dimensions are unknown so we still render
  // something reasonable before the map metadata arrives.
  const w = imageWidth > 0 ? imageWidth : 1;
  const h = imageHeight > 0 ? imageHeight : w;

  const pixelX = rawX * ((w - 2 * oceanMargin) / mapSize) + oceanMargin;
  const pixelY = h - (rawY * ((h - 2 * oceanMargin) / mapSize) + oceanMargin);

  return {
    x: Math.max(0, Math.min(1, pixelX / w)),
    y: Math.max(0, Math.min(1, pixelY / h)),
  };
}

/**
 * Translates raw world map coordinates into standard Rust grid coordinates
 * (e.g. A5, D12). World coords have (0,0) at the south-west corner with
 * X East and Y North, matching what Rust+ reports.
 */
export function getGridCoordinate(rawX: number, rawY: number, mapSize: number): string {
  const corrected = getCorrectedMapSize(mapSize);
  if (corrected <= 0) return '??';

  const divisions = Math.floor(corrected / GRID_DIAMETER);

  // Clamp into the playable area so off-grid entities still resolve to an edge cell.
  const clampedX = Math.max(0, Math.min(corrected - 0.001, rawX));
  const clampedY = Math.max(0, Math.min(corrected - 0.001, rawY));

  // Columns: A on the West edge, increasing East.
  const colIndex = Math.floor(clampedX / GRID_DIAMETER);
  const colLabel = numberToLetters(colIndex + 1);

  // Rows: 0 on the North edge, increasing South. Y grows North, so flip.
  const rowFromSouth = Math.floor(clampedY / GRID_DIAMETER);
  const rowIndex = Math.max(0, divisions - 1 - rowFromSouth);

  return `${colLabel}${rowIndex}`;
}

/**
 * Converts spreadsheet-style letters back into a 1-based index (A->1, Z->26, AA->27).
 * Inverse of numberToLetters.
 */
export function lettersToNumber(letters: string): number {
  let num = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const code = up.charCodeAt(i) - 64; // 'A' -> 1
    if (code < 1 || code > 26) continue;
    num = num * 26 + code;
  }
  return num;
}

/**
 * Parses a grid reference like "D7" / "AA12" into its world-space CENTER
 * coordinates (origin south-west, X East, Y North) for the given map size.
 * Returns null if the string can't be parsed.
 */
export function gridToWorldCenter(grid: string, mapSize: number): { x: number; y: number } | null {
  const corrected = getCorrectedMapSize(mapSize);
  if (corrected <= 0) return null;

  const match = /^([A-Za-z]+)\s*(\d+)$/.exec(grid.trim());
  if (!match) return null;

  const divisions = Math.floor(corrected / GRID_DIAMETER);
  const colIndex = lettersToNumber(match[1]) - 1;          // A -> 0
  const rowIndex = parseInt(match[2], 10);                 // 0 at North edge

  if (colIndex < 0 || colIndex >= divisions) return null;
  if (rowIndex < 0 || rowIndex >= divisions) return null;

  // Reverse of getGridCoordinate: rowIndex = divisions - 1 - rowFromSouth
  const rowFromSouth = divisions - 1 - rowIndex;

  const worldX = (colIndex + 0.5) * GRID_DIAMETER;
  const worldY = (rowFromSouth + 0.5) * GRID_DIAMETER;

  return { x: worldX, y: worldY };
}

/**
 * Converts a grid reference (e.g. "D7") directly into normalized 0..1 image
 * coordinates, accounting for the ocean margin. Returns null if unparseable.
 */
export function gridToNormalizedCoordinates(
  grid: string,
  mapSize: number,
  imageWidth = 0,
  imageHeight = 0,
  oceanMargin = 0
): { x: number; y: number } | null {
  const world = gridToWorldCenter(grid, mapSize);
  if (!world) return null;
  return getNormalizedCoordinates(world.x, world.y, mapSize, imageWidth, imageHeight, oceanMargin);
}
