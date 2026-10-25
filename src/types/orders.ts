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
