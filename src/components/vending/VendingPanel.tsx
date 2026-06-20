import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMapStore } from '@/stores/map-store';
import { useTeamStore } from '@/stores/team-store';
import { getGridCoordinate, getNormalizedCoordinates } from '@/utils/grid';
import { getItemShortname } from '@/utils/items';
import { Avatar } from '../common/Avatar';
import { MapPin, Info, ArrowUpDown } from 'lucide-react';
import { BestShops } from './BestShops';
import { WaterWellVendor } from './WaterWellVendor';
import './VendingPanel.css';

export function VendingPanel() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'market' | 'best'>('market');
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [shopType, setShopType] = useState<'all' | 'player' | 'npc'>('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'cheapest' | 'stock' | 'closest'>('cheapest');
  
  const markers = useMapStore(s => s.markers);
  const monuments = useMapStore(s => s.monuments);
  const mapSize = useMapStore(s => s.mapSize);
  const oceanMargin = useMapStore(s => s.oceanMargin || 0);
  const mapImageWidth = useMapStore(s => s.mapImageWidth || 0);
  const mapImageHeight = useMapStore(s => s.mapImageHeight || 0);
  
  const { chatMessages, sendMessage, members } = useTeamStore();
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const selfMember = useMemo(() => {
    return members.find(m => m.isSelf);
  }, [members]);

  const vendingMachines = useMemo(() => {
    return markers.filter(m => m.type === 'vending_machine' && m.raw && m.raw.sell_orders);
  }, [markers]);

  // Helper to identify NPC shops
  const isNpcShop = (label: string, nx: number, ny: number): boolean => {
    const lname = (label || '').toLowerCase();
    const npcNames = [
      'outpost', 'bandit', 'deep sea', 'medical shop', 'components shop',
      'resources shop', 'weapons shop', 'explosives shop', 'travelling vendor',
      'traveling vendor', 'wandering trader', 'air wolf', 'airwolf',
      'ranch', 'barn', 'stable', 'fishing', 'village', 'shopkeeper'
    ];
    if (npcNames.some(n => lname.includes(n))) return true;

    for (const m of monuments) {
      const key = (m.token || '').toLowerCase();
      if (
        key.includes('outpost') || key.includes('bandit') || key.includes('fishing') ||
        key.includes('barn') || key.includes('stable') || key.includes('ranch')
      ) {
        const p = getNormalizedCoordinates(m.x, m.y, mapSize, mapImageWidth, mapImageHeight, oceanMargin);
        if (Math.hypot(nx - p.x, ny - p.y) < 0.05) return true;
      }
    }
    return false;
  };

  const quickChips = ["Wood", "Stone", "Metal", "Sulfur", "Scrap", "Rifle", "Ammo", "Keycard"];

  // Filter and sort machines based on filters, search input, active tab, and sorting criteria
  const filteredResults = useMemo(() => {
    const term = search.toLowerCase().trim();
    
    // 1. First map and filter individual vending machines & orders
    const mapped = vendingMachines.map(vm => {
      const isNpc = isNpcShop(vm.label || '', vm.x, vm.y);
      const grid = vm.raw ? getGridCoordinate(vm.raw.x, vm.raw.y, mapSize) : '?';
      
      // Calculate distance to self
      let distanceKm: number | null = null;
      let distanceGrids: number | null = null;
      if (selfMember && selfMember.rawX !== undefined && selfMember.rawY !== undefined && vm.raw?.x !== undefined && vm.raw?.y !== undefined) {
        const dx = vm.raw.x - selfMember.rawX;
        const dy = vm.raw.y - selfMember.rawY;
        const distUnits = Math.hypot(dx, dy);
        distanceKm = distUnits / 1000;
        distanceGrids = distUnits / 146.25;
      }

      // Filter by Shop Type (NPC vs Player)
      if (shopType === 'player' && isNpc) return null;
      if (shopType === 'npc' && !isNpc) return null;

      // Filter individual orders by search term and stock
      const filteredOrders = vm.raw.sell_orders.filter((order: any) => {
        // Stock filter
        if (inStockOnly && order.amount_in_stock === 0) return false;

        const itemName = (order.item_name || 'Unknown').toLowerCase();
        const currencyName = (order.currency_name || 'Unknown').toLowerCase();
        
        if (!term) return true;

        if (activeTab === 'buy') {
          return itemName.includes(term);
        } else {
          return currencyName.includes(term);
        }
      });

      if (filteredOrders.length > 0) {
        return {
          id: vm.id,
          machineName: vm.label || 'Vending Machine',
          grid,
          orders: filteredOrders,
          x: vm.x,
          y: vm.y,
          isNpc,
          distanceKm,
          distanceGrids
        };
      }

      return null;
    }).filter(Boolean) as any[];

    // 2. Sort the list of vending machines
    return mapped.sort((a, b) => {
      if (sortBy === 'closest') {
        const distA = a.distanceKm ?? Infinity;
        const distB = b.distanceKm ?? Infinity;
        return distA - distB;
      }
      
      if (sortBy === 'cheapest') {
        // Find minimum cost of matching orders in each shop
        const minCostA = Math.min(...a.orders.map((o: any) => o.cost_per_item));
        const minCostB = Math.min(...b.orders.map((o: any) => o.cost_per_item));
        return minCostA - minCostB;
      }

      if (sortBy === 'stock') {
        // Find maximum stock of matching orders in each shop
        const maxStockA = Math.max(...a.orders.map((o: any) => o.amount_in_stock ?? 0));
        const maxStockB = Math.max(...b.orders.map((o: any) => o.amount_in_stock ?? 0));
        return maxStockB - maxStockA; // Highest stock first
      }

      return 0;
    });
  }, [search, activeTab, shopType, inStockOnly, sortBy, vendingMachines, mapSize, selfMember, monuments, mapImageWidth, mapImageHeight, oceanMargin]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage(chatInput.trim());
    setChatInput('');
  };

  const handleChipClick = (chip: string) => {
    if (search.toLowerCase() === chip.toLowerCase()) {
      setSearch(''); // Toggle off
    } else {
      setSearch(chip.toLowerCase());
    }
  };

  const handleShopClick = (id: string, x: number, y: number) => {
    // Zoom to monument/shop on the map
    const selectMarker = useMapStore.getState().selectMarker;
    useMapStore.getState().setViewport({
      x: -(x - 0.5) * 800 * 2,
      y: -(y - 0.5) * 800 * 2,
      zoom: 2.0
    });
    selectMarker(id);
  };

  return (
    <div className="vending-panel glass-panel">
      {/* ── Market Search Panel ── */}
      <div className="vending-search-container">
        <div className="vending-header">
          <div className="vending-view-tabs">
            <button className={`vending-view-tab ${view === 'market' ? 'active' : ''}`} onClick={() => setView('market')}>MARKET SEARCH</button>
            <button className={`vending-view-tab ${view === 'best' ? 'active' : ''}`} onClick={() => setView('best')}>BEST SHOPS</button>
          </div>

          {view === 'market' && (
          <div className="vending-search-bar-wrap">
            <input 
              type="text" 
              placeholder={activeTab === 'buy' ? "Search items to BUY (e.g. rifle, scrap...)" : "Search payment accepted (e.g. scrap, sulfur...)"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="vending-search-input"
            />
            {search && (
              <button className="clear-search-btn" onClick={() => setSearch('')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
          )}
        </div>

        {view === 'best' ? <BestShops /> : <>

        {/* Quick Chips */}
        <div className="vending-chips">
          {quickChips.map((chip) => {
            const isActive = search.toLowerCase() === chip.toLowerCase();
            return (
              <button
                key={chip}
                className={`vending-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleChipClick(chip)}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* Tab Buttons */}
        <div className="vending-tabs">
          <button 
            className={`vending-tab-btn buy-tab ${activeTab === 'buy' ? 'active' : ''}`}
            onClick={() => setActiveTab('buy')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, width: 12, height: 12 }}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            BUY ITEMS
          </button>
          <button 
            className={`vending-tab-btn sell-tab ${activeTab === 'sell' ? 'active' : ''}`}
            onClick={() => setActiveTab('sell')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, width: 12, height: 12 }}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            SELL ITEMS
          </button>
        </div>

        {/* Extra Filters and Sorting Controls */}
        <div className="vending-controls">
          <div className="vending-filter-group">
            <button 
              className={`vending-filter-btn ${shopType === 'all' ? 'active' : ''}`}
              onClick={() => setShopType('all')}
            >
              All Shops
            </button>
            <button 
              className={`vending-filter-btn ${shopType === 'player' ? 'active' : ''}`}
              onClick={() => setShopType('player')}
            >
              Player
            </button>
            <button 
              className={`vending-filter-btn ${shopType === 'npc' ? 'active' : ''}`}
              onClick={() => setShopType('npc')}
            >
              NPC
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="vending-toggle-wrap">
              <input 
                type="checkbox" 
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              In Stock Only
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ArrowUpDown size={12} className="text-dim" />
              <select 
                value={sortBy} 
                onChange={(e: any) => setSortBy(e.target.value)}
                className="vending-sort-select"
              >
                <option value="cheapest">Cheapest First</option>
                <option value="stock">Highest Stock</option>
                <option value="closest">Closest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="vending-results scrollable">
          <WaterWellVendor />
          {filteredResults.length === 0 ? (
            <div className="vending-empty">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <p>No listings found matching "{search}"</p>
            </div>
          ) : (
            filteredResults.map((vm, idx) => (
              <div key={idx} className={`vending-machine-card ${vm.isNpc ? 'npc-shop-card' : 'player-shop-card'}`}>
                <div className="vending-machine-card-header">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <h3 className="vending-machine-name" style={{ color: vm.isNpc ? '#3cc04c' : 'var(--color-text)' }}>
                      {vm.machineName}
                    </h3>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="vending-grid-badge">{vm.grid}</span>
                      {vm.distanceKm !== null && (
                        <span className="vending-distance-badge" title={`${vm.distanceGrids?.toFixed(1)} grids away`}>
                          <MapPin size={8} />
                          {vm.distanceKm < 1 ? `${(vm.distanceKm * 1000).toFixed(0)}m` : `${vm.distanceKm.toFixed(1)}km`}
                        </span>
                      )}
                      <span className="shop-owner-badge" style={{ fontSize: 9, opacity: 0.6 }}>
                        {vm.isNpc ? 'NPC Shop' : 'Player Shop'}
                      </span>
                    </div>
                  </div>
                  <button 
                    className="vending-show-map-btn" 
                    title="Locate on Map"
                    onClick={() => handleShopClick(vm.id, vm.x, vm.y)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    <Info size={14} />
                  </button>
                </div>
                
                <div className="vending-orders">
                  {vm.orders.map((o: any, i: number) => {
                    const isOutOfStock = o.amount_in_stock === 0;
                    const itemShortname = getItemShortname(o.item_id);
                    const currencyShortname = getItemShortname(o.currency_id);
                    const itemIcon = itemShortname ? `https://cdn.rusthelp.com/images/256/${itemShortname.replace(/\./g, '-')}.webp` : null;
                    const currencyIcon = currencyShortname ? `https://cdn.rusthelp.com/images/256/${currencyShortname.replace(/\./g, '-')}.webp` : null;

                    return (
                      <div key={i} className={`vending-order ${isOutOfStock ? 'out-of-stock' : ''}`}>
                        <div className="vending-order-layout">
                          <div className="vending-order-buy">
                            <span className="vending-qty">{o.quantity}x</span>
                            {itemIcon && (
                              <img 
                                src={itemIcon} 
                                alt={o.item_name}
                                className="vending-item-icon"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <span className="vending-item">{o.item_name || 'Unknown Item'}</span>
                          </div>
                          
                          <div className="vending-order-arrow">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                          </div>
                          
                          <div className="vending-order-cost">
                            <span className="vending-cost-val">{o.cost_per_item}x</span>
                            {currencyIcon && (
                              <img 
                                src={currencyIcon} 
                                alt={o.currency_name}
                                className="vending-item-icon"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <span className="vending-cost-cur">{o.currency_name || 'Scrap'}</span>
                          </div>
                        </div>
                        
                        <div className="vending-order-footer">
                          <span className={`stock-indicator ${isOutOfStock ? 'no-stock' : 'in-stock'}`}>
                            {isOutOfStock ? 'OUT OF STOCK' : `STOCK: ${o.amount_in_stock}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        </>}
      </div>

      {/* ── INTEGRATED TEAM CHAT BOX ── */}
      <div className="vending-chat-box">
        <div className="chat-box-header">
          <span className="chat-box-dot" />
          TEAM CHAT
        </div>
        
        <div className="chat-box-messages scrollable">
          {chatMessages.length === 0 ? (
            <div className="chat-box-empty">No messages yet.</div>
          ) : (
            chatMessages.map((msg) => {
              const isYou = msg.isYou ?? msg.sender === 'You';
              return (
                <div key={msg.id} className="chat-box-message-row">
                  {!msg.isSystem && <Avatar steamId={msg.steamId} name={msg.sender} size={20} />}
                  <span className="chat-box-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="chat-box-sender" style={{ color: isYou ? 'var(--color-success)' : '#e0a64a' }}>
                    {msg.sender}:
                  </span>
                  <span className="chat-box-text">{msg.text}</span>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleChatSubmit} className="chat-box-form">
          <input
            type="text"
            className="chat-box-input"
            placeholder="Broadcast trade coordinates or chat..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" className="chat-box-send-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
