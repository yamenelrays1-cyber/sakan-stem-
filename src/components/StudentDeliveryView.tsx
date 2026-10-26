import React, { useState } from 'react';
import { type RoommateFinancialSummary } from '../types/orders';

interface StudentDeliveryViewProps {
  roommateSummaries: RoommateFinancialSummary[];
  onToggleRoommateDelivered: (
    summary: RoommateFinancialSummary,
    targetDeliveredState: boolean
  ) => void;
}

type DeliveryTab = 'all' | 'undelivered' | 'delivered';

export const StudentDeliveryView: React.FC<StudentDeliveryViewProps> = ({
  roommateSummaries,
  onToggleRoommateDelivered,
}) => {
  const [deliveryTab, setDeliveryTab] = useState<DeliveryTab>('all');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeRooms = Array.from(
    new Set(roommateSummaries.map((s) => s.roomNumber).filter(Boolean))
  );

  const totalStudents = roommateSummaries.length;
  const deliveredStudentsCount = roommateSummaries.filter((s) => s.isDelivered).length;
  const undeliveredStudentsCount = totalStudents - deliveredStudentsCount;
  const cleanSearch = searchQuery.trim().toLowerCase();

  const visibleSummaries = roommateSummaries.filter((s) => {
    if (selectedRoom !== 'all' && s.roomNumber !== selectedRoom) return false;
    if (deliveryTab === 'undelivered' && s.isDelivered) return false;
    if (deliveryTab === 'delivered' && !s.isDelivered) return false;
    if (cleanSearch) {
      const nameMatch = s.roommateName.toLowerCase().includes(cleanSearch);
      const roomMatch = s.roomNumber.toLowerCase().includes(cleanSearch);
      const itemMatch = s.items.some((item) =>
        item.itemName.toLowerCase().includes(cleanSearch)
      );
      if (!nameMatch && !roomMatch && !itemMatch) return false;
    }
    return true;
  });

  return (
    <section
      id="student-delivery-handover"
      aria-label="تسليم الطلبات للطلاب"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6"
    >
      <div className="pb-3.5 border-b border-slate-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              تسليم الطلبات للطلاب
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="فلترة حسب الأوضة في تسليم الطلبات"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="h-8 px-2.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
            >
              <option value="all">كل الأوض ({totalStudents})</option>
              {activeRooms.map((room) => {
                const count = roommateSummaries.filter((s) => s.roomNumber === room).length;
                return (
                  <option key={room} value={room}>
                    {room} ({count})
                  </option>
                );
              })}
            </select>
            <input
              type="search"
              aria-label="بحث في تسليم الطلبات للطلاب"
              placeholder="بحث بالاسم أو الطلب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-40 sm:w-48 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex items-center gap-2 text-xs font-bold font-mono tabular-nums px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-800">
              <span>
                استلموا: {deliveredStudentsCount} من {totalStudents}
              </span>
            </div>
          </div>
        </div>

        {/* In-box filter always visible at the top of this section */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setDeliveryTab('all')}
            className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              deliveryTab === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            الكل ({totalStudents})
          </button>
          <button
            type="button"
            onClick={() => setDeliveryTab('undelivered')}
            className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              deliveryTab === 'undelivered'
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            لسه مستلمش ({undeliveredStudentsCount})
          </button>
          <button
            type="button"
            onClick={() => setDeliveryTab('delivered')}
            className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              deliveryTab === 'delivered'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            استلم حاجته ({deliveredStudentsCount})
          </button>
        </div>
      </div>

      {roommateSummaries.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          لسه مفيش طلبات متسجلة لتسليمها.
        </div>
      ) : visibleSummaries.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-xs text-slate-500">لا يوجد طلاب في هذا التصنيف حالياً.</p>
          <button
            type="button"
            onClick={() => {
              setDeliveryTab('all');
              setSelectedRoom('all');
              setSearchQuery('');
            }}
            className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            عرض الكل ({totalStudents})
          </button>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-slate-100">
          {visibleSummaries.map((summary) => {
            const groupedItemsMap = new Map<
              string,
              { key: string; itemName: string; quantity: number; unitPrice: number }
            >();
            for (const item of summary.items) {
              const cleanPrice = Math.round(item.unitPrice * 100) / 100;
              const groupKey = `${item.normalizedItemKey || item.itemName.trim()}__${cleanPrice}`;
              const existing = groupedItemsMap.get(groupKey);
              if (existing) {
                existing.quantity += item.quantity;
              } else {
                groupedItemsMap.set(groupKey, {
                  key: groupKey,
                  itemName: item.itemName,
                  quantity: item.quantity,
                  unitPrice: cleanPrice,
                });
              }
            }
            const groupedItems = Array.from(groupedItemsMap.values());

            return (
              <div
                key={`delivery_${summary.roommateName}_${summary.roomNumber}`}
                className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-opacity ${
                  summary.isDelivered ? 'opacity-65' : 'opacity-100'
                }`}
              >
                {/* Right Side: Student Name, Room & Items to Hand Over */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-base font-extrabold text-slate-900 ${
                        summary.isDelivered ? 'line-through text-slate-400' : ''
                      }`}
                    >
                      {summary.roommateName}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                      {summary.roomNumber}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-lg ${
                        summary.isDelivered
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {summary.isDelivered ? 'استلم حاجته ✅' : 'لسه مستلمش 📦'}
                    </span>
                  </div>

                  {/* Student's Items List */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-bold text-slate-600 ml-1">حاجاته:</span>
                    {groupedItems.map((item) => (
                      <span
                        key={item.key}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold ${
                          summary.isDelivered
                            ? 'bg-slate-50 border-slate-200 text-slate-500 line-through'
                            : 'bg-slate-50 border-slate-200/90 text-slate-900'
                        }`}
                      >
                        <strong className="font-mono tabular-nums text-amber-800">
                          {item.quantity} ×
                        </strong>
                        <span>{item.itemName}</span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          (سعر {item.unitPrice} ج.م)
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Left Side: Handover Toggle Button */}
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onToggleRoommateDelivered(summary, !summary.isDelivered)
                    }
                    className={`w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                      summary.isDelivered
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {summary.isDelivered
                      ? 'استلم حاجته ✅ (اضغط للتراجع)'
                      : 'تحديد كـ استلم حاجته'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
