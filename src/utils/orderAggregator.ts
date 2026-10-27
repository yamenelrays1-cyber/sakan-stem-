import {
  DORM_ROOMS,
  SYRIAN_SANDWICHES_MENU,
  type MasterAggregatedItem,
  type OrderCategory,
  type PaymentMethod,
  type RoommateFinancialSummary,
  type RoommateOrderItem,
  type SessionFinancialSummary,
  type SyrianMenuOption,
} from '../types/orders.ts';
import {
  sanitizeTextInput,
  normalizeDormRoomInput,
  hasDangerousInjectionPayload,
  toEnglishDigits,
  isArabicOnlyStudentName,
} from './emailOtpService.ts';

/**
 * Common Egyptian Arabic spelling aliases for dorm snacks, drinks, and meals
 * so that "شيبسي", "شبسي", and "شيبي" all aggregate into a single Master row.
 */
const WORD_ALIASES: Record<string, string> = {
  شبسي: 'شيبسي',
  شيبي: 'شيبسي',
  شيبسى: 'شيبسي',
  شيبس: 'شيبسي',
  شبسى: 'شيبسي',
  شيبسي: 'شيبسي',
  ببسي: 'بيبسي',
  بيبسى: 'بيبسي',
  بيبسي: 'بيبسي',
  كشرى: 'كشري',
  كشري: 'كشري',
  اندومى: 'اندومي',
  اندومي: 'اندومي',
  إندومي: 'اندومي',
  أندومي: 'اندومي',
  طعمية: 'طعميه',
  طعميه: 'طعميه',
  جبنة: 'جبنه',
  جبنه: 'جبنه',
  شاورمة: 'شاورما',
  شاورما: 'شاورما',
  سندوتش: 'ساندوتش',
  سندويتش: 'ساندوتش',
  ساندويتش: 'ساندوتش',
};

const CANONICAL_DISPLAY_NAMES: Record<string, string> = {
  شيبسي: 'شيبسي',
  بيبسي: 'بيبسي',
  كشري: 'كشري',
  اندومي: 'إندومي',
  طعميه: 'طعمية',
  ساندوتش: 'ساندوتش',
};

/**
 * Normalizes an Arabic item name so variations in spelling (e.g. شيبسي / شبسي / شيبي)
 * produce the exact same aggregation key for the Master, with English digits (0-9).
 */
export function normalizeArabicItemName(raw: string): string {
  const cleaned = toEnglishDigits(raw || '')
    .trim()
    .toLowerCase()
    // Remove Arabic diacritics (tashkeel) and tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Normalize Alef variants
    .replace(/[أإآ]/g, 'ا')
    // Normalize Teh Marbuta to Heh
    .replace(/ة/g, 'ه')
    // Normalize Alef Maksura to Yeh
    .replace(/ى/g, 'ي')
    // Remove punctuation symbols except spaces and numbers
    .replace(/[.,،/\\()[\]{}\-_+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ').map((word) => WORD_ALIASES[word] ?? word);
  return words.join(' ');
}

/**
 * Produces a clean Arabic display title from a normalized key or raw name.
 */
export function getCanonicalDisplayName(rawName: string, normalizedKey: string): string {
  const words = normalizedKey.split(' ');
  if (words.length === 1 && CANONICAL_DISPLAY_NAMES[words[0]]) {
    return CANONICAL_DISPLAY_NAMES[words[0]];
  }
  if (words.length > 0 && words[0] === 'شيبسي') {
    return ['شيبسي', ...words.slice(1)].join(' ');
  }
  return toEnglishDigits(rawName).trim();
}

/**
 * Aggregates individual roommate order items into the Master's shopping list.
 * Example: Roommate A orders 1 شيبسي, Roommate B orders 1 شبسي, Roommate C orders 3 شيبي
 * -> Master sees 5 شيبسي total.
 */
export function aggregateOrdersForMaster(orders: RoommateOrderItem[]): MasterAggregatedItem[] {
  const groups = new Map<string, RoommateOrderItem[]>();

  for (const item of orders) {
    const key = item.normalizedItemKey || normalizeArabicItemName(item.itemName);
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const aggregated: MasterAggregatedItem[] = [];

  for (const [normalizedKey, groupItems] of groups.entries()) {
    const first = groupItems[0];
    let totalQuantity = 0;
    let purchasedQuantity = 0;
    let totalCost = 0;
    const unitPrices = new Set<number>();
    const priceTierMap = new Map<number, { unitPrice: number; quantity: number; subtotal: number }>();
    const notesList: string[] = [];
    const requesterMap = new Map<
      string,
      {
        orderId: string;
        roommateName: string;
        roomNumber: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        paymentMethod: PaymentMethod;
        cashPaidAmount: number;
        isPaid: boolean;
        isPurchased: boolean;
        notes: string;
      }
    >();

    for (const order of groupItems) {
      const subtotal = Math.round(order.quantity * order.unitPrice * 100) / 100;
      totalQuantity += order.quantity;
      if (order.isPurchased) {
        purchasedQuantity += order.quantity;
      }
      totalCost += subtotal;
      unitPrices.add(order.unitPrice);

      const cleanPrice = Math.round(order.unitPrice * 100) / 100;
      const existingTier = priceTierMap.get(cleanPrice);
      if (existingTier) {
        existingTier.quantity += order.quantity;
        existingTier.subtotal = Math.round((existingTier.subtotal + subtotal) * 100) / 100;
      } else {
        priceTierMap.set(cleanPrice, {
          unitPrice: cleanPrice,
          quantity: order.quantity,
          subtotal,
        });
      }

      if (order.notes.trim()) {
        notesList.push(`${order.roommateName}: ${order.notes.trim()}`);
      }

      const studentKey = `${normalizeArabicItemName(order.roommateName) || order.roommateName.trim()}__${order.roomNumber.trim()}`;
      const existingReq = requesterMap.get(studentKey);
      if (existingReq) {
        existingReq.quantity += order.quantity;
        existingReq.subtotal = Math.round((existingReq.subtotal + subtotal) * 100) / 100;
        existingReq.cashPaidAmount = Math.round((existingReq.cashPaidAmount + order.cashPaidAmount) * 100) / 100;
        existingReq.isPaid = existingReq.isPaid && order.isPaid;
        existingReq.isPurchased = existingReq.isPurchased && order.isPurchased;
      } else {
        requesterMap.set(studentKey, {
          orderId: order.id,
          roommateName: order.roommateName.trim(),
          roomNumber: order.roomNumber.trim(),
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          subtotal,
          paymentMethod: order.paymentMethod,
          cashPaidAmount: order.cashPaidAmount,
          isPaid: order.isPaid,
          isPurchased: order.isPurchased,
          notes: order.notes,
        });
      }
    }

    const requesters = Array.from(requesterMap.values());
    const priceBreakdown = Array.from(priceTierMap.values()).sort(
      (a, b) => a.unitPrice - b.unitPrice
    );

    const allPurchased = totalQuantity > 0 && purchasedQuantity === totalQuantity;
    const canonicalUnitPrice =
      totalQuantity > 0 ? Math.round((totalCost / totalQuantity) * 100) / 100 : first.unitPrice;

    aggregated.push({
      normalizedKey,
      displayName: getCanonicalDisplayName(first.itemName, normalizedKey),
      category: first.category,
      totalQuantity,
      purchasedQuantity,
      unitPrice: unitPrices.size === 1 ? first.unitPrice : canonicalUnitPrice,
      hasMixedUnitPrices: unitPrices.size > 1,
      priceBreakdown,
      totalCost: Math.round(totalCost * 100) / 100,
      allPurchased,
      requesters,
      combinedNotes: notesList,
    });
  }

  // Sort by highest total quantity first so the Master sees bulk items at the top
  return aggregated.sort((a, b) => {
    if (a.allPurchased !== b.allPurchased) {
      return a.allPurchased ? 1 : -1;
    }
    return b.totalQuantity - a.totalQuantity;
  });
}

/**
 * Groups orders by roommate and computes each roommate's required total,
 * delivery share, cash paid, and change owed back by the Master.
 */
export function calculateRoommateSummaries(
  orders: RoommateOrderItem[],
  deliveryFee: number
): RoommateFinancialSummary[] {
  const byRoommate = new Map<string, RoommateOrderItem[]>();

  for (const order of orders) {
    const normalizedStudentName =
      normalizeArabicItemName(order.roommateName) || order.roommateName.trim();
    const key = `${normalizedStudentName}__${order.roomNumber.trim()}`;
    const list = byRoommate.get(key);
    if (list) {
      list.push(order);
    } else {
      byRoommate.set(key, [order]);
    }
  }

  const deliverySharePerPerson =
    byRoommate.size > 0 && deliveryFee > 0
      ? Math.round(deliveryFee * 100) / 100
      : 0;

  const summaries: RoommateFinancialSummary[] = [];

  for (const [, items] of byRoommate.entries()) {
    const first = items[0];
    const roommateName = first.roommateName.trim();
    let itemsCount = 0;
    let itemsSubtotal = 0;
    let cashPaidAmount = 0;
    let hasCashMethod = false;

    for (const item of items) {
      itemsCount += item.quantity;
      itemsSubtotal += item.quantity * item.unitPrice;
      cashPaidAmount += item.cashPaidAmount;
      if (item.paymentMethod === 'cash') {
        hasCashMethod = true;
      }
    }

    itemsSubtotal = Math.round(itemsSubtotal * 100) / 100;
    cashPaidAmount = Math.round(cashPaidAmount * 100) / 100;
    const totalRequired = Math.round((itemsSubtotal + deliverySharePerPerson) * 100) / 100;

    const primaryMethod: PaymentMethod = hasCashMethod ? 'cash' : first.paymentMethod;
    // A student's order is ONLY considered paid/settled ("خالص") after the Master explicitly marks isPaid = true
    const allItemsMarkedPaid = items.length > 0 && items.every((i) => i.isPaid);
    const isFullyPaid = allItemsMarkedPaid;
    const isDelivered = items.length > 0 && items.every((i) => Boolean(i.isDelivered));

    const changeDue =
      !isFullyPaid && primaryMethod === 'cash'
        ? Math.max(0, Math.round((cashPaidAmount - totalRequired) * 100) / 100)
        : 0;

    const remainingUnpaid = isFullyPaid ? 0 : totalRequired;

    summaries.push({
      roommateName,
      roomNumber: first.roomNumber,
      orderIds: items.map((i) => i.id),
      itemsCount,
      itemsSubtotal,
      deliveryShare: deliverySharePerPerson,
      totalRequired,
      paymentMethod: primaryMethod,
      cashPaidAmount,
      changeDue,
      remainingUnpaid,
      isFullyPaid,
      isDelivered,
      items,
    });
  }

  return summaries;
}

/**
 * Computes overall session totals, total cash actually collected by the Master, change due, and unpaid amount.
 */
export function calculateSessionFinancials(
  orders: RoommateOrderItem[],
  deliveryFee: number
): SessionFinancialSummary {
  const aggregated = aggregateOrdersForMaster(orders);
  const roommateSummaries = calculateRoommateSummaries(orders, deliveryFee);

  let totalUnits = 0;
  let purchasedUnits = 0;
  let itemsSubtotal = 0;
  let totalCashOrdersAmount = 0;
  let totalDigitalOrdersAmount = 0;

  for (const order of orders) {
    const lineTotal = order.quantity * order.unitPrice;
    totalUnits += order.quantity;
    if (order.isPurchased) {
      purchasedUnits += order.quantity;
    }
    itemsSubtotal += lineTotal;
    if (order.paymentMethod === 'cash') {
      totalCashOrdersAmount += lineTotal;
    } else {
      totalDigitalOrdersAmount += lineTotal;
    }
  }

  let totalCashCollected = 0;
  let totalChangeToReturn = 0;
  let totalUnpaid = 0;

  for (const r of roommateSummaries) {
    if (r.isFullyPaid && r.paymentMethod === 'cash') {
      totalCashCollected += r.totalRequired;
    }
    totalChangeToReturn += r.changeDue;
    totalUnpaid += r.remainingUnpaid;
  }

  const cleanSubtotal = Math.round(itemsSubtotal * 100) / 100;
  const totalDeliveryFromStudents =
    Math.round(roommateSummaries.reduce((acc, r) => acc + r.deliveryShare, 0) * 100) / 100;
  const cleanDelivery = Math.max(0, Math.round(deliveryFee * 100) / 100);
  const grandTotal = Math.round((cleanSubtotal + totalDeliveryFromStudents) * 100) / 100;

  return {
    totalUnits,
    distinctItemsCount: aggregated.length,
    purchasedUnits,
    itemsSubtotal: cleanSubtotal,
    deliveryFee: cleanDelivery,
    grandTotal,
    totalCashOrdersAmount: Math.round(totalCashOrdersAmount * 100) / 100,
    totalDigitalOrdersAmount: Math.round(totalDigitalOrdersAmount * 100) / 100,
    totalCashCollected: Math.round(totalCashCollected * 100) / 100,
    totalChangeToReturn: Math.round(totalChangeToReturn * 100) / 100,
    cashShortfall: Math.round(totalUnpaid * 100) / 100,
  };
}

export interface OrderInputValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: {
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
  };
}

/**
 * Checks that an order text contains Arabic letters only (with optional spaces and English digits 0-9)
 * and zero English/Latin characters.
 */
export function isArabicOnlyOrderText(raw: string): boolean {
  const trimmed = toEnglishDigits(raw || '').trim();
  if (!trimmed) return false;
  if (/[a-zA-Z]/.test(trimmed)) return false;
  if (!/^[\u0600-\u06FF0-9\s،.()\-+/]+$/.test(trimmed)) return false;
  const arabicLetters = trimmed.match(/[\u0621-\u064A]/g) || [];
  return arabicLetters.length >= 2;
}

export { SYRIAN_SANDWICHES_MENU, type SyrianMenuOption };

/**
 * Finds a Syrian Sandwiches menu option by its itemName or normalized Arabic key.
 */
export function findSyrianMenuItem(rawItemName: string): SyrianMenuOption | undefined {
  const norm = normalizeArabicItemName(rawItemName || '');
  if (!norm) return undefined;
  return SYRIAN_SANDWICHES_MENU.find(
    (opt) => opt.itemName === rawItemName.trim() || normalizeArabicItemName(opt.itemName) === norm
  );
}

/**
 * Strictly validates form input against the schema limits.
 * Requires Arabic-only roommateName and itemName, and English digits (0-9) for all numbers.
 * When options.isSyrianMenuEnabled is true, restricts orders strictly to SYRIAN_SANDWICHES_MENU.
 */
export function validateOrderItemInput(
  input: {
    roommateName: string;
    roomNumber: string;
    itemName: string;
    category: OrderCategory;
    quantity: number | string;
    unitPrice: number | string;
    paymentMethod: PaymentMethod;
    cashPaidAmount: number | string;
    notes: string;
  },
  options?: { isSyrianMenuEnabled?: boolean }
): OrderInputValidationResult {
  if (
    hasDangerousInjectionPayload(input.roommateName) ||
    hasDangerousInjectionPayload(input.itemName) ||
    hasDangerousInjectionPayload(input.notes)
  ) {
    return {
      valid: false,
      error: 'المدخلات تحتوي على أكواد أو رموز غير مسموح بها أمنياً.',
    };
  }

  const rawName = toEnglishDigits(input.roommateName || '').trim();
  const rawItem = toEnglishDigits(input.itemName || '').trim();
  const rawNotes = toEnglishDigits(input.notes || '').trim();

  if (rawName.length > 60) {
    return { valid: false, error: 'الاسم طويل جداً (الحد الأقصى 60 حرف).' };
  }
  if (rawItem.length > 100) {
    return { valid: false, error: 'اسم الصنف طويل جداً (الحد الأقصى 100 حرف).' };
  }
  if (rawNotes.length > 160) {
    return { valid: false, error: 'الملاحظات لا يجب أن تتجاوز 160 حرف.' };
  }

  const roommateName = sanitizeTextInput(rawName, 60);
  const rawRoomTrimmed = toEnglishDigits(input.roomNumber || '').trim();
  const roomNumber = normalizeDormRoomInput(rawRoomTrimmed);
  let itemName = sanitizeTextInput(rawItem, 100);
  const notes = sanitizeTextInput(rawNotes, 160);

  if (!roommateName || roommateName.length < 2) {
    return { valid: false, error: 'من فضلك اكتب اسمك الأول باللغة العربية علشان المشرف يعرف الطلب بتاع مين.' };
  }
  if (!isArabicOnlyStudentName(roommateName)) {
    return { valid: false, error: 'يرجى كتابة الاسم باللغة العربية فقط.' };
  }
  if (!rawRoomTrimmed) {
    return { valid: false, error: 'من فضلك اكتب رقم الغرفة بالأرقام الإنجليزي.' };
  }
  if (!roomNumber) {
    return { valid: false, error: 'من فضلك اكتب رقم الغرفة بالأرقام الإنجليزي فقط.' };
  }
  if (!itemName) {
    return {
      valid: false,
      error: options?.isSyrianMenuEnabled
        ? 'من فضلك اختر صنفاً من قائمة سندوتشات سوري المتاحة.'
        : 'من فضلك اكتب اسم الصنف المطلوب باللغة العربية.',
    };
  }
  if (!isArabicOnlyOrderText(itemName)) {
    return { valid: false, error: 'يرجى كتابة الطلب باللغة العربية فقط.' };
  }
  if (notes && !isArabicOnlyOrderText(notes)) {
    return { valid: false, error: 'يرجى كتابة الملاحظات باللغة العربية فقط.' };
  }

  const quantity = Number(toEnglishDigits(String(input.quantity)));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100 || !Number.isInteger(quantity)) {
    return { valid: false, error: 'الكمية لازم تكون رقم صحيح من 1 لـ 100.' };
  }

  let unitPrice = Number(toEnglishDigits(String(input.unitPrice)));
  if (options?.isSyrianMenuEnabled) {
    const matchedMenuOption = findSyrianMenuItem(itemName);
    if (!matchedMenuOption) {
      return {
        valid: false,
        error: 'من فضلك اختر من أصناف سندوتشات سوري المحددة فقط.',
      };
    }
    itemName = matchedMenuOption.itemName;
    unitPrice = matchedMenuOption.unitPrice;
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 10000) {
    return { valid: false, error: 'من فضلك اكتب سعر الوحدة بالأرقام الإنجليزي (أكبر من صفر).' };
  }

  const rawCash =
    input.cashPaidAmount === '' ? 0 : Number(toEnglishDigits(String(input.cashPaidAmount)));
  if (!Number.isFinite(rawCash) || rawCash < 0 || rawCash > 50000) {
    return { valid: false, error: 'مبلغ الكاش غير صحيح.' };
  }

  const normalizedItemKey = normalizeArabicItemName(itemName);
  if (!normalizedItemKey) {
    return { valid: false, error: 'من فضلك اكتب اسم صنف واضح باللغة العربية.' };
  }

  return {
    valid: true,
    sanitized: {
      roommateName,
      roomNumber: roomNumber.slice(0, 30),
      itemName,
      normalizedItemKey,
      category: input.category,
      quantity,
      unitPrice: Math.round(unitPrice * 100) / 100,
      paymentMethod: input.paymentMethod,
      cashPaidAmount: input.paymentMethod === 'cash' ? Math.round(rawCash * 100) / 100 : 0,
      notes,
    },
  };
}

/**
 * Authorization (تحديد الصلاحيات):
 * Verifies that a user is only allowed to modify or delete their own orders,
 * unless they are an authenticated Supervisor (isSupervisorUnlocked === true).
 */
export function canUserModifyOrder(
  order: { deviceId?: string; roommateName?: string; roomNumber?: string } | null | undefined,
  actor: {
    deviceId: string;
    name?: string;
    room?: string;
    isSupervisorUnlocked?: boolean;
  }
): boolean {
  if (!order) return false;
  if (actor.isSupervisorUnlocked === true) return true;

  const actorDevice = (actor.deviceId || '').trim();
  const orderDevice = (order.deviceId || '').trim();
  if (!actorDevice || !orderDevice || actorDevice !== orderDevice) {
    return false;
  }

  if (actor.name && order.roommateName && actor.name.trim() !== order.roommateName.trim()) {
    return false;
  }
  if (actor.room && order.roomNumber && actor.room.trim() !== order.roomNumber.trim()) {
    return false;
  }

  return true;
}

export const MASTER_PASSCODE = '0902';

export function verifyMasterPasscode(input: string): boolean {
  return toEnglishDigits(input || '').trim() === MASTER_PASSCODE;
}

export type MasterPaymentFilter = 'all' | 'unpaid' | 'paid' | 'cash' | 'vodafone_cash';
export type MasterDeliveryFilter = 'all' | 'undelivered' | 'delivered';
export type MasterPurchaseFilter = 'all' | 'unpurchased' | 'purchased';

export interface MasterOrderFilters {
  roomNumber: string; // 'all' or 'غرفة 404' .. 'غرفة 410'
  paymentFilter: MasterPaymentFilter;
  deliveryFilter: MasterDeliveryFilter;
  purchaseFilter: MasterPurchaseFilter;
  searchQuery?: string;
}

/**
 * Filters raw orders according to the Supervisor's active filters:
 * 1. Room filter (غرفة 404–410)
 * 2. Payment status / method filter (لسه مدفعش / خالص / كاش / فودافون كاش)
 * 3. Delivery status filter (لسه مستلمش / استلم حاجته)
 * 4. Store purchase filter (نواقص لسه متجابش / تم شراؤه)
 * 5. Search query by student name, item name, or room
 */
export function filterOrdersForMaster(
  orders: RoommateOrderItem[],
  filters: MasterOrderFilters
): RoommateOrderItem[] {
  const cleanSearch = (filters.searchQuery || '').trim().toLowerCase();
  const normalizedSearch = cleanSearch ? normalizeArabicItemName(cleanSearch) : '';

  return orders.filter((order) => {
    if (filters.roomNumber && filters.roomNumber !== 'all') {
      if (order.roomNumber !== filters.roomNumber) return false;
    }

    if (filters.paymentFilter === 'unpaid' && order.isPaid) return false;
    if (filters.paymentFilter === 'paid' && !order.isPaid) return false;
    if (filters.paymentFilter === 'cash' && order.paymentMethod !== 'cash') return false;
    if (filters.paymentFilter === 'vodafone_cash' && order.paymentMethod === 'cash') return false;

    if (filters.deliveryFilter === 'undelivered' && order.isDelivered) return false;
    if (filters.deliveryFilter === 'delivered' && !order.isDelivered) return false;

    if (filters.purchaseFilter === 'unpurchased' && order.isPurchased) return false;
    if (filters.purchaseFilter === 'purchased' && !order.isPurchased) return false;

    if (cleanSearch) {
      const nameMatch = order.roommateName.toLowerCase().includes(cleanSearch);
      const roomMatch = order.roomNumber.toLowerCase().includes(cleanSearch);
      const rawItemMatch = order.itemName.toLowerCase().includes(cleanSearch);
      const normItemMatch =
        normalizedSearch.length > 0 &&
        (order.normalizedItemKey || normalizeArabicItemName(order.itemName)).includes(
          normalizedSearch
        );
      if (!nameMatch && !roomMatch && !rawItemMatch && !normItemMatch) {
        return false;
      }
    }

    return true;
  });
}


