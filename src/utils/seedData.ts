import type { OrderSession, RoommateOrderItem } from '../types/orders.ts';
import { normalizeArabicItemName } from './orderAggregator.ts';

export const INITIAL_DEMO_SESSION: OrderSession = {
  id: 'sakan_default_session',
  title: 'طلبات السكن',
  storeName: 'أوردر السكن',
  masterName: 'المشرف',
  roomCode: 'SAKAN',
  deliveryFee: 0,
  status: 'open',
  ownerId: 'demo_owner_1',
  memberUids: ['demo_owner_1'],
  createdAt: '2026-10-18T13:30:00.000Z',
  updatedAt: '2026-10-18T13:55:00.000Z',
};

export const INITIAL_DEMO_ORDERS: RoommateOrderItem[] = [];

