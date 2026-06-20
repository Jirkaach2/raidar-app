import { invoke } from '@tauri-apps/api/core';

/**
 * RustMaps v4 client (routed through the Rust backend to avoid webview CORS).
 *
 * Caves and the jungle Water Well shopkeeper are NOT sent over Rust+. RustMaps
 * generates the same procedural map from the server's seed + size and returns
 * every monument with WORLD coordinates, which the backend command fetches.
 */

export interface RmMonument {
  /** Canonical type name, e.g. "Cave Small Easy" / "Water Well A". */
  type: string;
  /** WORLD coordinates (metres) in [0, size]. */
  wx: number;
  wy: number;
}

export interface RmStats {
  biome_s: number; biome_d: number; biome_f: number; biome_t: number; biome_j: number;
  land_percent: number; islands: number; mountains: number; rivers: number;
  lakes: number; canyons: number; total_monuments: number;
}

interface RmResult {
  status: 'ok' | 'generating' | 'unauthorized' | 'no_key' | 'error';
  message: string;
  monuments: RmMonument[];
  stats: RmStats | null;
}

export class RustMapsError extends Error {
  constructor(public code: 'no_key' | 'unauthorized' | 'generating' | 'rate' | 'http', message: string) {
    super(message);
  }
}

export interface RmFetch { monuments: RmMonument[]; stats: RmStats | null; }

export async function fetchMapMonuments(key: string, size: number, seed: number): Promise<RmFetch> {
  if (!key.trim()) throw new RustMapsError('no_key', 'No RustMaps API key set.');

  const res = await invoke<RmResult>('get_rustmaps_monuments', { apiKey: key.trim(), size, seed });

  switch (res.status) {
    case 'ok': return { monuments: res.monuments || [], stats: res.stats };
    case 'no_key': throw new RustMapsError('no_key', res.message);
    case 'unauthorized': throw new RustMapsError('unauthorized', res.message || 'RustMaps key rejected.');
    case 'generating': throw new RustMapsError('generating', res.message || 'RustMaps is generating this map.');
    default: throw new RustMapsError('http', res.message || 'RustMaps error.');
  }
}

export function isRmCave(type: string): boolean {
  return type.toLowerCase().includes('cave') || type.toLowerCase().includes('sinkhole');
}

export function isRmWaterWell(type: string): boolean {
  return type.toLowerCase().includes('water well') || type.toLowerCase().includes('waterwell');
}

export function rmCaveScale(type: string): number {
  const t = type.toLowerCase();
  if (t.includes('large')) return 1.0;
  if (t.includes('medium')) return 0.8;
  if (t.includes('small')) return 0.62;
  return 0.7;
}
