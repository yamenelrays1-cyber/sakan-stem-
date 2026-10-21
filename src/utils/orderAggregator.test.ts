import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArabicItemName,
  aggregateOrdersForMaster,
  calculateRoommateSummaries,
  calculateSessionFinancials,
  validateOrderItemInput,
} from './orderAggregator.ts';
import { DORM_ROOMS, type RoommateOrderItem } from '../types/orders.ts';

function createMockOrder(overrides: Partial<RoommateOrderItem>): RoommateOrderItem {
  const itemName = overrides.itemName ?? 'شيبسي';
  return {
    id: overrides.id ?? 'ord_1',
    sessionId: 'session_1',
    sessionOwnerId: 'user_1',
    authorUid: 'user_1',
    memberUids: ['user_1'],
    roommateName: overrides.roommateName ?? 'أحمد',
    roomNumber: overrides.roomNumber ?? 'غرفة 404',
    itemName,
    normalizedItemKey: overrides.normalizedItemKey ?? normalizeArabicItemName(itemName),
    category: overrides.category ?? 'snacks',
    quantity: overrides.quantity ?? 1,
    unitPrice: overrides.unitPrice ?? 15,
    paymentMethod: overrides.paymentMethod ?? 'cash',
    cashPaidAmount: overrides.cashPaidAmount ?? 15,
    isPaid: overrides.isPaid ?? true,
    isPurchased: overrides.isPurchased ?? false,
    isDelivered: overrides.isDelivered ?? false,
    notes: overrides.notes ?? '',
    createdAt: '2026-10-18T14:00:00Z',
    updatedAt: '2026-10-18T14:00:00Z',
  };
}

test('DORM_ROOMS starts at 404 and ends at 410 (no 411)', () => {
  assert.equal(DORM_ROOMS.length, 7);
  assert.equal(DORM_ROOMS[0], 'غرفة 404');
  assert.equal(DORM_ROOMS[DORM_ROOMS.length - 1], 'غرفة 410');
  assert.equal((DORM_ROOMS as readonly string[]).includes('غرفة 411'), false);
});

test('normalizeArabicItemName unifies شيبسي, شبسي, and شيبي into a single key', () => {
  const k1 = normalizeArabicItemName('شيبسي');
  const k2 = normalizeArabicItemName('شبسي');
  const k3 = normalizeArabicItemName('شيبي');
  const k4 = normalizeArabicItemName('  شيبسى  ');

  assert.equal(k1, 'شيبسي');
  assert.equal(k2, 'شيبسي');
  assert.equal(k3, 'شيبسي');
  assert.equal(k4, 'شيبسي');
});

test('aggregateOrdersForMaster sums 1 شيبسي + 1 شبسي + 3 شيبي into 5 شيبسي for the Master', () => {
  const orders: RoommateOrderItem[] = [
    createMockOrder({ id: '1', roommateName: 'أحمد', roomNumber: 'غرفة 404', itemName: 'شيبسي', quantity: 1, unitPrice: 15 }),
    createMockOrder({ id: '2', roommateName: 'محمد', roomNumber: 'غرفة 406', itemName: 'شبسي', quantity: 1, unitPrice: 15 }),
    createMockOrder({ id: '3', roommateName: 'كريم', roomNumber: 'غرفة 410', itemName: 'شيبي', quantity: 3, unitPrice: 15 }),
  ];

  const masterList = aggregateOrdersForMaster(orders);
  assert.equal(masterList.length, 1);
  assert.equal(masterList[0].displayName, 'شيبسي');
  assert.equal(masterList[0].totalQuantity, 5);
  assert.equal(masterList[0].totalCost, 75);
  assert.equal(masterList[0].requesters.length, 3);
});

test('calculateRoommateSummaries keeps cash orders unpaid (not خالص) until Master marks isPaid=true', () => {
  const orders: RoommateOrderItem[] = [
    createMockOrder({
      id: '1',
      roommateName: 'أحمد',
      roomNumber: 'غرفة 404',
      itemName: 'شيبسي',
      quantity: 2,
      unitPrice: 15,
      paymentMethod: 'cash',
      cashPaidAmount: 50,
      isPaid: false, // Student ordered from room, Master hasn't collected money yet
    }),
    createMockOrder({
      id: '2',
      roommateName: 'عمر',
      roomNumber: 'غرفة 407',
      itemName: 'شيبي',
      quantity: 3,
      unitPrice: 15,
      paymentMethod: 'cash',
      cashPaidAmount: 45,
      isPaid: true, // Master already collected money and settled
    }),
  ];

  const summaries = calculateRoommateSummaries(orders, 0);
  assert.equal(summaries.length, 2);

  const ahmed = summaries.find((s) => s.roommateName === 'أحمد')!;
  assert.equal(ahmed.totalRequired, 30);
  assert.equal(ahmed.cashPaidAmount, 50);
  assert.equal(ahmed.changeDue, 20);
  assert.equal(ahmed.remainingUnpaid, 30);
  assert.equal(ahmed.isFullyPaid, false);

  const omar = summaries.find((s) => s.roommateName === 'عمر')!;
  assert.equal(omar.totalRequired, 45);
  assert.equal(omar.changeDue, 0);
  assert.equal(omar.remainingUnpaid, 0);
  assert.equal(omar.isFullyPaid, true);

  const financials = calculateSessionFinancials(orders, 0);
  assert.equal(financials.totalUnits, 5);
  assert.equal(financials.distinctItemsCount, 1);
  assert.equal(financials.grandTotal, 75);
  assert.equal(financials.totalCashCollected, 45);
  assert.equal(financials.totalChangeToReturn, 20);
  assert.equal(financials.cashShortfall, 30);
});

test('validateOrderItemInput requires choosing a room (rejects empty roomNumber) and rejects invalid rooms like 411', () => {
  const emptyRoom = validateOrderItemInput({
    roommateName: 'ياسين',
    roomNumber: '',
    itemName: 'شيبسي',
    category: 'snacks',
    quantity: 1,
    unitPrice: 15,
    paymentMethod: 'cash',
    cashPaidAmount: 15,
    notes: '',
  });
  assert.equal(emptyRoom.valid, false);

  const invalidRoom411 = validateOrderItemInput({
    roommateName: 'ياسين',
    roomNumber: 'غرفة 411',
    itemName: 'شيبسي',
    category: 'snacks',
    quantity: 2,
    unitPrice: 15,
    paymentMethod: 'cash',
    cashPaidAmount: 30,
    notes: '',
  });
  assert.equal(invalidRoom411.valid, false);

  const validRoom410 = validateOrderItemInput({
    roommateName: 'ياسين',
    roomNumber: 'غرفة 410',
    itemName: 'شيبي',
    category: 'snacks',
    quantity: 3,
    unitPrice: 15,
    paymentMethod: 'cash',
    cashPaidAmount: 50,
    notes: 'ملح وخل',
  });
  assert.equal(validRoom410.valid, true);
  assert.equal(validRoom410.sanitized?.roomNumber, 'غرفة 410');
  assert.equal(validRoom410.sanitized?.normalizedItemKey, 'شيبسي');
  assert.equal(validRoom410.sanitized?.cashPaidAmount, 50);
});

test('verifyMasterPasscode accepts only 0902', async () => {
  const { verifyMasterPasscode } = await import('./orderAggregator.ts');
  assert.equal(verifyMasterPasscode('0902'), true);
  assert.equal(verifyMasterPasscode(' 0902 '), true);
  assert.equal(verifyMasterPasscode('0000'), false);
  assert.equal(verifyMasterPasscode(''), false);
});

test('MQTT topic helpers format sakan_app/{roomCode}/orders/{orderId} and wildcard correctly', async () => {
  const { getOrderTopic, getOrdersWildcardTopic, DEFAULT_ROOM_CODE } = await import('../lib/mqttSync.ts');
  assert.equal(DEFAULT_ROOM_CODE, 'sakan-orders-2026-v3');
  assert.equal(
    getOrderTopic('sakan-orders-2026-v3', 'ord_123'),
    'sakan_app/sakan-orders-2026-v3/orders/ord_123'
  );
  assert.equal(
    getOrdersWildcardTopic('sakan-orders-2026-v3'),
    'sakan_app/sakan-orders-2026-v3/orders/+'
  );
});

test('triggerSupervisorLockNotification creates distinct Arabic payloads for المشرف lock and unlock', async () => {
  const { triggerSupervisorLockNotification } = await import('./supervisorNotifications.ts');
  const lockPayload = triggerSupervisorLockNotification(true);
  assert.ok(lockPayload);
  assert.equal(lockPayload?.locked, true);
  assert.equal(lockPayload?.title.includes('المشرف'), true);
  assert.equal(lockPayload?.title.includes('قفل الطلبات'), true);

  const unlockPayload = triggerSupervisorLockNotification(false);
  assert.ok(unlockPayload);
  assert.equal(unlockPayload?.locked, false);
  assert.equal(unlockPayload?.title.includes('المشرف'), true);
  assert.equal(unlockPayload?.title.includes('فتح الطلبات'), true);
});

test('filterOrdersForMaster filters by room, payment, delivery, store purchase, and search query', async () => {
  const { filterOrdersForMaster } = await import('./orderAggregator.ts');
  const sampleOrders: RoommateOrderItem[] = [
    createMockOrder({
      id: 'o1',
      roommateName: 'أحمد',
      roomNumber: 'غرفة 404',
      itemName: 'شيبسي',
      paymentMethod: 'cash',
      isPaid: false,
      isDelivered: false,
      isPurchased: false,
    }),
    createMockOrder({
      id: 'o2',
      roommateName: 'محمود',
      roomNumber: 'غرفة 407',
      itemName: 'بيبسي',
      paymentMethod: 'wallet',
      isPaid: true,
      isDelivered: true,
      isPurchased: true,
    }),
  ];

  // 1. Filter by room 404
  const room404 = filterOrdersForMaster(sampleOrders, {
    roomNumber: 'غرفة 404',
    paymentFilter: 'all',
    deliveryFilter: 'all',
    purchaseFilter: 'all',
  });
  assert.equal(room404.length, 1);
  assert.equal(room404[0].id, 'o1');

  // 2. Filter by unpaid
  const unpaid = filterOrdersForMaster(sampleOrders, {
    roomNumber: 'all',
    paymentFilter: 'unpaid',
    deliveryFilter: 'all',
    purchaseFilter: 'all',
  });
  assert.equal(unpaid.length, 1);
  assert.equal(unpaid[0].id, 'o1');

  // 3. Filter by undelivered
  const undelivered = filterOrdersForMaster(sampleOrders, {
    roomNumber: 'all',
    paymentFilter: 'all',
    deliveryFilter: 'undelivered',
    purchaseFilter: 'all',
  });
  assert.equal(undelivered.length, 1);
  assert.equal(undelivered[0].id, 'o1');

  // 4. Filter by unpurchased
  const unpurchased = filterOrdersForMaster(sampleOrders, {
    roomNumber: 'all',
    paymentFilter: 'all',
    deliveryFilter: 'all',
    purchaseFilter: 'unpurchased',
  });
  assert.equal(unpurchased.length, 1);
  assert.equal(unpurchased[0].id, 'o1');

  // 5. Filter by search query (normalized alias 'شبسي')
  const searchAlias = filterOrdersForMaster(sampleOrders, {
    roomNumber: 'all',
    paymentFilter: 'all',
    deliveryFilter: 'all',
    purchaseFilter: 'all',
    searchQuery: 'شبسي',
  });
  assert.equal(searchAlias.length, 1);
  assert.equal(searchAlias[0].id, 'o1');
});



