import { create } from 'zustand';

export type NavPage = 'map' | 'team' | 'vending' | 'devices' | 'tools' | 'spy' | 'settings';
export type ToolsTab = 'recycler' | 'cctv' | 'decay' | 'activity' | 'pricewatch' | 'cupboard' | 'crates' | 'profit' | 'richbase' | 'raidcost' | 'lookup' | 'loadout';

interface UiState {
  activePage: NavPage;
  activeToolsTab: ToolsTab;
  setActivePage: (page: NavPage) => void;
  setActiveToolsTab: (tab: ToolsTab) => void;
  navigateToToolsTab: (tab: ToolsTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: 'map',
  activeToolsTab: 'recycler',
  setActivePage: (page) => set({ activePage: page }),
  setActiveToolsTab: (tab) => set({ activeToolsTab: tab }),
  navigateToToolsTab: (tab) => set({ activePage: 'tools', activeToolsTab: tab }),
}));
