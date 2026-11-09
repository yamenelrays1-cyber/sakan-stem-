import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { RoommateOrderItem, SessionStatus } from '../types/orders';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const DEFAULT_HOUSE_ID = 'stem_elarish_house_404_410';
export const DEFAULT_SESSION_ID = 'sakan_orders_2026_clean_v5';
export const DEFAULT_JOIN_CODE = '404410';
export const SUPERVISOR_JOIN_CODE = '0902';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Notice:', JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

/**
 * Ensures every user has a unique Firebase Authentication identity (UID)
 * using Firebase Anonymous Authentication if not already signed in.
 */
export async function ensureFirebaseAnonymousIdentity(): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.warn('Firebase Anonymous Auth notice:', error);
    return auth.currentUser;
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Ensures the authenticated user is registered as a verified member of the house
 * and that the house + active session documents exist in Firestore so onSnapshot and writes work immediately.
 */
export async function ensureHouseMembershipInFirestore(params: {
  houseId?: string;
  sessionId?: string;
  personName?: string;
  roomNumber?: string;
  isSupervisor?: boolean;
}): Promise<void> {
  const user = auth.currentUser || (await ensureFirebaseAnonymousIdentity());
  if (!user) return;
  const houseId = params.houseId || DEFAULT_HOUSE_ID;
  const sessionId = params.sessionId || DEFAULT_SESSION_ID;
  const housePath = `houses/${houseId}`;
  const memberPath = `houses/${houseId}/members/${user.uid}`;
  const sessionPath = `houses/${houseId}/sessions/${sessionId}`;

  const rawName = (params.personName || user.displayName || 'طالب السكن').trim().slice(0, 60);
  const safePersonName = rawName.length >= 2 ? rawName : 'طالب السكن';
  const rawRoom = (params.roomNumber || 'غرفة 404').trim().slice(0, 30);
  const safeRoomNumber = rawRoom.length >= 1 ? rawRoom : 'غرفة 404';
  const targetJoinCode = params.isSupervisor ? SUPERVISOR_JOIN_CODE : DEFAULT_JOIN_CODE;

  // 1. Register user in /houses/{houseId}/members/{user.uid} FIRST so isHouseMember(houseId) is immediately true
  try {
    const memberRef = doc(db, 'houses', houseId, 'members', user.uid);
    const existingMember = await getDoc(memberRef);
    if (!existingMember.exists()) {
      await setDoc(memberRef, {
        uid: user.uid,
        houseId,
        personName: safePersonName,
        roomNumber: safeRoomNumber,
        joinCode: targetJoinCode,
        joinedAt: serverTimestamp(),
      });
    } else {
      const data = existingMember.data();
      const nextJoinCode =
        params.isSupervisor || data.joinCode === SUPERVISOR_JOIN_CODE
          ? SUPERVISOR_JOIN_CODE
          : DEFAULT_JOIN_CODE;
      if (
        data.personName !== safePersonName ||
        data.roomNumber !== safeRoomNumber ||
        data.joinCode !== nextJoinCode
      ) {
        await updateDoc(memberRef, {
          personName: safePersonName,
          roomNumber: safeRoomNumber,
          joinCode: nextJoinCode,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, memberPath);
  }

  // 2. Ensure house document exists now that user is a registered member
  try {
    const houseRef = doc(db, 'houses', houseId);
    const houseSnap = await getDoc(houseRef);
    if (!houseSnap.exists()) {
      await setDoc(houseRef, {
        name: 'سكن STEM العريش (404 - 410)',
        joinCode: DEFAULT_JOIN_CODE,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, housePath);
  }

  // 3. Ensure active session document exists
  try {
    const sessionRef = doc(db, 'houses', houseId, 'sessions', sessionId);
    const existingSession = await getDoc(sessionRef);
    if (!existingSession.exists()) {
      await setDoc(sessionRef, {
        houseId,
        ownerId: user.uid,
        restaurant: 'طلبات السكن العامة',
        status: 'open',
        deliveryFee: 5,
        isDeliveryEnabled: false,
        isSyrianMenuEnabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, sessionPath);
  }
}

/**
 * Subscribes in real time (onSnapshot) to both the session status and all items in the session.
 */
export function subscribeToHouseSessionRealtime(params: {
  houseId?: string;
  sessionId?: string;
  onSessionUpdate: (data: {
    status: SessionStatus;
    deliveryFee: number;
    isDeliveryEnabled: boolean;
    isSyrianMenuEnabled: boolean;
  }) => void;
  onItemsUpdate: (items: RoommateOrderItem[]) => void;
}): Unsubscribe {
  const houseId = params.houseId || DEFAULT_HOUSE_ID;
  const sessionId = params.sessionId || DEFAULT_SESSION_ID;
  const sessionDocPath = `houses/${houseId}/sessions/${sessionId}`;
  const itemsColPath = `houses/${houseId}/sessions/${sessionId}/items`;

  const unsubSession = onSnapshot(
    doc(db, 'houses', houseId, 'sessions', sessionId),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      const rawStatus = d.status as string;
      const status: SessionStatus =
        rawStatus === 'sent' || rawStatus === 'arrived' ? rawStatus : 'open';
      params.onSessionUpdate({
        status,
        deliveryFee: typeof d.deliveryFee === 'number' ? d.deliveryFee : 5,
        isDeliveryEnabled: Boolean(d.isDeliveryEnabled),
        isSyrianMenuEnabled: Boolean(d.isSyrianMenuEnabled),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, sessionDocPath);
    }
  );

  const q = query(
    collection(db, 'houses', houseId, 'sessions', sessionId, 'items'),
    where('houseId', '==', houseId),
    where('sessionId', '==', sessionId)
  );

  const unsubItems = onSnapshot(
    q,
    (snap) => {
      const mapped: RoommateOrderItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdIso =
          d.createdAt && typeof d.createdAt.toDate === 'function'
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString();
        const updatedIso =
          d.updatedAt && typeof d.updatedAt.toDate === 'function'
            ? d.updatedAt.toDate().toISOString()
            : createdIso;
        return {
          id: docSnap.id,
          deviceId: String(d.deviceId || ''),
          sessionId,
          sessionOwnerId: String(d.authorUid || ''),
          authorUid: String(d.authorUid || ''),
          memberUids: [String(d.authorUid || '')],
          roommateName: String(d.person || ''),
          roomNumber: String(d.roomNumber || ''),
          itemName: String(d.name || ''),
          normalizedItemKey: String(d.normalizedItemKey || ''),
          category: (d.category as RoommateOrderItem['category']) || 'snacks',
          quantity: Number(d.qty) || 1,
          unitPrice: Number(d.price) || 1,
          paymentMethod: (d.paymentMethod as RoommateOrderItem['paymentMethod']) || 'cash',
          cashPaidAmount: Number(d.cashPaidAmount) || 0,
          isPaid: Boolean(d.isPaid),
          isPurchased: Boolean(d.isPurchased),
          isDelivered: Boolean(d.isDelivered),
          notes: String(d.notes || ''),
          createdAt: createdIso,
          updatedAt: updatedIso,
        };
      });
      params.onItemsUpdate(mapped);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, itemsColPath);
    }
  );

  return () => {
    unsubSession();
    unsubItems();
  };
}

/**
 * Creates a new order item in Firestore `/houses/{houseId}/sessions/{sessionId}/items/{itemId}`.
 */
export async function saveOrderItemToFirestore(order: RoommateOrderItem): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const houseId = DEFAULT_HOUSE_ID;
  const sessionId = DEFAULT_SESSION_ID;
  const itemPath = `houses/${houseId}/sessions/${sessionId}/items/${order.id}`;

  try {
    await setDoc(doc(db, 'houses', houseId, 'sessions', sessionId, 'items', order.id), {
      houseId,
      sessionId,
      deviceId: (order.deviceId || 'unknown_device').slice(0, 160),
      authorUid: user.uid,
      person: order.roommateName.slice(0, 60),
      roomNumber: order.roomNumber.slice(0, 30),
      name: order.itemName.slice(0, 100),
      normalizedItemKey: order.normalizedItemKey.slice(0, 100),
      category: order.category,
      qty: Math.max(1, Math.min(100, Math.round(order.quantity))),
      price: Math.max(0.5, Math.min(10000, Number(order.unitPrice))),
      paymentMethod: order.paymentMethod,
      cashPaidAmount: Math.max(0, Math.min(50000, Number(order.cashPaidAmount) || 0)),
      isPaid: false,
      isPurchased: false,
      isDelivered: false,
      notes: (order.notes || '').slice(0, 160),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, itemPath);
  }
}

/**
 * Updates an order item's quantity or payment fields in Firestore.
 */
export async function updateOrderItemStudentFieldsInFirestore(
  orderId: string,
  updates: {
    qty?: number;
    notes?: string;
    paymentMethod?: RoommateOrderItem['paymentMethod'];
    cashPaidAmount?: number;
  }
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const houseId = DEFAULT_HOUSE_ID;
  const sessionId = DEFAULT_SESSION_ID;
  const itemPath = `houses/${houseId}/sessions/${sessionId}/items/${orderId}`;

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.qty === 'number') {
    payload.qty = Math.max(1, Math.min(100, Math.round(updates.qty)));
  }
  if (typeof updates.notes === 'string') {
    payload.notes = updates.notes.slice(0, 160);
  }
  if (updates.paymentMethod) {
    payload.paymentMethod = updates.paymentMethod;
  }
  if (typeof updates.cashPaidAmount === 'number') {
    payload.cashPaidAmount = Math.max(0, Math.min(50000, Number(updates.cashPaidAmount) || 0));
  }

  try {
    await updateDoc(doc(db, 'houses', houseId, 'sessions', sessionId, 'items', orderId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, itemPath);
  }
}

/**
 * Updates supervisor-only fields (isPaid, isPurchased, isDelivered, cashPaidAmount) on an item in Firestore.
 */
export async function updateOrderItemSupervisorFieldsInFirestore(
  orderId: string,
  updates: {
    isPaid?: boolean;
    isPurchased?: boolean;
    isDelivered?: boolean;
    cashPaidAmount?: number;
  }
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const houseId = DEFAULT_HOUSE_ID;
  const sessionId = DEFAULT_SESSION_ID;
  const itemPath = `houses/${houseId}/sessions/${sessionId}/items/${orderId}`;

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.isPaid === 'boolean') payload.isPaid = updates.isPaid;
  if (typeof updates.isPurchased === 'boolean') payload.isPurchased = updates.isPurchased;
  if (typeof updates.isDelivered === 'boolean') payload.isDelivered = updates.isDelivered;
  if (typeof updates.cashPaidAmount === 'number') {
    payload.cashPaidAmount = Math.max(0, Math.min(50000, Number(updates.cashPaidAmount) || 0));
  }

  try {
    await updateDoc(doc(db, 'houses', houseId, 'sessions', sessionId, 'items', orderId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, itemPath);
  }
}

/**
 * Deletes an order item from Firestore.
 */
export async function deleteOrderItemFromFirestore(orderId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const houseId = DEFAULT_HOUSE_ID;
  const sessionId = DEFAULT_SESSION_ID;
  const itemPath = `houses/${houseId}/sessions/${sessionId}/items/${orderId}`;

  try {
    await deleteDoc(doc(db, 'houses', houseId, 'sessions', sessionId, 'items', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, itemPath);
  }
}

/**
 * Updates session status ('open' | 'sent' | 'arrived') in Firestore.
 */
export async function updateSessionStatusInFirestore(nextStatus: SessionStatus): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const houseId = DEFAULT_HOUSE_ID;
  const sessionId = DEFAULT_SESSION_ID;
  const sessionPath = `houses/${houseId}/sessions/${sessionId}`;

  try {
    await updateDoc(doc(db, 'houses', houseId, 'sessions', sessionId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, sessionPath);
  }
}

/**
 * Updates session delivery/Syrian menu settings in Firestore.
 */
export async function updateSessionConfigInFirestore(updates: {
  restaurant?: string;
  deliveryFee?: number;
  isDeliveryEnabled?: boolean;
  isSyrianMenuEnabled?: boolean;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const houseId = DEFAULT_HOUSE_ID;
  const sessionId = DEFAULT_SESSION_ID;
  const sessionPath = `houses/${houseId}/sessions/${sessionId}`;

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.restaurant === 'string') payload.restaurant = updates.restaurant;
  if (typeof updates.deliveryFee === 'number') payload.deliveryFee = updates.deliveryFee;
  if (typeof updates.isDeliveryEnabled === 'boolean') {
    payload.isDeliveryEnabled = updates.isDeliveryEnabled;
  }
  if (typeof updates.isSyrianMenuEnabled === 'boolean') {
    payload.isSyrianMenuEnabled = updates.isSyrianMenuEnabled;
  }

  try {
    await updateDoc(doc(db, 'houses', houseId, 'sessions', sessionId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, sessionPath);
  }
}

export {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onAuthStateChanged,
  type User,
};
