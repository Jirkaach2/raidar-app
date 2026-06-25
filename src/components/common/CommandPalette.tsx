import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { useUiStore, NavPage, ToolsTab } from '../../stores/ui-store';
import { listMonuments } from '../../utils/monuments';
import './CommandPalette.css';

type Kind = 'Page' | 'Tool' | 'Monument';
interface Cmd { id: string; kind: Kind; label: string; sub?: string; run: () => void; }

const PAGES: { label: string; page: NavPage }[] = [
  { label: 'Map', page: 'map' },
  { label: 'Team', page: 'team' },
  { label: 'Vending Machines', page: 'vending' },
  { label: 'Smart Devices', page: 'devices' },
  { label: 'Tools', page: 'tools' },
  { label: 'Rust Spy', page: 'spy' },
  { label: 'Monuments', page: 'monuments' },
  { label: 'Commands', page: 'commands' },
  { label: 'Settings', page: 'settings' },
];

const TOOLS: { label: string; tab: ToolsTab }[] = [
  { label: 'Recycler', tab: 'recycler' },
  { label: 'CCTV Codes', tab: 'cctv' },
  { label: 'Decay Calculator', tab: 'decay' },
  { label: 'Activity', tab: 'activity' },
  { label: 'Price Watch', tab: 'pricewatch' },
  { label: 'Tool Cupboard', tab: 'cupboard' },
  { label: 'Locked Crates', tab: 'crates' },
  { label: 'Profit Scan', tab: 'profit' },
  { label: 'Rich Bases', tab: 'richbase' },
  { label: 'Raid Cost', tab: 'raidcost' },
  { label: 'Player Lookup', tab: 'lookup' },
  { label: 'Loadout Lab', tab: 'loadout' },
  { label: 'Market Index', tab: 'marketindex' },
  { label: 'Fishing Guide', tab: 'fishing' },
  { label: 'Farming Solver', tab: 'farming' },
  { label: 'Combat Log', tab: 'combatlog' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setActivePage = useUiStore((s) => s.setActivePage);
  const navigateToToolsTab = useUiStore((s) => s.navigateToToolsTab);

  // Build the full command index once.
  const commands = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    for (const p of PAGES) out.push({ id: `page:${p.page}`, kind: 'Page', label: p.label, run: () => setActivePage(p.page) });
    for (const t of TOOLS) out.push({ id: `tool:${t.tab}`, kind: 'Tool', label: t.label, sub: 'Tools', run: () => navigateToToolsTab(t.tab) });
    for (const m of listMonuments()) out.push({ id: `mon:${m.key}`, kind: 'Monument', label: m.name, sub: 'Open map', run: () => setActivePage('map') });
    return out;
  }, [setActivePage, navigateToToolsTab]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default view: pages + tools only (keeps it short).
      return commands.filter((c) => c.kind === 'Page' || c.kind === 'Tool').slice(0, 25);
    }
    const scored = commands
      .map((c) => {
        const label = c.label.toLowerCase();
        let score = -1;
        if (label === q) score = 100;
        else if (label.startsWith(q)) score = 80;
        else if (label.includes(q)) score = 50;
        return { c, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
    return scored.map((x) => x.c);
  }, [query, commands]);

  // Global hotkey.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset + focus on open.
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  const choose = (c: Cmd | undefined) => { if (!c) return; c.run(); setOpen(false); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmdp-row.active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="cmdp-overlay" onMouseDown={() => setOpen(false)}>
      <div className="cmdp" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdp-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to a tool, monument or item…"
          />
          <kbd className="cmdp-esc">ESC</kbd>
        </div>
        <div className="cmdp-list" ref={listRef}>
          {results.length === 0 && <div className="cmdp-none">No matches for "{query}"</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              className={`cmdp-row ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              <span className={`cmdp-kind cmdp-kind--${c.kind.toLowerCase()}`}>{c.kind}</span>
              <span className="cmdp-label">{c.label}</span>
              {c.sub && <span className="cmdp-sub">{c.sub}</span>}
              {i === active && <CornerDownLeft size={13} className="cmdp-enter" />}
            </button>
          ))}
        </div>
        <div className="cmdp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
