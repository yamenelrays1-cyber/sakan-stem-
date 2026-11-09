import React, { useState, useEffect } from 'react';
import type { SessionFinancialSummary } from '../types/orders';
import { toEnglishDigits } from '../utils/emailOtpService';

interface SessionToolbarProps {
  financials: SessionFinancialSummary;
  onClearAllOrders: () => void;
  onCopyMasterSummary: () => void;
  copiedSummaryRecently: boolean;
  isOrdersLocked: boolean;
  onToggleOrdersLock: () => void;
  isDeliveryEnabled: boolean;
  deliveryFee: number;
  onUpdateDeliverySettings: (enabled: boolean, fee: number) => void;
  isSyrianMenuEnabled?: boolean;
  onToggleSyrianMenu?: () => void;
}

export const SessionToolbar: React.FC<SessionToolbarProps> = ({
  financials,
  onClearAllOrders,
  onCopyMasterSummary,
  copiedSummaryRecently,
  isOrdersLocked,
  onToggleOrdersLock,
  isDeliveryEnabled,
  deliveryFee,
  onUpdateDeliverySettings,
  isSyrianMenuEnabled = false,
  onToggleSyrianMenu,
}) => {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [feeInput, setFeeInput] = useState<string>(String(deliveryFee || 5));

  useEffect(() => {
    setFeeInput(String(deliveryFee));
  }, [deliveryFee]);

  const handleToggleDelivery = () => {
    const nextEnabled = !isDeliveryEnabled;
    const parsed = Number(toEnglishDigits(feeInput));
    const validFee =
      Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : deliveryFee > 0 ? deliveryFee : 5;
    setFeeInput(String(validFee));
    onUpdateDeliverySettings(nextEnabled, validFee);
  };

  const handleFeeInputChange = (val: string) => {
    const eng = toEnglishDigits(val).replace(/[^0-9.]/g, '');
    setFeeInput(eng);
    const parsed = Number(eng);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onUpdateDeliverySettings(isDeliveryEnabled, Math.round(parsed * 100) / 100);
    }
  };

  return (
    <section
      aria-label="ملخص حساب الأوردر للمشرف"
      className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 sm:py-5"
    >
      <div className="max-w-5xl mx-auto space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900">
              نسخة المشرف — الطلبات والحساب
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* الطلبات: ينور أخضر لما مفتوح، وأحمر لما مقفول */}
            <button
              type="button"
              onClick={onToggleOrdersLock}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-2 border ${
                !isOrdersLocked
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-xs'
                  : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-xs'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  !isOrdersLocked ? 'bg-white animate-pulse' : 'bg-rose-200'
                }`}
              />
              <span>{!isOrdersLocked ? 'الطلبات مفتوحة' : 'الطلبات مقفولة'}</span>
            </button>

            {/* الدليفري + تحديد السعر: ينور أخضر لما يتفتح */}
            <div
              className={`min-h-[38px] p-1 rounded-xl border inline-flex items-center gap-1.5 transition-all ${
                isDeliveryEnabled
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-xs'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <button
                id="supervisor-delivery-toggle-btn"
                type="button"
                onClick={handleToggleDelivery}
                className="px-2.5 py-1 text-xs font-extrabold rounded-lg transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isDeliveryEnabled ? 'bg-white animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span>🛵 الدليفري</span>
              </button>
              <div className="flex items-center gap-1 pr-1 border-r border-white/20">
                <input
                  id="supervisor-delivery-fee-input"
                  type="number"
                  min="0"
                  step="0.5"
                  aria-label="سعر الدليفري"
                  value={feeInput}
                  onChange={(e) => handleFeeInputChange(e.target.value)}
                  onBlur={() => {
                    const parsed = Number(feeInput);
                    const valid =
                      Number.isFinite(parsed) && parsed >= 0
                        ? Math.round(parsed * 100) / 100
                        : 0;
                    setFeeInput(String(valid));
                    onUpdateDeliverySettings(isDeliveryEnabled, valid);
                  }}
                  className={`w-14 h-7 px-1.5 text-center font-mono tabular-nums text-xs font-extrabold rounded-lg focus:outline-none ${
                    isDeliveryEnabled
                      ? 'bg-white text-emerald-950'
                      : 'bg-slate-900 text-slate-200 border border-slate-700'
                  }`}
                />
                <span className="text-[11px] font-bold pl-1">ج.م</span>
              </div>
            </div>

            {/* سندوتشات سوري: ينور أخضر لما يتفعل */}
            <button
              id="supervisor-syrian-menu-toggle-btn"
              type="button"
              onClick={onToggleSyrianMenu}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-2 border ${
                isSyrianMenuEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isSyrianMenuEnabled ? 'bg-white animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span>🌯 سندوتشات سوري</span>
            </button>

            <button
              type="button"
              onClick={onCopyMasterSummary}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedSummaryRecently ? 'تم النسخ ✅' : 'نسخ القائمة'}
            </button>

            {!confirmingClear ? (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-bold text-rose-300 bg-rose-950/80 border border-rose-500/40 hover:bg-rose-900/80 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                مسح الكل
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-950/90 border border-rose-500/50 px-2.5 py-1 rounded-xl">
                <span className="text-xs font-bold text-rose-200 whitespace-nowrap">
                  تأكيد؟
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllOrders();
                    setConfirmingClear(false);
                  }}
                  className="min-h-[30px] px-2.5 py-1 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  نعم
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="min-h-[30px] px-2 py-1 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
