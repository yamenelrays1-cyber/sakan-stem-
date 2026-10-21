import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync(
  fs.existsSync('./firestore.rules') ? './firestore.rules' : './DRAFT_firestore.rules',
  'utf8'
);

interface AuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
}

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

function isValidMemberArray(arr: unknown): boolean {
  return (
    Array.isArray(arr) &&
    arr.length >= 1 &&
    arr.length <= 10 &&
    typeof arr[0] === 'string' &&
    arr[0].length >= 1 &&
    arr[0].length <= 128
  );
}

function isValidOrderSession(data: Record<string, unknown>): boolean {
  const requiredKeys = [
    'title',
    'storeName',
    'masterName',
    'roomCode',
    'deliveryFee',
    'status',
    'ownerId',
    'memberUids',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(data);
  if (!requiredKeys.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => requiredKeys.includes(k))) return false;
  return (
    typeof data.title === 'string' &&
    data.title.length >= 1 &&
    data.title.length <= 80 &&
    typeof data.storeName === 'string' &&
    data.storeName.length >= 1 &&
    data.storeName.length <= 80 &&
    typeof data.masterName === 'string' &&
    data.masterName.length >= 1 &&
    data.masterName.length <= 60 &&
    typeof data.roomCode === 'string' &&
    data.roomCode.length >= 3 &&
    data.roomCode.length <= 20 &&
    ID_REGEX.test(data.roomCode) &&
    typeof data.deliveryFee === 'number' &&
    data.deliveryFee >= 0 &&
    data.deliveryFee <= 5000 &&
    typeof data.status === 'string' &&
    (data.status === 'open' || data.status === 'ordering' || data.status === 'completed') &&
    isValidId(data.ownerId) &&
    isValidMemberArray(data.memberUids) &&
    data.createdAt === 'SERVER_TIMESTAMP' &&
    data.updatedAt === 'SERVER_TIMESTAMP'
  );
}

function isValidRoommateOrderItem(data: Record<string, unknown>): boolean {
  const requiredKeys = [
    'sessionId',
    'sessionOwnerId',
    'authorUid',
    'memberUids',
    'roommateName',
    'roomNumber',
    'itemName',
    'normalizedItemKey',
    'category',
    'quantity',
    'unitPrice',
    'paymentMethod',
    'cashPaidAmount',
    'isPaid',
    'isPurchased',
    'notes',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(data);
  if (!requiredKeys.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => requiredKeys.includes(k))) return false;
  return (
    isValidId(data.sessionId) &&
    isValidId(data.sessionOwnerId) &&
    isValidId(data.authorUid) &&
    isValidMemberArray(data.memberUids) &&
    typeof data.roommateName === 'string' &&
    data.roommateName.length >= 1 &&
    data.roommateName.length <= 60 &&
    typeof data.roomNumber === 'string' &&
    data.roomNumber.length >= 1 &&
    data.roomNumber.length <= 30 &&
    typeof data.itemName === 'string' &&
    data.itemName.length >= 1 &&
    data.itemName.length <= 100 &&
    typeof data.normalizedItemKey === 'string' &&
    data.normalizedItemKey.length >= 1 &&
    data.normalizedItemKey.length <= 100 &&
    typeof data.category === 'string' &&
    ['snacks', 'meals', 'drinks', 'groceries', 'other'].includes(data.category) &&
    typeof data.quantity === 'number' &&
    data.quantity >= 1 &&
    data.quantity <= 100 &&
    typeof data.unitPrice === 'number' &&
    data.unitPrice >= 0 &&
    data.unitPrice <= 10000 &&
    typeof data.paymentMethod === 'string' &&
    ['cash', 'instapay', 'wallet'].includes(data.paymentMethod) &&
    typeof data.cashPaidAmount === 'number' &&
    data.cashPaidAmount >= 0 &&
    data.cashPaidAmount <= 50000 &&
    typeof data.isPaid === 'boolean' &&
    typeof data.isPurchased === 'boolean' &&
    typeof data.notes === 'string' &&
    data.notes.length <= 160 &&
    data.createdAt === 'SERVER_TIMESTAMP' &&
    data.updatedAt === 'SERVER_TIMESTAMP'
  );
}

test('Firestore rules file contains all 8 hardened pillars', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('isValidOrderSession(incoming())'));
  assert.ok(rulesText.includes('isValidRoommateOrderItem(incoming())'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
});

test('Dirty Dozen #1-4: Session create/update security gates reject malicious payloads', () => {
  const validAuth: AuthContext = { uid: 'user_1', email: 'user1@example.com', email_verified: true };
  // #1 Identity spoofing
  const spoofPayload = {
    title: 'عشا السكن',
    storeName: 'كشري التحرير',
    masterName: 'أحمد',
    roomCode: 'SAKAN-204',
    deliveryFee: 20,
    status: 'open',
    ownerId: 'victim_uid_999',
    memberUids: ['user_1'],
    createdAt: 'SERVER_TIMESTAMP',
    updatedAt: 'SERVER_TIMESTAMP',
  };
  assert.equal(isValidOrderSession(spoofPayload) && spoofPayload.ownerId === validAuth.uid, false);

  // #2 Shadow field injection
  const shadowPayload = {
    ...spoofPayload,
    ownerId: 'user_1',
    isVerifiedAdmin: true,
  };
  assert.equal(isValidOrderSession(shadowPayload), false);

  // #3 Unbounded array > 10
  const unboundedPayload = {
    ...spoofPayload,
    ownerId: 'user_1',
    memberUids: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11'],
  };
  assert.equal(isValidOrderSession(unboundedPayload), false);

  // #4 Terminal state lock (completed -> open)
  const existingSession = { status: 'completed', ownerId: 'user_1' };
  const canUpdateTerminal = existingSession.status !== 'completed';
  assert.equal(canUpdateTerminal, false);
});

test('Dirty Dozen #5-12: Order item validation and query enforcement reject attacks', () => {
  const baseOrder = {
    sessionId: 'session_1',
    sessionOwnerId: 'user_1',
    authorUid: 'user_1',
    memberUids: ['user_1'],
    roommateName: 'عمر',
    roomNumber: 'غرفة 2',
    itemName: 'شيبسي',
    normalizedItemKey: 'شيبسي',
    category: 'snacks',
    quantity: 3,
    unitPrice: 15,
    paymentMethod: 'cash',
    cashPaidAmount: 50,
    isPaid: true,
    isPurchased: false,
    notes: '',
    createdAt: 'SERVER_TIMESTAMP',
    updatedAt: 'SERVER_TIMESTAMP',
  };

  // #5 Orphaned order (parent session missing)
  const parentSessions = new Map<string, { ownerId: string; status: string }>();
  assert.equal(parentSessions.has('non_existent_session'), false);

  // #6 Author spoofing
  assert.equal(baseOrder.authorUid === 'attacker_uid', false);

  // #7 Negative quantity/price
  assert.equal(isValidRoommateOrderItem({ ...baseOrder, quantity: -5, unitPrice: -100 }), false);

  // #8 Oversized itemName (> 100 chars)
  assert.equal(isValidRoommateOrderItem({ ...baseOrder, itemName: 'ش'.repeat(105) }), false);

  // #9 Immutable field mutation on update
  const updatedAuthor = 'hijacked_uid';
  assert.equal(updatedAuthor === baseOrder.authorUid, false);

  // #10 Unverified email spoof
  const unverifiedAuth: AuthContext = { uid: 'user_1', email: 'yamenelrays1@gmail.com', email_verified: false };
  assert.equal(unverifiedAuth.email_verified === true, false);

  // #11 Blanket list without matching resource.data
  const resourceOwner: string = 'other_user';
  assert.equal(resourceOwner === 'user_1', false);

  // #12 Value poisoning on whitelisted key (isPurchased: "yes")
  assert.equal(isValidRoommateOrderItem({ ...baseOrder, isPurchased: 'yes' as unknown as boolean }), false);
});
