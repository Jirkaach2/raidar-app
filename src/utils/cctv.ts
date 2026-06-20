/**
 * Static CCTV camera identifiers for Rust monuments.
 * Used with a Computer Station to view monument camera feeds.
 * Codes are entered exactly as shown (case-insensitive in game).
 */

export interface CctvMonument {
  monument: string;
  /** Camera identifiers. Some require a wildcard suffix the player must guess. */
  codes: string[];
  /** Note shown for monuments whose codes vary per-server (****). */
  note?: string;
}

export const CCTV_CODES: CctvMonument[] = [
  { monument: 'Airfield', codes: ['AIRFIELDHELIPAD'] },
  { monument: 'Bandit Camp', codes: ['CASINO', 'TOWN', 'WEAPONS'] },
  {
    monument: 'Cargo Ship',
    codes: ['CARGODECK', 'CARGOBRIDGE', 'CARGOSTERN', 'CARGOHOLD1', 'CARGOHOLD2'],
  },
  {
    monument: 'Outpost',
    codes: ['COMPOUNDCHILL', 'COMPOUNDCRUDE', 'COMPOUNDMUSIC', 'COMPOUNDSTREET'],
  },
  {
    monument: 'Abandoned Military Base',
    codes: ['COMPOUND****'],
    note: 'Suffix varies per server — try COMPOUND then guess the suffix.',
  },
  {
    monument: 'Ferry Terminal',
    codes: ['FERRYDOCK', 'FERRYLOGISTICS', 'FERRYPARKING', 'FERRYUTILITIES'],
  },
  {
    monument: 'Missile Silo',
    codes: ['SILOEXIT1', 'SILOEXIT2', 'SILOMISSILE', 'SILOSHIPPING', 'SILOTOWER'],
  },
  {
    monument: 'Large Oil Rig',
    codes: [
      'OILRIG2DOCK', 'OILRIG2EXHAUST', 'OILRIG2HELI', 'OILRIG2L1', 'OILRIG2L2',
      'OILRIG2L3A', 'OILRIG2L3B', 'OILRIG2L4', 'OILRIG2L5',
      'OILRIG2L6A', 'OILRIG2L6B', 'OILRIG2L6C', 'OILRIG2L6D',
    ],
  },
  {
    monument: 'Oil Rig',
    codes: ['OILRIG1DOCK', 'OILRIG1HELI', 'OILRIG1L1', 'OILRIG1L2', 'OILRIG1L3', 'OILRIG1L4'],
  },
  {
    monument: 'Radtown',
    codes: ['RADTOWNAPARTMENTS', 'RADTOWNHOUSE', 'RADTOWNSBL'],
  },
  { monument: 'The Dome', codes: ['DOME1', 'DOMETOP'] },
  {
    monument: 'Underwater Lab',
    codes: [
      'AUXPOWER****', 'BRIG****', 'CANTINA****', 'CAPTAINQUARTER****', 'CLASSIFIED****',
      'CREWQUARTER****', 'HALLWAY****', 'INFIRMARY****', 'LAB****', 'LOCKERROOM****',
      'OPERATIONS****', 'SECURITYHALL****', 'SPECTRE****', 'TECHCABINET****',
    ],
    note: 'Underwater Lab codes have a per-server suffix (****) you must guess.',
  },
];
