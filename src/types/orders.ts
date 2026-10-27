export type OrderCategory = 'snacks' | 'meals' | 'drinks' | 'groceries' | 'other';
export type PaymentMethod = 'cash' | 'instapay' | 'wallet';
export type SessionStatus = 'open' | 'ordering' | 'completed';

export const DORM_ROOMS = [
  'غرفة 404',
  'غرفة 405',
  'غرفة 406',
  'غرفة 407',
  'غرفة 408',
  'غرفة 409',
  'غرفة 410',
] as const;

export type DormRoom = (typeof DORM_ROOMS)[number];

export interface OrderSession {
  id: string;
  title: string;
  storeName: string;
  masterName: string;
  roomCode: string;
  deliveryFee: number;
  status: SessionStatus;
  ownerId: string;
  memberUids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RoommateOrderItem {
  id: string;
  deviceId?: string;
  sessionId: string;
  sessionOwnerId: string;
  authorUid: string;
  memberUids: string[];
  roommateName: string;
  roomNumber: string;
  itemName: string;
  normalizedItemKey: string;
  category: OrderCategory;
  quantity: number;
  unitPrice: number;
  paymentMethod: PaymentMethod;
  cashPaidAmount: number;
  isPaid: boolean;
  isPurchased: boolean;
  isDelivered?: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AggregatedRequester {
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

export interface MasterItemPriceTier {
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface MasterAggregatedItem {
  normalizedKey: string;
  displayName: string;
  category: OrderCategory;
  totalQuantity: number;
  purchasedQuantity: number;
  unitPrice: number;
  hasMixedUnitPrices: boolean;
  priceBreakdown: MasterItemPriceTier[];
  totalCost: number;
  allPurchased: boolean;
  requesters: AggregatedRequester[];
  combinedNotes: string[];
}

export interface RoommateFinancialSummary {
  roommateName: string;
  roomNumber: string;
  orderIds: string[];
  itemsCount: number;
  itemsSubtotal: number;
  deliveryShare: number;
  totalRequired: number;
  paymentMethod: PaymentMethod;
  cashPaidAmount: number;
  changeDue: number;
  remainingUnpaid: number;
  isFullyPaid: boolean;
  isDelivered: boolean;
  items: RoommateOrderItem[];
}

export interface SessionFinancialSummary {
  totalUnits: number;
  distinctItemsCount: number;
  purchasedUnits: number;
  itemsSubtotal: number;
  deliveryFee: number;
  grandTotal: number;
  totalCashOrdersAmount: number;
  totalDigitalOrdersAmount: number;
  totalCashCollected: number;
  totalChangeToReturn: number;
  cashShortfall: number;
}

export interface SyrianMenuOption {
  id: string;
  groupTitle: string;
  baseName: string;
  sizeBadge?: 'M' | 'L';
  sizeLabelAr?: 'وسط' | 'كبير';
  itemName: string;
  unitPrice: number;
  section: 'sandwiches' | 'sauces_extras';
}

export const SYRIAN_SANDWICHES_MENU: readonly SyrianMenuOption[] = [
  {
    id: 'fries_m',
    groupTitle: 'بطاطس',
    baseName: 'بطاطس',
    sizeBadge: 'M',
    sizeLabelAr: 'وسط',
    itemName: 'بطاطس وسط',
    unitPrice: 25,
    section: 'sandwiches',
  },
  {
    id: 'fries_l',
    groupTitle: 'بطاطس',
    baseName: 'بطاطس',
    sizeBadge: 'L',
    sizeLabelAr: 'كبير',
    itemName: 'بطاطس كبير',
    unitPrice: 30,
    section: 'sandwiches',
  },
  {
    id: 'fries_mozzarella_m',
    groupTitle: 'بطاطس موتزريلا',
    baseName: 'بطاطس موتزريلا',
    sizeBadge: 'M',
    sizeLabelAr: 'وسط',
    itemName: 'بطاطس موتزريلا وسط',
    unitPrice: 35,
    section: 'sandwiches',
  },
  {
    id: 'fries_mozzarella_l',
    groupTitle: 'بطاطس موتزريلا',
    baseName: 'بطاطس موتزريلا',
    sizeBadge: 'L',
    sizeLabelAr: 'كبير',
    itemName: 'بطاطس موتزريلا كبير',
    unitPrice: 40,
    section: 'sandwiches',
  },
  {
    id: 'fries_packet_m',
    groupTitle: 'بطاطس باكت',
    baseName: 'بطاطس باكت',
    sizeBadge: 'M',
    sizeLabelAr: 'وسط',
    itemName: 'بطاطس باكت وسط',
    unitPrice: 30,
    section: 'sandwiches',
  },
  {
    id: 'fries_packet_l',
    groupTitle: 'بطاطس باكت',
    baseName: 'بطاطس باكت',
    sizeBadge: 'L',
    sizeLabelAr: 'كبير',
    itemName: 'بطاطس باكت كبير',
    unitPrice: 40,
    section: 'sandwiches',
  },
  {
    id: 'toumia_m',
    groupTitle: 'تومية',
    baseName: 'تومية',
    sizeBadge: 'M',
    sizeLabelAr: 'وسط',
    itemName: 'تومية وسط',
    unitPrice: 5,
    section: 'sauces_extras',
  },
  {
    id: 'toumia_l',
    groupTitle: 'تومية',
    baseName: 'تومية',
    sizeBadge: 'L',
    sizeLabelAr: 'كبير',
    itemName: 'تومية كبير',
    unitPrice: 10,
    section: 'sauces_extras',
  },
  {
    id: 'sauce_texas',
    groupTitle: 'صوص تكساس',
    baseName: 'صوص تكساس',
    itemName: 'صوص تكساس',
    unitPrice: 15,
    section: 'sauces_extras',
  },
  {
    id: 'sauce_cheddar',
    groupTitle: 'صوص شيدر',
    baseName: 'صوص شيدر',
    itemName: 'صوص شيدر',
    unitPrice: 15,
    section: 'sauces_extras',
  },
] as const;

