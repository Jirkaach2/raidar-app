import { useUiStore } from '../../stores/ui-store';
import { RecyclerTool } from './RecyclerTool';
import { CctvTool } from './CctvTool';
import { DecayTool } from './DecayTool';
import { ActivityTool } from './ActivityTool';
import { PriceWatchTool } from './PriceWatchTool';
import { CupboardTool } from './CupboardTool';
import { CrateTool } from './CrateTool';
import { ProfitScanTool } from './ProfitScanTool';
import { RichBaseTool } from './RichBaseTool';
import { RaidCostTool } from './RaidCostTool';
import { PlayerLookupTool } from './PlayerLookupTool';
import { LoadoutTool } from './LoadoutTool';
import {
  Home, Clock, Lock, Flame, RefreshCw,
  DollarSign, Calculator, Compass, Video,
  Activity, Search, Shield, LucideIcon
} from 'lucide-react';
import './ToolsPanel.css';

export function ToolsPanel() {
  const tab = useUiStore((s) => s.activeToolsTab);
  const setTab = useUiStore((s) => s.setActiveToolsTab);

  interface ToolTab {
    id: typeof tab;
    name: string;
    icon: LucideIcon;
  }

  interface ToolGroup {
    label: string;
    tabs: ToolTab[];
  }

  const GROUPS: ToolGroup[] = [
    {
      label: 'BASE & DEFENSE',
      tabs: [
        { id: 'cupboard', name: 'CUPBOARD', icon: Home },
        { id: 'decay', name: 'DECAY', icon: Clock },
      ],
    },
    {
      label: 'RAIDING',
      tabs: [
        { id: 'crates', name: 'LOCKED CRATES', icon: Lock },
        { id: 'raidcost', name: 'RAID COST', icon: Flame },
        { id: 'loadout', name: 'LOADOUT LAB', icon: Shield },
        { id: 'recycler', name: 'RECYCLER', icon: RefreshCw },
      ],
    },
    {
      label: 'INTEL',
      tabs: [
        { id: 'pricewatch', name: 'PRICE WATCH', icon: DollarSign },
        { id: 'profit', name: 'PROFIT SCAN', icon: Calculator },
        { id: 'richbase', name: 'RICH BASES', icon: Compass },
        { id: 'cctv', name: 'CCTV CODES', icon: Video },
        { id: 'activity', name: 'ACTIVITY', icon: Activity },
        { id: 'lookup', name: 'PLAYER LOOKUP', icon: Search },
      ],
    },
  ];

  return (
    <div className="tools-panel-layout glass-panel">
      {/* Sidebar Navigation */}
      <div className="tools-sidebar">
        <div className="tools-sidebar-header">
          <span>UTILITY TOOLS</span>
        </div>
        <div className="tools-sidebar-menu scrollable">
          {GROUPS.map((g) => (
            <div className="tools-sidebar-group" key={g.label}>
              <span className="tools-sidebar-group-label">{g.label}</span>
              {g.tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    className={`tools-sidebar-btn ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    <Icon size={14} />
                    <span>{t.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="tools-content-area scrollable">
        {tab === 'recycler' && <RecyclerTool />}
        {tab === 'pricewatch' && <PriceWatchTool />}
        {tab === 'cctv' && <CctvTool />}
        {tab === 'decay' && <DecayTool />}
        {tab === 'crates' && <CrateTool />}
        {tab === 'profit' && <ProfitScanTool />}
        {tab === 'richbase' && <RichBaseTool />}
        {tab === 'raidcost' && <RaidCostTool />}
        {tab === 'cupboard' && <CupboardTool />}
        {tab === 'activity' && <ActivityTool />}
        {tab === 'lookup' && <PlayerLookupTool />}
        {tab === 'loadout' && <LoadoutTool />}
      </div>
    </div>
  );
}
