import { useState, useMemo } from 'react';
import { useMapStore } from '@/stores/map-store';
import { useTeamStore } from '@/stores/team-store';
import { getItemIconUrl } from '@/utils/items';
import { getGridCoordinate } from '@/utils/grid';
import { Search, X } from 'lucide-react';

export default function VendingShopDetailPanel() {
  const selectedMarkerId = useMapStore((s) => s.selectedMarkerId);
  const selectMarker = useMapStore((s) => s.selectMarker);
  const markers = useMapStore((s) => s.markers);
  const mapSize = useMapStore((s) => s.mapSize);
  const members = useTeamStore((s) => s.members);
  
  const [search, setSearch] = useState('');

  const marker = useMemo(() => {
    if (!selectedMarkerId) return null;
    return markers.find((m) => m.id === selectedMarkerId && m.type === 'vending_machine');
  }, [selectedMarkerId, markers]);

  const selfPlayer = useMemo(() => {
    return members.find((m) => m.isSelf);
  }, [members]);

  const distanceStr = useMemo(() => {
    if (!selfPlayer || !marker) return '';
    if (
      selfPlayer.rawX !== undefined &&
      selfPlayer.rawY !== undefined &&
      marker.raw?.x !== undefined &&
      marker.raw?.y !== undefined
    ) {
      const dx = marker.raw.x - selfPlayer.rawX;
      const dy = marker.raw.y - selfPlayer.rawY;
      const dist = Math.hypot(dx, dy);
      return dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    } else if (selfPlayer.x !== undefined && selfPlayer.y !== undefined) {
      const dx = (marker.x - selfPlayer.x) * mapSize;
      const dy = (marker.y - selfPlayer.y) * mapSize;
      const dist = Math.hypot(dx, dy);
      return dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    }
    return '';
  }, [selfPlayer, marker, mapSize]);

  const sortedAndFilteredOrders = useMemo(() => {
    if (!marker || !marker.raw?.sell_orders) return [];
    
    let orders = [...marker.raw.sell_orders];

    // Filter by search query
    if (search.trim() !== '') {
      const q = search.toLowerCase().trim();
      orders = orders.filter((o) => {
        const itemName = (o.item_name || '').toLowerCase();
        const currencyName = (o.currency_name || '').toLowerCase();
        return itemName.includes(q) || currencyName.includes(q);
      });
    }

    // Sort: in-stock first, out of stock last
    return orders.sort((a, b) => {
      const aOut = (a.amount_in_stock ?? 0) === 0 ? 1 : 0;
      const bOut = (b.amount_in_stock ?? 0) === 0 ? 1 : 0;
      return aOut - bOut;
    });
  }, [marker, search]);

  if (!marker) return null;

  const gridCoord = marker.raw ? getGridCoordinate(marker.raw.x, marker.raw.y, mapSize) : '?';
  const color = marker.color || '#10b981';

  return (
    <div 
      className="vending-shop-detail-panel"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Corner Brackets for Tactical Aesthetic */}
      <div className="panel-corner panel-corner--tl" />
      <div className="panel-corner panel-corner--tr" />
      <div className="panel-corner panel-corner--bl" />
      <div className="panel-corner panel-corner--br" />

      {/* Header */}
      <div className="vending-shop-detail-panel__header">
        <div className="vending-shop-detail-panel__title-row">
          <h2 className="vending-shop-detail-panel__title" style={{ color }}>
            {marker.label || 'VENDING MACHINE'}
          </h2>
          <button
            onClick={() => selectMarker(null)}
            className="vending-shop-detail-panel__close"
            title="Close Panel"
          >
            <X size={14} />
          </button>
        </div>

        <div className="vending-shop-detail-panel__meta-row">
          <div className="vending-shop-detail-panel__meta-chip">
            <span className="meta-chip-label">GRID:</span>
            <span className="meta-chip-value" style={{ color }}>{gridCoord}</span>
          </div>

          {distanceStr && (
            <div className="vending-shop-detail-panel__meta-chip">
              <span className="meta-chip-label">RANGE:</span>
              <span className="meta-chip-value text-white">{distanceStr}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search Filter Box */}
      <div className="vending-shop-detail-panel__search-container">
        <div className="vending-shop-detail-panel__search-wrapper">
          <Search className="search-icon" size={13} />
          <input
            type="text"
            className="vending-shop-detail-panel__search"
            placeholder="Search items on sale..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="search-clear-btn"
              title="Clear Search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Orders List */}
      <div className="vending-shop-detail-panel__orders-list scrollable">
        {sortedAndFilteredOrders.map((o: any, idx: number) => {
          const itemIcon = getItemIconUrl(o.item_id);
          const currencyIcon = getItemIconUrl(o.currency_id);
          const stock = o.amount_in_stock ?? 0;
          const isOutOfStock = stock === 0;
          const isLowStock = !isOutOfStock && stock <= 3;

          let stockBadgeClass = "vending-shop-detail-panel__stock-badge";
          if (isOutOfStock) stockBadgeClass += " vending-shop-detail-panel__stock-badge--sold-out";
          else if (isLowStock) stockBadgeClass += " vending-shop-detail-panel__stock-badge--low-stock";
          else stockBadgeClass += " vending-shop-detail-panel__stock-badge--in-stock";

          return (
            <div
              key={idx}
              className={`vending-shop-detail-panel__order-row ${
                isOutOfStock ? 'vending-shop-detail-panel__order-row--out-of-stock' : ''
              }`}
            >
              {/* Item Info */}
              <div className="vending-shop-detail-panel__item-info">
                {itemIcon && (
                  <img
                    src={itemIcon}
                    alt={o.item_name}
                    className="vending-shop-detail-panel__item-icon"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="vending-shop-detail-panel__item-details">
                  <span className="vending-shop-detail-panel__item-qty">{o.quantity}x</span>
                  <span className="vending-shop-detail-panel__item-name" title={o.item_name}>
                    {o.item_name || 'Item'}
                  </span>
                </div>
              </div>

              {/* Chevron Arrow */}
              <span className="vending-shop-detail-panel__arrow">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="vending-shop-detail-panel__arrow-svg"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>

              {/* Currency Info */}
              <div className="vending-shop-detail-panel__currency-info">
                {currencyIcon && (
                  <img
                    src={currencyIcon}
                    alt={o.currency_name}
                    className="vending-shop-detail-panel__currency-icon"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="vending-shop-detail-panel__currency-details">
                  <span className="vending-shop-detail-panel__currency-cost">
                    {o.cost_per_item}x
                  </span>
                  <span className="vending-shop-detail-panel__currency-name" title={o.currency_name}>
                    {o.currency_name || 'Scrap'}
                  </span>
                </div>
              </div>

              {/* Stock Badge */}
              <span className={stockBadgeClass}>
                {isOutOfStock ? 'SOLD OUT' : `${stock} left`}
              </span>
            </div>
          );
        })}

        {sortedAndFilteredOrders.length === 0 && (
          <div className="vending-shop-detail-panel__no-orders">
            {search.trim() !== '' ? 'No matching items found' : 'No items on sale'}
          </div>
        )}
      </div>
    </div>
  );
}
