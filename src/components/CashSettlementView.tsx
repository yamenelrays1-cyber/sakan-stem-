import React, { useState } from 'react';
import { DORM_ROOMS, type RoommateFinancialSummary } from '../types/orders';

interface CashSettlementViewProps {
  roommateSummaries: RoommateFinancialSummary[];
  onSettleRoommateChange: (summary: RoommateFinancialSummary) => void;
  onDeleteOrder: (orderId: string) => void;
}

type PaymentTab = 'all' | 'unpaid' | 'paid' | 'cash' | 'vodafone_cash';

export const CashSettlementView: React.FC<CashSettlementViewProps> = ({
  roommateSummaries,
  onSettleRoommateChange,
  onDeleteOrder,
}) => {
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('all');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const unpaidCount = roommateSummaries.filter((s) => !s.isFullyPaid).length;
  const paidCount = roommateSummaries.filter((s) => s.isFullyPaid).length;
  const cashCount = roommateSummaries.filter((s) => s.paymentMethod === 'cash').length;
  const vodafoneCount = roommateSummaries.filter((s) => s.paymentMethod !== 'cash').length;
  const cleanSearch = searchQuery.trim().toLowerCase();

  const visibleSummaries = roommateSummaries.filter((s) => {
    if (selectedRoom !== 'all' && s.roomNumber !== selectedRoom) return false;
    if (paymentTab === 'unpaid' && s.isFullyPaid) return false;
    if (paymentTab === 'paid' && !s.isFullyPaid) return false;
    if (paymentTab === 'cash' && s.paymentMethod !== 'cash') return false;
    if (paymentTab === 'vodafone_cash' && s.paymentMethod === 'cash') return false;
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
      id="cash-settlement"
      aria-label="الاسم والأوض والطلبات والباقي"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6"
    >
      <div className="pb-3.5 border-b border-slate-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              الاسم والأوض والطلبات والباقي
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              كل طالب طلب إيه، في أنهي أوضة، دفع كام، والباقي ليه كام مع زرار خالص لتسوية الباقي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="فلترة حسب الأوضة في جدول الحساب"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="h-8 px-2.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
            >
              <option value="all">كل الأوض ({roommateSummaries.length})</option>
              {DORM_ROOMS.map((room) => {
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
              aria-label="بحث في جدول الحساب"
              placeholder="بحث بالاسم أو الطلب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-40 sm:w-48 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* In-box filter ALWAYS visible at the top of this section */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setPaymentTab('all')}
            className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              paymentTab === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            الكل ({roommateSummaries.length})
          </button>
          <button
            type="button"
            onClick={() => setPaymentTab('unpaid')}
            className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              paymentTab === 'unpaid'
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            لسه مدفعش ({unpaidCount})
          </button>
          <button
            type="button"
            onClick={() => setPaymentTab('paid')}
            className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              paymentTab === 'paid'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            خالص ({paidCount})
          </button>
          <button
            type="button"
            onClick={() => setPaymentTab('cash')}
            className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              paymentTab === 'cash'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            كاش ({cashCount})
          </button>
          <button
            type="button"
            onClick={() => setPaymentTab('vodafone_cash')}
            className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              paymentTab === 'vodafone_cash'
                ? 'bg-rose-700 text-white border-rose-700'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            فودافون كاش ({vodafoneCount})
          </button>
        </div>
      </div>

      {roommateSummaries.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          لسه مفيش طلبات متسجلة.
        </div>
      ) : visibleSummaries.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-xs text-slate-500">لا توجد طلبات مطابقة لهذا التصنيف حالياً.</p>
          <button
            type="button"
            onClick={() => {
              setPaymentTab('all');
              setSelectedRoom('all');
              setSearchQuery('');
            }}
            className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            عرض الكل ({roommateSummaries.length})
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Stacked List (Zero horizontal scroll on 390px phones) */}
          <div className="mt-2 divide-y divide-slate-100 md:hidden">
            {visibleSummaries.map((summary) => {
              const isVodafoneCash = summary.paymentMethod !== 'cash';
              return (
                <div
                  key={`mob_${summary.roommateName}_${summary.roomNumber}`}
                  className="py-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-extrabold text-slate-900">{summary.roommateName}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {summary.roomNumber}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                      المطلوب: {summary.totalRequired} ج.م
                    </span>
                  </div>

                  {/* Student's Ordered Items (الطلبات) clearly highlighted */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-bold text-slate-700 ml-1">الطلبات:</span>
                    {summary.items.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-semibold text-slate-900"
                      >
                        <strong className="font-mono tabular-nums text-amber-800">
                          {item.quantity} ×
                        </strong>
                        <span>{item.itemName}</span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          ({item.quantity * item.unitPrice} ج.م)
                        </span>
                      </span>
                    ))}
                  </div>

                  <div className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1">
                    {summary.isFullyPaid ? (
                      <span className="font-bold text-emerald-700">
                        تم الدفع للمشرف (خالص)
                      </span>
                    ) : isVodafoneCash ? (
                      <span className="font-bold text-rose-700">
                        فودافون كاش — لسه محولش ({summary.totalRequired} ج.م)
                      </span>
                    ) : (
                      <span className="font-bold text-amber-800">
                        دفع كاش — لسه مدفعش ·{' '}
                        {summary.changeDue > 0
                          ? `محضر ${summary.cashPaidAmount} ج.م والباقي ليه: ${summary.changeDue} ج.م`
                          : `مطلوب منه: ${summary.totalRequired} ج.م`}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {!summary.isFullyPaid ? (
                      <button
                        type="button"
                        onClick={() => onSettleRoommateChange(summary)}
                        className="flex-1 min-h-[40px] px-3 py-2 text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {summary.changeDue > 0
                          ? `استلمت الكاش واديته الباقي (${summary.changeDue} ج.م)`
                          : 'استلمت الفلوس (خالص)'}
                      </button>
                    ) : (
                      <span className="flex-1 py-2 text-xs font-bold text-emerald-700">
                        خالص
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        for (const item of summary.items) {
                          onDeleteOrder(item.id);
                        }
                      }}
                      className="min-h-[40px] px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block mt-4 overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-600">
                  <th className="py-3 pl-3">الاسم</th>
                  <th className="py-3 px-3">الأوضة</th>
                  <th className="py-3 px-3">الطلبات</th>
                  <th className="py-3 px-3">المطلوب</th>
                  <th className="py-3 px-3">طريقة الدفع والحالة</th>
                  <th className="py-3 px-3">المطلوب / الباقي</th>
                  <th className="py-3 pr-3 text-left">تسوية / حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleSummaries.map((summary) => {
                  const isVodafoneCash = summary.paymentMethod !== 'cash';

                  return (
                    <tr
                      key={`${summary.roommateName}_${summary.roomNumber}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 pl-3 align-top font-bold text-slate-900 whitespace-nowrap">
                        {summary.roommateName}
                      </td>

                      <td className="py-3.5 px-3 align-top text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {summary.roomNumber}
                      </td>

                      <td className="py-3.5 px-3 align-top">
                        <div className="flex flex-wrap gap-1.5 text-xs text-slate-900">
                          {summary.items.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-50 border border-slate-200 font-semibold whitespace-nowrap"
                            >
                              <strong className="font-mono tabular-nums text-amber-800">
                                {item.quantity} ×
                              </strong>
                              <span>{item.itemName}</span>
                              <span className="text-slate-400 font-mono tabular-nums">
                                ({item.quantity * item.unitPrice} ج.م)
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 align-top font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {summary.totalRequired} ج.م
                      </td>

                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        {isVodafoneCash ? (
                          summary.isFullyPaid ? (
                            <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                              فودافون كاش — تم التحويل ({summary.totalRequired} ج.م)
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-rose-700 whitespace-nowrap">
                              فودافون كاش — لسه محولش
                            </span>
                          )
                        ) : summary.isFullyPaid ? (
                          <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                            كاش — تم الاستلام ({summary.totalRequired} ج.م)
                          </span>
                        ) : (
                          <div className="text-xs whitespace-nowrap">
                            <span className="font-bold text-amber-800">دفع كاش — لسه مدفعش</span>
                            {summary.cashPaidAmount > summary.totalRequired && (
                              <span className="text-slate-500 font-mono tabular-nums">
                                {' '}
                                (محضر {summary.cashPaidAmount} ج.م)
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 align-top text-xs whitespace-nowrap">
                        {summary.isFullyPaid ? (
                          <span className="font-bold text-emerald-700">تم الدفع (خالص)</span>
                        ) : isVodafoneCash ? (
                          <span className="font-bold text-amber-800 font-mono tabular-nums">
                            لسه محولش ({summary.totalRequired} ج.م)
                          </span>
                        ) : summary.changeDue > 0 ? (
                          <span className="font-bold text-amber-800 font-mono tabular-nums">
                            لسه مدفعش · الباقي ليه لما يدفع: {summary.changeDue} ج.م
                          </span>
                        ) : (
                          <span className="font-bold text-amber-800 font-mono tabular-nums">
                            لسه مدفعش · مطلوب منه: {summary.totalRequired} ج.م
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 pr-3 align-top text-left whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!summary.isFullyPaid ? (
                            <button
                              type="button"
                              onClick={() => onSettleRoommateChange(summary)}
                              className="min-h-[34px] px-3 py-1 text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {summary.changeDue > 0
                                ? `استلمت الكاش واديته الباقي (${summary.changeDue} ج.م)`
                                : 'استلمت الفلوس (خالص)'}
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 text-xs font-bold text-emerald-700">
                              خالص
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              for (const item of summary.items) {
                                onDeleteOrder(item.id);
                              }
                            }}
                            className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
