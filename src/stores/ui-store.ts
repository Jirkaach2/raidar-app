import { create } from 'zustand';

export type NavPage = 'map' | 'team' | 'vending' | 'devices' | 'tools' | 'spy' | 'settings';
export type ToolsTab = 'recycler' | 'cctv' | 'decay' | 'activity' | 'pricewatch' | 'cupboard' | 'crates' | 'profit' | 'richbase' | 'raidcost' | 'lookup' | 'loadout' | 'marketindex' | 'fishing' | 'farming' | 'combatlog' | 'craftcalc' | 'wipe';

interface UiState {
  activePage: NavPage;
  activeToolsTab: ToolsTab;
  craftItem: string | null;           // shortname preselected for the Craft Calculator
  setActivePage: (page: NavPage) => void;
  setActiveToolsTab: (tab: ToolsTab) => void;
  navigateToToolsTab: (tab: ToolsTab) => void;
  setCraftItem: (short: string | null) => void;
  openCraftItem: (short: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: 'map',
  activeToolsTab: 'recycler',
  craftItem: null,
  setActivePage: (page) => set({ activePage: page }),
  setActiveToolsTab: (tab) => set({ activeToolsTab: tab }),
  navigateToToolsTab: (tab) => set({ activePage: 'tools', activeToolsTab: tab }),
  setCraftItem: (short) => set({ craftItem: short }),
  openCraftItem: (short) => set({ activePage: 'tools', activeToolsTab: 'craftcalc', craftItem: short }),
}));
