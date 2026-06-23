import { useMapStore, type ToastMessage } from '../../stores/map-store';
import { useUiStore } from '../../stores/ui-store';
import { getGridCoordinate } from '../../utils/grid';
import './ToastStack.css';

/**
 * How many toasts render at once. The rest silently don't render — full
 * history lives in the Notifications tab, so on-screen toasts stay ephemeral.
 */
const MAX_VISIBLE = 3;

/**
 * Minimal, non-blocking toast stack anchored to the TOP-right corner, clear of
 * map content. Each toast is a slim dark-glass
 * pill (small title + one short line) with a thin type-colored left accent.
 * Shop toasts keep a click-to-jump affordance. These are lightweight, ephemeral
 * confirmations only — detail lives in the Notifications tab / on the map.
 */
export function ToastStack() {
  const toasts = useMapStore((s) => s.toasts);
  const removeToast = useMapStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  // Newest first, capped — anything beyond the cap just doesn't render.
  const visible = [...toasts].reverse().slice(0, MAX_VISIBLE);

  const jumpToShop = (t: ToastMessage) => {
    if (!t.shopName) return;
    const mapSize = useMapStore.getState().mapSize;
    // Many shops share a name ("A Shop"), so disambiguate by grid: prefer a
    // marker whose computed grid matches the toast's grid, else name-only.
    const candidates = useMapStore.getState().markers.filter(
      (m) => m.type === 'vending_machine' && m.label === t.shopName,
    );
    const marker = (t.grid
      ? candidates.find((m) => getGridCoordinate(m.raw?.x ?? 0, m.raw?.y ?? 0, mapSize) === t.grid)
      : null) || candidates[0];
    if (marker) {
      useMapStore.setState({
        selectedMarkerId: marker.id,
        viewport: {
          x: -(marker.x * 800 - 400) * 2.5,
          y: -(marker.y * 800 - 400) * 2.5,
          zoom: 2.5,
        },
      });
      useUiStore.getState().setActivePage('map');
    }
  };

  const handleToastClick = (t: ToastMessage) => {
    if (!t.shopName) return;
    jumpToShop(t);
    removeToast(t.id);
  };

  return (
    <div className="ts-stack" role="region" aria-label="Notifications">
      {toasts.length > 1 && (
        <button
          className="ts-clear-all"
          onClick={() => toasts.forEach((t) => removeToast(t.id))}
        >
          Clear all
        </button>
      )}

      {visible.map((t) => {
        const clickable = !!t.shopName;
        return (
          <div
            key={t.id}
            className={`ts-pill ts-pill--${t.type}${clickable ? ' ts-pill--clickable' : ''}`}
            onClick={() => handleToastClick(t)}
          >
            <div className="ts-pill__text">
              <span className="ts-pill__title">{t.title}</span>
              <span className="ts-pill__message">{t.message}</span>
            </div>

            {t.grid && <span className="ts-pill__grid">{t.grid}</span>}
            {clickable && <span className="ts-pill__jump" aria-hidden="true">&rarr;</span>}

            <button
              className="ts-pill__close"
              aria-label="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
