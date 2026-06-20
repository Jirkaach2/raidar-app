import React from 'react';
import { useMapStore } from '@/stores/map-store';
import { GRID_DIAMETER, getGridDivisions, columnIndexToLetters } from '../../utils/grid';

interface MapGridProps {
  size: number;
}

/**
 * Renders an SVG grid overlay with lettered columns and numbered rows,
 * matching the Rust in-game map grid style.
 */
const MapGrid = React.memo(function MapGrid({ size }: MapGridProps) {
  const mapSize = useMapStore(s => s.mapSize);
  const oceanMargin = useMapStore(s => s.oceanMargin || 0);
  const imageWidth = useMapStore(s => s.mapImageWidth || 0);
  const imageHeight = useMapStore(s => s.mapImageHeight || 0);

  const GRID_DIVISIONS = getGridDivisions(mapSize) || 20;

  // Match getNormalizedCoordinates exactly: the ocean margin is in IMAGE
  // PIXELS, and the playable area spans (imageWidth - 2*oceanMargin) px which
  // maps to `mapSize` world units. Convert everything into rendered px (the map
  // image fills the `size` x `size` canvas).
  const imgW = imageWidth > 0 ? imageWidth : size;
  const imgH = imageHeight > 0 ? imageHeight : imgW;
  const scaleX = size / imgW;
  const scaleY = size / imgH;

  const startPx = oceanMargin * scaleX;
  const startPy = oceanMargin * scaleY;
  // One grid cell = GRID_DIAMETER world units, expressed in rendered px.
  const playableRenderW = (imgW - 2 * oceanMargin) * scaleX;
  const playableRenderH = (imgH - 2 * oceanMargin) * scaleY;
  const cellSize = (GRID_DIAMETER / mapSize) * playableRenderW;
  const cellSizeY = (GRID_DIAMETER / mapSize) * playableRenderH;
  const widthPx = cellSize * GRID_DIVISIONS;
  const heightPx = cellSizeY * GRID_DIVISIONS;

  const getColLabel = (index: number) => columnIndexToLetters(index);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {/* Grid lines */}
      {Array.from({ length: GRID_DIVISIONS + 1 }, (_, i) => {
        const isBorder = i === 0 || i === GRID_DIVISIONS;
        const vx = startPx + i * cellSize;
        const hy = startPy + i * cellSizeY;
        return (
          <g key={i}>
            {/* Vertical */}
            <line
              x1={vx} y1={startPy} x2={vx} y2={startPy + heightPx}
              stroke={isBorder ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}
              strokeWidth={isBorder ? 1 : 0.5}
            />
            {/* Horizontal */}
            <line
              x1={startPx} y1={hy} x2={startPx + widthPx} y2={hy}
              stroke={isBorder ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}
              strokeWidth={isBorder ? 1 : 0.5}
            />
          </g>
        );
      })}

      {/* Cell coordinates inside each cell (e.g. A10, B10) */}
      {Array.from({ length: GRID_DIVISIONS }).map((_, r) => (
        Array.from({ length: GRID_DIVISIONS }).map((_, c) => {
          const colLabel = getColLabel(c);
          return (
            <text
              key={`cell-${r}-${c}`}
              x={startPx + c * cellSize + 4}
              y={startPy + r * cellSizeY + 11}
              fill="rgba(255,255,255,0.15)"
              fontFamily="var(--font-mono)"
              fontSize="6"
              fontWeight="600"
              pointerEvents="none"
              style={{ textShadow: '0 0.5px 1px rgba(0,0,0,0.5)' }}
            >
              {`${colLabel}${r}`}
            </text>
          );
        })
      ))}

      {/* Top Border Labels (Columns) */}
      {Array.from({ length: GRID_DIVISIONS }).map((_, c) => (
        <text
          key={`top-col-${c}`}
          x={startPx + c * cellSize + cellSize / 2}
          y={startPy - 6}
          textAnchor="middle"
          fill="rgba(232, 226, 217, 0.85)"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="700"
          pointerEvents="none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {getColLabel(c)}
        </text>
      ))}

      {/* Bottom Border Labels (Columns) */}
      {Array.from({ length: GRID_DIVISIONS }).map((_, c) => (
        <text
          key={`bot-col-${c}`}
          x={startPx + c * cellSize + cellSize / 2}
          y={startPy + heightPx + 14}
          textAnchor="middle"
          fill="rgba(232, 226, 217, 0.85)"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="700"
          pointerEvents="none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {getColLabel(c)}
        </text>
      ))}

      {/* Left Border Labels (Rows) */}
      {Array.from({ length: GRID_DIVISIONS }).map((_, r) => (
        <text
          key={`left-row-${r}`}
          x={startPx - 10}
          y={startPy + r * cellSizeY + cellSizeY / 2 + 3}
          textAnchor="middle"
          fill="rgba(232, 226, 217, 0.85)"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="700"
          pointerEvents="none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {r}
        </text>
      ))}

      {/* Right Border Labels (Rows) */}
      {Array.from({ length: GRID_DIVISIONS }).map((_, r) => (
        <text
          key={`right-row-${r}`}
          x={startPx + widthPx + 10}
          y={startPy + r * cellSizeY + cellSizeY / 2 + 3}
          textAnchor="middle"
          fill="rgba(232, 226, 217, 0.85)"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="700"
          pointerEvents="none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {r}
        </text>
      ))}
    </svg>
  );
});

export default MapGrid;
