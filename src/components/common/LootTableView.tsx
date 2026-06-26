import { LootTable, lootIconUrl } from '../../utils/loot';
import './LootTableView.css';

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'neutral';

/** Parses the leading number out of a chance string ("16.7%", "0.4% ea") and
 *  maps it to a rarity tier. Defaults to a neutral tier when unparseable. */
function rarityFor(chance: string): { tier: Rarity; pct: number } {
  const pct = parseFloat(chance);
  if (Number.isNaN(pct)) return { tier: 'neutral', pct: 0 };
  if (pct >= 50) return { tier: 'common', pct };
  if (pct >= 20) return { tier: 'uncommon', pct };
  if (pct >= 5) return { tier: 'rare', pct };
  if (pct >= 1) return { tier: 'epic', pct };
  return { tier: 'legendary', pct };
}

/** A reusable, modern loot-table renderer shared across every loot popup.
 *  Built to stay clean and readable in tight popups (~300px) and wide panels:
 *  fixed icon, a name cell that truncates with an ellipsis, an amount chip and
 *  a right-aligned chance badge of consistent width. The optional chance bar is
 *  painted as a subtle background fill so it never collides with the text. */
export function LootTableView({ table, className }: { table: LootTable; className?: string }) {
  const count = table.entries.length;
  return (
    <div className={`ltv${className ? ' ' + className : ''}`}>
      <div className="ltv-head">
        <div className="ltv-head__top">
          <h3 className="ltv-title" title={table.name}>{table.name}</h3>
          <span className="ltv-count">{count} item{count === 1 ? '' : 's'}</span>
        </div>
        {table.note && <div className="ltv-note">{table.note}</div>}
      </div>

      <div className="ltv-list scrollable">
        {table.entries.map((e, i) => {
          const icon = lootIconUrl(e.item);
          const { tier, pct } = rarityFor(e.chance);
          const barWidth = Math.max(0, Math.min(100, pct));
          return (
            <div key={i} className="ltv-row" data-rarity={tier}>
              <span
                className="ltv-row__bar"
                style={{ width: `${barWidth}%` }}
                aria-hidden="true"
              />
              <span className="ltv-row__icon" aria-hidden="true">
                {icon ? (
                  <img
                    src={icon}
                    alt=""
                    width={22}
                    height={22}
                    loading="lazy"
                    onError={(ev) => {
                      const img = ev.currentTarget as HTMLImageElement;
                      img.style.display = 'none';
                      const ph = img.nextElementSibling as HTMLElement | null;
                      if (ph) ph.style.display = 'block';
                    }}
                  />
                ) : null}
                <span className="ltv-row__ph" style={icon ? { display: 'none' } : undefined} />
              </span>
              <span className="ltv-row__name" title={e.item}>{e.item}</span>
              {e.amount ? <span className="ltv-row__amount">{e.amount}</span> : null}
              <span className="ltv-row__chance" data-rarity={tier}>{e.chance}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
