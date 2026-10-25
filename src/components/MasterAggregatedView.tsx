import React, { useState } from 'react';
import { DORM_ROOMS, type MasterAggregatedItem } from '../types/orders';

interface MasterAggregatedViewProps {
  aggregatedItems: MasterAggregatedItem[];
  onToggleGroupPurchased: (normalizedKey: string, targetPurchasedState: boolean) => void;
}

type StoreFilter = 'all' | 'unpurchased' | 'purchased';

export const MasterAggregatedView: React.FC<MasterAggregatedViewProps> = ({
  aggregatedItems,
  onToggleGroupPurchased,
}) => {
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const unpurchasedCount = aggregatedItems.filter((item) => !item.allPurchased).length;
  const purchasedCount = aggregatedItems.filter((item) => item.allPurchased).length;
  const cleanSearch = searchQuery.trim().toLowerCase();

  const visibleItems = aggregatedItems.filter((item) => {
    if (storeFilter === 'unpurchased' && item.allPurchased) return false;
    if (storeFilter === 'purchased' && !item.allPurchased) return false;
    if (selectedRoom !== 'all') {
      const hasRoom = (item.requesters || []).some((r) => r.roomNumber === selectedRoom);
      if (!hasRoom) return false;
    }
    if (cleanSearch) {
      const matchesDisplay = item.displayName.toLowerCase().includes(cleanSearch);
      const matchesRequester = (item.requesters || []).some(
        (r) =>
          r.roommateName.toLowerCase().includes(cleanSearch) ||
          r.roomNumber.toLowerCase().includes(cleanSearch)
      );
      if (!matchesDisplay && !matchesRequester) return false;
    }
    return true;
  });

  const totalDistinctItems = aggregatedItems.length;
  const totalUnitsCount = aggregatedItems.reduce((sum, item) => sum + item.totalQuantity, 0);

  return (
    <section
      id="master-list"
      aria-label="مجموع الطلبات الكلي"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6"
    >
      <div className="pb-3.5 border-b border-slate-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              مجموع الطلبات الكلي
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-700 font-mono tabular-nums bg-slate-100 px-2.5 py-1 rounded-lg font-bold">
            <span>{totalDistinctItems} أصناف</span>
            <span aria-hidden="true">·</span>
            <span>إجمالي {totalUnitsCount} قطعة</span>
          </div>
        </div>

        {/* In-box filter always visible at the top of this section */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStoreFilter('all')}
              className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                storeFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              الكل ({aggregatedItems.length})
            </button>
            <button
              type="button"
              onClick={() => setStoreFilter('unpurchased')}
              className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                storeFilter === 'unpurchased'
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              لسه متجابش ({unpurchasedCount})
            </button>
            <button
              type="button"
              onClick={() => setStoreFilter('purchased')}
              className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                storeFilter === 'purchased'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              تم الشراء ({purchasedCount})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="فلترة حسب الأوضة في مجموع الطلبات الكلي"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="h-8 px-2.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
            >
              <option value="all">كل الأوض</option>
              {DORM_ROOMS.map((room) => (
                <option key={room} value={room}>
                  {room}
                </option>
              ))}
            </select>
            <input
              type="search"
              aria-label="بحث في مجموع الطلبات الكلي"
              placeholder="بحث بالصنف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-40 sm:w-48 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>
      </div>

      {aggregatedItems.length === 0 ? (
        <div className="py-8 text-center space-y-1">
          <p className="text-sm font-bold text-slate-800">لا توجد طلبات مسجلة حتى الآن</p>
          <p className="text-xs text-slate-500">
            أول ما الطلاب يبعتوا طلباتهم من نسخة الطلاب هتظهر هنا فوراً.
          </p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-xs text-slate-500">لا توجد أصناف في هذا التصنيف حالياً.</p>
          <button
            type="button"
            onClick={() => {
              setStoreFilter('all');
              setSelectedRoom('all');
              setSearchQuery('');
            }}
            className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            عرض كل الأصناف ({aggregatedItems.length})
          </button>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-slate-100">
          {visibleItems.map((group) => {
            const tiers =
              group.priceBreakdown && group.priceBreakdown.length > 0
                ? group.priceBreakdown
                : [{ unitPrice: group.unitPrice, quantity: group.totalQuantity, subtotal: group.totalCost }];

            return (
              <div
                key={group.normalizedKey}
                className={`py-3.5 transition-opacity ${
                  group.allPurchased ? 'opacity-55' : 'opacity-100'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-lg font-extrabold font-mono tabular-nums text-amber-800">
                        {group.totalQuantity} ×
                      </span>
                      <h3
                        className={`text-base sm:text-lg font-bold text-slate-900 ${
                          group.allPurchased ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {group.displayName}
                      </h3>
                    </div>

                    {/* Price & Count Breakdown per Price Tier (سعر الواحدة / الكيس والعدد) */}
                    <div className="flex flex-wrap items-center gap-2">
                      {tiers.map((tier) => (
                        <span
                          key={tier.unitPrice}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50/90 border border-amber-200 text-xs sm:text-sm font-bold text-slate-900"
                        >
                          <span>
                            سعر{' '}
                            <strong className="font-mono tabular-nums text-amber-900">
                              {tier.unitPrice} ج.م
                            </strong>
                          </span>
                          <span className="text-amber-400" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            العدد:{' '}
                            <strong className="font-mono tabular-nums text-amber-900">
                              {tier.quantity}
                            </strong>
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onToggleGroupPurchased(group.normalizedKey, !group.allPurchased)
                      }
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        group.allPurchased
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                      }`}
                    >
                      {group.allPurchased ? 'تم الشراء' : 'تحديد كـ تم الشراء'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
