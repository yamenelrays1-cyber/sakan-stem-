import React, { useState, useEffect } from 'react';
import {
  SYRIAN_SANDWICHES_MENU,
  type DormRoom,
  type OrderCategory,
  type PaymentMethod,
  type SyrianMenuOption,
} from '../types/orders';
import { validateOrderItemInput, findSyrianMenuItem } from '../utils/orderAggregator';
import { normalizeDormRoomInput, toEnglishDigits } from '../utils/emailOtpService';

export const SAVED_STUDENT_NAME_KEY = 'sakan_saved_student_name_v3';
export const SAVED_STUDENT_ROOM_KEY = 'sakan_saved_student_room_v3';
export const SAVED_STUDENT_EMAIL_KEY = 'sakan_saved_student_email_v3';

interface OrderFormCardProps {
  formRef?: React.RefObject<HTMLFormElement | null>;
  nameInputRef?: React.RefObject<HTMLInputElement | null>;
  isOrdersLocked?: boolean;
  isDeliveryEnabled?: boolean;
  deliveryFee?: number;
  isSyrianMenuEnabled?: boolean;
  savedStudentName?: string;
  savedStudentRoom?: DormRoom | '';
  savedStudentEmail?: string;
  ordersCount?: number;
  deleteSignal?: number;
  onEditStudentProfile?: () => void;
  onAddOrder: (orderData: {
    roommateName: string;
    roomNumber: string;
    itemName: string;
    normalizedItemKey: string;
    category: OrderCategory;
    quantity: number;
    unitPrice: number;
    paymentMethod: PaymentMethod;
    cashPaidAmount: number;
    notes: string;
  }) => Promise<void> | void;
}

const SIZED_SYRIAN_GROUPS = [
  {
    title: 'بطاطس',
    options: SYRIAN_SANDWICHES_MENU.filter((o) => o.groupTitle === 'بطاطس'),
  },
  {
    title: 'بطاطس موتزريلا',
    options: SYRIAN_SANDWICHES_MENU.filter((o) => o.groupTitle === 'بطاطس موتزريلا'),
  },
  {
    title: 'بطاطس باكت',
    options: SYRIAN_SANDWICHES_MENU.filter((o) => o.groupTitle === 'بطاطس باكت'),
  },
];

const TOUMIA_OPTIONS = SYRIAN_SANDWICHES_MENU.filter((o) => o.groupTitle === 'تومية');
const SAUCE_OPTIONS = SYRIAN_SANDWICHES_MENU.filter(
  (o) => o.id === 'sauce_texas' || o.id === 'sauce_cheddar'
);

export const OrderFormCard: React.FC<OrderFormCardProps> = ({
  formRef,
  nameInputRef,
  isOrdersLocked = false,
  isDeliveryEnabled = false,
  deliveryFee = 0,
  isSyrianMenuEnabled = false,
  savedStudentName,
  savedStudentRoom,
  ordersCount = 0,
  deleteSignal = 0,
  onAddOrder,
}) => {
  const [roommateName, setRoommateName] = useState<string>(() => {
    if (savedStudentName) return savedStudentName;
    try {
      return localStorage.getItem(SAVED_STUDENT_NAME_KEY) || '';
    } catch {
      return '';
    }
  });

  const [roomNumber, setRoomNumber] = useState<string>(() => {
    const normalizedProp = savedStudentRoom ? normalizeDormRoomInput(savedStudentRoom) : '';
    if (normalizedProp) {
      return normalizedProp;
    }
    try {
      const stored = localStorage.getItem(SAVED_STUDENT_ROOM_KEY) || '';
      return normalizeDormRoomInput(stored) || '';
    } catch {
      return '';
    }
  });

  const [, setIsEditingProfileInline] = useState<boolean>(false);
  const [inputNonce, setInputNonce] = useState<number>(() => Date.now());

  const [itemName, setItemName] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<string>('15');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear success message immediately if an order is deleted or if no orders remain
  useEffect(() => {
    if (deleteSignal > 0) {
      setSuccessMessage(null);
    }
  }, [deleteSignal]);

  useEffect(() => {
    if (ordersCount === 0) {
      setSuccessMessage(null);
    }
  }, [ordersCount]);

  useEffect(() => {
    if (savedStudentName !== undefined && savedStudentName !== roommateName) {
      setRoommateName(savedStudentName);
    }
  }, [savedStudentName]);

  useEffect(() => {
    if (savedStudentRoom !== undefined && savedStudentRoom !== roomNumber) {
      setRoomNumber(savedStudentRoom);
    }
  }, [savedStudentRoom]);

  // When Supervisor enables Syrian Sandwiches menu, ensure selected item is from the Syrian menu
  useEffect(() => {
    if (isSyrianMenuEnabled) {
      const existingMatch = findSyrianMenuItem(itemName);
      if (existingMatch) {
        setItemName(existingMatch.itemName);
        setUnitPrice(String(existingMatch.unitPrice));
      } else {
        const defaultOption = SYRIAN_SANDWICHES_MENU[0];
        setItemName(defaultOption.itemName);
        setUnitPrice(String(defaultOption.unitPrice));
      }
      setValidationError(null);
    }
  }, [isSyrianMenuEnabled]);

  useEffect(() => {
    try {
      if (roommateName.trim()) {
        localStorage.setItem(SAVED_STUDENT_NAME_KEY, roommateName.trim());
      }
    } catch {
      // ignore
    }
  }, [roommateName]);

  useEffect(() => {
    try {
      const normalized = normalizeDormRoomInput(roomNumber);
      if (normalized) {
        localStorage.setItem(SAVED_STUDENT_ROOM_KEY, normalized);
      }
    } catch {
      // ignore
    }
  }, [roomNumber]);

  const normalizedActiveRoom = normalizeDormRoomInput(roomNumber);
  const hasSavedProfile = Boolean(roommateName.trim() && normalizedActiveRoom);

  const numericUnitPrice = Number(unitPrice) > 0 ? Number(unitPrice) : 0;
  const lineTotal = Math.round(quantity * numericUnitPrice * 100) / 100;
  const activeDeliveryAmount =
    isDeliveryEnabled && deliveryFee > 0 ? Math.round(deliveryFee * 100) / 100 : 0;

  const handleSelectSyrianOption = (opt: SyrianMenuOption) => {
    if (isOrdersLocked) return;
    setItemName(opt.itemName);
    setUnitPrice(String(opt.unitPrice));
    setValidationError(null);
  };

  const handleQuantityChange = (newQty: number) => {
    const clamped = Math.max(1, Math.min(100, newQty));
    setQuantity(clamped);
  };

  const handleUnitPriceChange = (val: string) => {
    if (isSyrianMenuEnabled) return;
    const eng = toEnglishDigits(val).replace(/[^0-9.]/g, '');
    setUnitPrice(eng);
  };

  const executeOrderSubmit = async (): Promise<boolean> => {
    setValidationError(null);
    setSuccessMessage(null);

    if (isOrdersLocked) {
      setValidationError('الطلبات مقفولة حالياً من المشرف — لا يمكن إضافة طلبات جديدة.');
      return false;
    }

    const validation = validateOrderItemInput(
      {
        roommateName,
        roomNumber,
        itemName,
        category: 'snacks',
        quantity,
        unitPrice,
        paymentMethod: 'cash',
        cashPaidAmount: lineTotal,
        notes: '',
      },
      { isSyrianMenuEnabled }
    );

    if (!validation.valid || !validation.sanitized) {
      setValidationError(validation.error || 'بيانات الطلب غير مكتملة.');
      return false;
    }

    if (!isSyrianMenuEnabled) {
      setItemName('');
    }
    setInputNonce(Date.now());
    await onAddOrder(validation.sanitized);

    const addedSummary = `${validation.sanitized.quantity} × ${validation.sanitized.itemName}`;
    setSuccessMessage(
      `تمت إضافة (${addedSummary}) لطلباتك — تقدر تضيف طلب تاني أو تحدد المبلغ اللي هتجهزه وتبعت الطلب تحت.`
    );
    setQuantity(1);
    setIsEditingProfileInline(false);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeOrderSubmit();
  };

  return (
    <div id="order-form" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">نسخة الطلاب — سجل طلباتك</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isSyrianMenuEnabled && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-200 text-amber-950 border border-amber-300 text-xs font-extrabold">
              🌯 سندوتشات سوري
            </span>
          )}
          {activeDeliveryAmount > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold font-mono tabular-nums">
              🛵 الدليفري: {activeDeliveryAmount} ج.م
            </span>
          )}
          {isOrdersLocked && (
            <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold">
              الطلبات مقفولة
            </span>
          )}
        </div>
      </div>

      {/* Delivery Fee Notice Before Sending the Order */}
      {activeDeliveryAmount > 0 && (
        <div
          id="student-delivery-fee-banner"
          className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs"
        >
          <span className="font-bold text-amber-900">
            🛵 فلوس الدليفري المحددة من المشرف:
          </span>
          <span className="font-extrabold font-mono tabular-nums text-amber-900 bg-white px-2.5 py-1 rounded-lg border border-amber-200">
            {activeDeliveryAmount} ج.م (تُضاف مرة واحدة على إجمالي طلبك)
          </span>
        </div>
      )}

      {isOrdersLocked && (
        <div
          role="alert"
          className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold text-rose-800"
        >
          تم قفل الطلبات من المشرف — انتهى وقت إضافة طلبات جديدة لهذا الأوردر.
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="mt-4 space-y-4" noValidate>
        {!hasSavedProfile && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="sm:col-span-2">
              <label htmlFor="roommate-name-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                اسمك <span className="text-rose-600">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="roommate-name-input"
                type="text"
                lang="ar"
                dir="rtl"
                required
                disabled={isOrdersLocked}
                placeholder="الاسم ثنائي"
                value={roommateName}
                onChange={(e) => {
                  const rawVal = toEnglishDigits(e.target.value);
                  if (/[a-zA-Z0-9]/.test(rawVal)) {
                    setRoommateName(rawVal.replace(/[a-zA-Z0-9]/g, ''));
                    setValidationError('يرجى كتابة الاسم باللغة العربية فقط.');
                    return;
                  }
                  setRoommateName(rawVal);
                  setValidationError(null);
                }}
                className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <div>
              <label htmlFor="room-number-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                رقم الغرفة <span className="text-rose-600">*</span>
              </label>
              <input
                id="room-number-select"
                type="text"
                inputMode="numeric"
                dir="ltr"
                required
                disabled={isOrdersLocked}
                placeholder="رقم الغرفة"
                value={roomNumber}
                onChange={(e) => {
                  const engDigits = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
                  setRoomNumber(engDigits);
                  setValidationError(null);
                }}
                className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>
        )}

        {/* Item Selection: Either Syrian Sandwiches Menu ONLY or Free Input */}
        {isSyrianMenuEnabled ? (
          <div
            id="syrian-sandwiches-menu-picker"
            className="p-4 rounded-2xl bg-amber-50/60 border-2 border-amber-300/80 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-amber-200/80">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                  🌯 قائمة سندوتشات سوري (اختر الصنف والحجم)
                </h2>
                <p className="text-[11px] font-semibold text-amber-900 mt-0.5">
                  المشرف فعّل طلبات السندوتشات السوري — اختر من الأصناف المتاحة بالأسفل فقط:
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-extrabold">
                <span className="px-2 py-0.5 rounded-full bg-rose-900 text-amber-300 font-mono">
                  M = وسط
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-900 text-amber-300 font-mono">
                  L = كبير
                </span>
              </div>
            </div>

            {/* Section 1: Fries Sandwiches (M / L) */}
            <div className="space-y-2.5">
              {SIZED_SYRIAN_GROUPS.map((group) => (
                <div
                  key={group.title}
                  className="p-3 rounded-xl bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="text-sm font-extrabold text-slate-900">{group.title}</div>
                  <div className="grid grid-cols-2 gap-2 sm:w-72">
                    {group.options.map((opt) => {
                      const isSelected = itemName === opt.itemName;
                      return (
                        <button
                          key={opt.id}
                          id={`syrian-opt-${opt.id}`}
                          type="button"
                          disabled={isOrdersLocked}
                          onClick={() => handleSelectSyrianOption(opt)}
                          className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-900 text-amber-300 border-slate-900 ring-2 ring-amber-400 shadow-xs'
                              : 'bg-slate-50 hover:bg-amber-100/70 text-slate-900 border-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-900 text-amber-300 font-mono text-[11px] font-black">
                              {opt.sizeBadge}
                            </span>
                            <span>{opt.sizeLabelAr}</span>
                          </span>
                          <span className="font-mono tabular-nums font-black">
                            {opt.unitPrice} ج.م
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Section 2: Extras & Sauces (إضافات وصوصات) */}
            <div className="pt-2 border-t border-amber-200/80 space-y-2.5">
              <div className="text-xs font-extrabold text-rose-900">
                إضافات وصوصات:
              </div>

              {/* تومية (M / L) */}
              <div className="p-3 rounded-xl bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-sm font-extrabold text-slate-900">تومية</div>
                <div className="grid grid-cols-2 gap-2 sm:w-72">
                  {TOUMIA_OPTIONS.map((opt) => {
                    const isSelected = itemName === opt.itemName;
                    return (
                      <button
                        key={opt.id}
                        id={`syrian-opt-${opt.id}`}
                        type="button"
                        disabled={isOrdersLocked}
                        onClick={() => handleSelectSyrianOption(opt)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-amber-300 border-slate-900 ring-2 ring-amber-400 shadow-xs'
                            : 'bg-slate-50 hover:bg-amber-100/70 text-slate-900 border-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-900 text-amber-300 font-mono text-[11px] font-black">
                            {opt.sizeBadge}
                          </span>
                          <span>{opt.sizeLabelAr}</span>
                        </span>
                        <span className="font-mono tabular-nums font-black">
                          {opt.unitPrice} ج.م
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* صوص تكساس & صوص شيدر */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SAUCE_OPTIONS.map((opt) => {
                  const isSelected = itemName === opt.itemName;
                  return (
                    <button
                      key={opt.id}
                      id={`syrian-opt-${opt.id}`}
                      type="button"
                      disabled={isOrdersLocked}
                      onClick={() => handleSelectSyrianOption(opt)}
                      className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-sm font-extrabold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-amber-300 border-slate-900 ring-2 ring-amber-400 shadow-xs'
                          : 'bg-white hover:bg-amber-100/70 text-slate-900 border-amber-200'
                      }`}
                    >
                      <span>{opt.itemName}</span>
                      <span className="font-mono tabular-nums font-black">
                        {opt.unitPrice} ج.م
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Choice Indicator */}
            <div className="p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between text-xs font-bold">
              <span>الصنف المختار حالياً:</span>
              <span className="text-amber-300 font-extrabold">
                {itemName} — {numericUnitPrice} ج.م للواحدة
              </span>
            </div>
          </div>
        ) : (
          /* Item Name (Direct Input Only — No Browser Autocomplete History) */
          <div>
            <label
              htmlFor={`sakan-item-field-${inputNonce}`}
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              الطلب (اسم الصنف) <span className="text-rose-600">*</span>
            </label>
            <input
              id={`sakan-item-field-${inputNonce}`}
              name={`sakan_item_field_${inputNonce}`}
              type="text"
              lang="ar"
              dir="rtl"
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-autocomplete="none"
              data-form-type="other"
              data-lpignore="true"
              disabled={isOrdersLocked}
              placeholder="اسم الصنف"
              value={itemName}
              onChange={(e) => {
                const rawVal = toEnglishDigits(e.target.value);
                if (/[a-zA-Z]/.test(rawVal)) {
                  const stripped = rawVal.replace(/[a-zA-Z]/g, '');
                  setItemName(stripped);
                  setValidationError('يرجى كتابة الطلب باللغة العربية فقط (والأرقام بالإنجليزي).');
                  return;
                }
                setItemName(rawVal);
                setValidationError(null);
              }}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        )}

        {/* Quantity + Unit Price + Item Subtotal */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label htmlFor="item-quantity-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              الكمية
            </label>
            <div className="flex items-center h-11 border border-slate-300 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                aria-label="زيادة الكمية"
                disabled={isOrdersLocked}
                onClick={() => handleQuantityChange(quantity + 1)}
                className="min-w-[44px] h-full flex items-center justify-center text-base font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
              >
                +
              </button>
              <input
                id="item-quantity-input"
                type="text"
                inputMode="numeric"
                dir="ltr"
                disabled={isOrdersLocked}
                value={quantity}
                onChange={(e) => {
                  const eng = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
                  handleQuantityChange(Number(eng) || 1);
                }}
                className="w-full h-full text-center font-mono tabular-nums text-sm font-bold text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                aria-label="تقليل الكمية"
                disabled={isOrdersLocked}
                onClick={() => handleQuantityChange(quantity - 1)}
                className="min-w-[44px] h-full flex items-center justify-center text-base font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
              >
                −
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="unit-price-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              السعر للواحدة (ج.م)
            </label>
            <input
              id="unit-price-input"
              type="text"
              inputMode="decimal"
              dir="ltr"
              readOnly={isSyrianMenuEnabled}
              disabled={isOrdersLocked || isSyrianMenuEnabled}
              placeholder="15"
              value={unitPrice}
              onChange={(e) => handleUnitPriceChange(e.target.value)}
              className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-600"
            />
          </div>

          <div className="h-11 px-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">سعر الصنف:</span>
            <span className="text-base font-bold font-mono tabular-nums text-slate-900">
              {lineTotal} ج.م
            </span>
          </div>
        </div>

        {validationError && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
            {validationError}
          </div>
        )}

        {successMessage && (
          <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
            {successMessage}
          </div>
        )}

        <div className="pt-1 flex justify-center">
          <button
            id="order-form-submit-btn"
            type="submit"
            disabled={isOrdersLocked}
            className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-md disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer"
          >
            {isOrdersLocked ? (
              <span>الطلبات مقفولة حالياً من المشرف</span>
            ) : isSyrianMenuEnabled && itemName ? (
              <span>
                إضافة ({quantity} × {itemName}) لطلباتك ({lineTotal} ج.م)
              </span>
            ) : (
              <span>إضافة لطلباتك ({lineTotal} ج.م)</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

