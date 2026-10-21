import React, { useState, useEffect } from 'react';
import {
  DORM_ROOMS,
  type DormRoom,
  type OrderCategory,
  type PaymentMethod,
} from '../types/orders';
import { validateOrderItemInput } from '../utils/orderAggregator';

export const SAVED_STUDENT_NAME_KEY = 'sakan_saved_student_name_v2';
export const SAVED_STUDENT_ROOM_KEY = 'sakan_saved_student_room_v2';

interface OrderFormCardProps {
  formRef?: React.RefObject<HTMLFormElement | null>;
  nameInputRef?: React.RefObject<HTMLInputElement | null>;
  isOrdersLocked?: boolean;
  savedStudentName?: string;
  savedStudentRoom?: DormRoom | '';
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

export const OrderFormCard: React.FC<OrderFormCardProps> = ({
  formRef,
  nameInputRef,
  isOrdersLocked = false,
  savedStudentName,
  savedStudentRoom,
  ordersCount = 0,
  deleteSignal = 0,
  onEditStudentProfile,
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

  const [roomNumber, setRoomNumber] = useState<DormRoom | ''>(() => {
    if (savedStudentRoom && DORM_ROOMS.includes(savedStudentRoom)) {
      return savedStudentRoom;
    }
    try {
      const stored = localStorage.getItem(SAVED_STUDENT_ROOM_KEY) || '';
      return DORM_ROOMS.includes(stored as DormRoom) ? (stored as DormRoom) : '';
    } catch {
      return '';
    }
  });

  const [isEditingProfileInline, setIsEditingProfileInline] = useState<boolean>(false);
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
      if (roomNumber) {
        localStorage.setItem(SAVED_STUDENT_ROOM_KEY, roomNumber);
      }
    } catch {
      // ignore
    }
  }, [roomNumber]);

  const hasSavedProfile = Boolean(
    roommateName.trim() && roomNumber && DORM_ROOMS.includes(roomNumber as DormRoom)
  );

  const numericUnitPrice = Number(unitPrice) > 0 ? Number(unitPrice) : 0;
  const lineTotal = Math.round(quantity * numericUnitPrice * 100) / 100;

  const handleQuantityChange = (newQty: number) => {
    const clamped = Math.max(1, Math.min(100, newQty));
    setQuantity(clamped);
  };

  const handleUnitPriceChange = (val: string) => {
    setUnitPrice(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSuccessMessage(null);

    if (isOrdersLocked) {
      setValidationError('الطلبات مقفولة حالياً من المشرف — لا يمكن إضافة طلبات جديدة.');
      return;
    }

    const validation = validateOrderItemInput({
      roommateName,
      roomNumber,
      itemName,
      category: 'snacks',
      quantity,
      unitPrice,
      paymentMethod: 'cash',
      cashPaidAmount: lineTotal,
      notes: '',
    });

    if (!validation.valid || !validation.sanitized) {
      setValidationError(validation.error || 'بيانات الطلب غير مكتملة.');
      return;
    }

    setItemName('');
    setInputNonce(Date.now());
    await onAddOrder(validation.sanitized);

    const addedSummary = `${validation.sanitized.quantity} × ${validation.sanitized.itemName}`;
    setSuccessMessage(
      `تمت إضافة (${addedSummary}) لطلباتك — تقدر تضيف طلب تاني أو تحدد المبلغ اللي هتجهزه تحت.`
    );
    setQuantity(1);
    setIsEditingProfileInline(false);
  };

  return (
    <div id="order-form" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">نسخة الطلاب — سجل طلباتك</h1>
          <p className="text-xs text-slate-500 mt-1">
            ضيف كل الطلبات اللي عايزها الأول، وبعدها حدد تحت في قائمة طلباتك هتجهز كام للمشرف مرة واحدة.
          </p>
        </div>
        {isOrdersLocked && (
          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold">
            الطلبات مقفولة
          </span>
        )}
      </div>

      {isOrdersLocked && (
        <div
          role="alert"
          className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold text-rose-800"
        >
          تم قفل الطلبات من المشرف — انتهى وقت إضافة طلبات جديدة لهذا الأوردر.
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="mt-4 space-y-4" noValidate>
        {/* Saved Student Identity Bar OR Editable Name + Room Fields */}
        {hasSavedProfile && !isEditingProfileInline ? (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <span className="text-slate-500 font-medium">مسجل باسم:</span>
              <span className="font-extrabold text-slate-900">{roommateName}</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-200/80 text-slate-800 font-bold text-xs">
                {roomNumber}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onEditStudentProfile) {
                  onEditStudentProfile();
                } else {
                  setIsEditingProfileInline(true);
                }
              }}
              className="text-xs font-bold text-amber-800 hover:text-amber-900 underline cursor-pointer"
            >
              تغيير الاسم أو الأوضة
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="sm:col-span-2">
              <label htmlFor="roommate-name-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                اسمك <span className="text-rose-600">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="roommate-name-input"
                type="text"
                required
                disabled={isOrdersLocked}
                placeholder="اكتب اسمك..."
                value={roommateName}
                onChange={(e) => {
                  setRoommateName(e.target.value);
                  setValidationError(null);
                }}
                className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <div>
              <label htmlFor="room-number-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                الأوضة <span className="text-rose-600">*</span>
              </label>
              <select
                id="room-number-select"
                required
                disabled={isOrdersLocked}
                value={roomNumber}
                onChange={(e) => {
                  setRoomNumber(e.target.value as DormRoom | '');
                  setValidationError(null);
                }}
                className={`w-full h-11 px-3 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                  roomNumber === '' ? 'text-slate-500 border-slate-300' : 'text-slate-900 font-semibold border-slate-300'
                }`}
              >
                <option value="">اختر الأوضة...</option>
                {DORM_ROOMS.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Item Name (Direct Input Only — No Browser Autocomplete History) */}
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
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-autocomplete="none"
            data-form-type="other"
            data-lpignore="true"
            disabled={isOrdersLocked}
            placeholder="اكتب الطلب (مثال: شيبسي، بيبسي، إندومي)..."
            value={itemName}
            onChange={(e) => {
              setItemName(e.target.value);
              setValidationError(null);
            }}
            className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>

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
                type="number"
                min="1"
                max="100"
                disabled={isOrdersLocked}
                value={quantity}
                onChange={(e) => handleQuantityChange(Number(e.target.value) || 1)}
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
              type="number"
              min="0.5"
              step="0.5"
              disabled={isOrdersLocked}
              placeholder="15"
              value={unitPrice}
              onChange={(e) => handleUnitPriceChange(e.target.value)}
              className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
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

        <button
          type="submit"
          disabled={isOrdersLocked}
          className="w-full min-h-[48px] px-5 py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed rounded-xl transition-colors whitespace-nowrap cursor-pointer"
        >
          {isOrdersLocked
            ? 'الطلبات مقفولة حالياً من المشرف'
            : `+ إضافة لطلباتك (${lineTotal} ج.م)`}
        </button>
      </form>
    </div>
  );
};
