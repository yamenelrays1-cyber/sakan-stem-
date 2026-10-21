import React, { useState } from 'react';
import type { SessionFinancialSummary } from '../types/orders';
import type { User } from '../lib/firebase';

interface SessionToolbarProps {
  financials: SessionFinancialSummary;
  currentUser: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onClearAllOrders: () => void;
  onCopyMasterSummary: () => void;
  copiedSummaryRecently: boolean;
  isOrdersLocked: boolean;
  onToggleOrdersLock: () => void;
}

export const SessionToolbar: React.FC<SessionToolbarProps> = ({
  financials,
  onClearAllOrders,
  onCopyMasterSummary,
  copiedSummaryRecently,
  isOrdersLocked,
  onToggleOrdersLock,
}) => {
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <section
      aria-label="ملخص حساب الأوردر للمشرف"
      className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 sm:py-5"
    >
      <div className="max-w-5xl mx-auto space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900">
                نسخة المشرف — الطلبات والحساب
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                  isOrdersLocked
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {isOrdersLocked ? 'الطلبات مقفولة' : 'الطلبات مفتوحة'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onToggleOrdersLock}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isOrdersLocked
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {isOrdersLocked ? 'فتح الطلبات للطلاب' : 'قفل الطلبات'}
            </button>

            <button
              type="button"
              onClick={onCopyMasterSummary}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedSummaryRecently
                ? 'تم نسخ القائمة'
                : 'نسخ الطلبات والاسم والباقي'}
            </button>

            {!confirmingClear ? (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                مسح الكل
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
                <span className="text-xs font-bold text-rose-900 whitespace-nowrap">
                  تأكيد المسح؟
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllOrders();
                    setConfirmingClear(false);
                  }}
                  className="min-h-[30px] px-2.5 py-1 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  نعم، مسح الكل
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="min-h-[30px] px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4-Column Financial Summary Strip for the Master */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 pt-2 border-t border-slate-100">
          <div className="p-2.5 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] sm:text-xs text-slate-500">إجمالي المطلوب كله</div>
            <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {financials.grandTotal} <span className="text-xs font-normal text-slate-500">ج.م</span>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] sm:text-xs text-slate-500">الكاش المستلم فعلياً</div>
            <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {financials.totalCashCollected} <span className="text-xs font-normal text-slate-500">ج.م</span>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] sm:text-xs text-slate-500">مطلوب تحصيله (لسه مدفعوش)</div>
            <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-rose-700 mt-0.5">
              {financials.cashShortfall} <span className="text-xs font-normal text-slate-500">ج.م</span>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
            <div className="text-[11px] sm:text-xs text-amber-900 font-medium">إجمالي الباقي للطلاب</div>
            <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-amber-900 mt-0.5">
              {financials.totalChangeToReturn} <span className="text-xs font-normal text-amber-700">ج.م</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
