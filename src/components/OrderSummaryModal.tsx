import React, { useState } from 'react';
import type { RoommateOrderItem } from '../types/orders';
import {
  aggregateOrdersForMaster,
  buildCompactItemsSummary,
  buildWhatsAppShareUrl,
} from '../utils/orderAggregator';

interface OrderSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: RoommateOrderItem[];
}

export const OrderSummaryModal: React.FC<OrderSummaryModalProps> = ({
  isOpen,
  onClose,
  orders,
}) => {
  const [copiedRecently, setCopiedRecently] = useState(false);

  if (!isOpen) return null;

  const compactSummary = buildCompactItemsSummary(orders);
  const aggregatedItems = aggregateOrdersForMaster(orders);
  const readyText = compactSummary || 'لا توجد طلبات مسجلة حالياً';
  const whatsappUrl = buildWhatsAppShareUrl(readyText);

  const handleCopyText = async () => {
    if (!compactSummary) return;
    try {
      await navigator.clipboard.writeText(compactSummary);
    } catch {
      // ignore clipboard errors
    }
    setCopiedRecently(true);
    window.setTimeout(() => setCopiedRecently(false), 2500);
  };

  return (
    <div
      id="order-summary-modal"
      role="dialog"
      aria-modal="true"
      aria-label="ملخص الطلب المجمّع"
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4 shadow-2xl text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              📋 ملخص الطلب المجمّع
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تجميع نفس الصنف من كل الناس في نص جاهز للنسخ أو الإرسال عبر واتساب
            </p>
          </div>
          <button
            type="button"
            aria-label="إغلاق ملخص الطلب"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Ready-to-copy aggregated text box (e.g. 3 شاورما، 2 كولا) */}
        <div className="space-y-1.5">
          <label
            htmlFor="order-summary-ready-textarea"
            className="block text-xs font-extrabold text-slate-700"
          >
            النص المجمّع الجاهز للمطعم:
          </label>
          <textarea
            id="order-summary-ready-textarea"
            readOnly
            rows={3}
            value={readyText}
            className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-sm sm:text-base font-extrabold text-slate-900 leading-relaxed focus:outline-none"
          />
        </div>

        {/* Breakdown badges */}
        {aggregatedItems.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-600">
              تفاصيل الأصناف المجمّعة ({aggregatedItems.length}):
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200/80">
              {aggregatedItems.map((item) => (
                <span
                  key={item.normalizedKey}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 font-mono tabular-nums"
                >
                  {item.totalQuantity} {item.displayName} ({item.totalCost} ج.م)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons: "انسخ" & "ابعت واتساب" */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
          <button
            id="order-summary-copy-btn"
            type="button"
            disabled={!compactSummary}
            onClick={handleCopyText}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-extrabold transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{copiedRecently ? 'تم النسخ ✅' : 'انسخ'}</span>
          </button>

          <a
            id="order-summary-whatsapp-link"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ابعت واتساب"
            className={`min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold transition-colors flex items-center justify-center gap-2 ${
              !compactSummary ? 'pointer-events-none opacity-50' : 'cursor-pointer'
            }`}
          >
            <span>ابعت واتساب</span>
          </a>
        </div>
      </div>
    </div>
  );
};
