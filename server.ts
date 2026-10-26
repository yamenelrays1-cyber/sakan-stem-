import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import type { RoommateOrderItem } from './src/types/orders.ts';
import {
  MASTER_PASSCODE,
  normalizeArabicItemName,
  validateOrderItemInput,
  canUserModifyOrder,
} from './src/utils/orderAggregator.ts';
import {
  sanitizeTextInput,
  validateEmailInput,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  evaluateAttemptRateLimit,
} from './src/utils/emailOtpService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const LOCK_FILE = path.join(DATA_DIR, 'lock.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'delivery.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

function loadPersistedOrders(): RoommateOrderItem[] {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as RoommateOrderItem[];
      }
    }
  } catch {
    // fallback to empty list
  }
  return [];
}

function savePersistedOrders(orders: RoommateOrderItem[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch {
    // ignore disk errors
  }
}

function loadPersistedLockState(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.locked);
    }
  } catch {
    // ignore
  }
  return false;
}

function savePersistedLockState(locked: boolean): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ locked }, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function loadPersistedDeliveryState(): { enabled: boolean; fee: number } {
  try {
    if (fs.existsSync(DELIVERY_FILE)) {
      const raw = fs.readFileSync(DELIVERY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed?.enabled),
        fee: Math.max(0, Math.round((Number(parsed?.fee) || 5) * 100) / 100),
      };
    }
  } catch {
    // ignore
  }
  return { enabled: false, fee: 5 };
}

function savePersistedDeliveryState(enabled: boolean, fee: number): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      DELIVERY_FILE,
      JSON.stringify({ enabled, fee }, null, 2),
      'utf8'
    );
  } catch {
    // ignore
  }
}

let serverOrders: RoommateOrderItem[] = loadPersistedOrders();
let isOrdersLocked: boolean = loadPersistedLockState();
const initialDelivery = loadPersistedDeliveryState();
let isDeliveryEnabled: boolean = initialDelivery.enabled;
let deliveryFee: number = initialDelivery.fee;
const sseClients = new Set<express.Response>();

function loadOrGenerateVapidKeys(): { publicKey: string; privateKey: string } {
  const envPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }
  try {
    if (fs.existsSync(VAPID_FILE)) {
      const raw = fs.readFileSync(VAPID_FILE, 'utf8');
      const parsed = JSON.parse(raw) as { publicKey?: string; privateKey?: string };
      if (parsed?.publicKey && parsed?.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
      }
    }
  } catch {
    // ignore
  }
  const generated = webpush.generateVAPIDKeys();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), 'utf8');
  } catch {
    // ignore
  }
  return generated;
}

const vapidKeys = loadOrGenerateVapidKeys();
try {
  webpush.setVapidDetails(
    'mailto:stem.elarish.sakan@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch {
  // ignore
}

function loadPushSubscriptions(): webpush.PushSubscription[] {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function savePushSubscriptions(subs: webpush.PushSubscription[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

let pushSubscriptions: webpush.PushSubscription[] = loadPushSubscriptions();

function mergeIncomingSubscriptions(rawList: unknown[]): void {
  let changed = false;
  for (const item of rawList) {
    const sub = item as webpush.PushSubscription | undefined;
    if (sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('http') && sub.keys) {
      const existingIdx = pushSubscriptions.findIndex((s) => s.endpoint === sub.endpoint);
      if (existingIdx >= 0) {
        pushSubscriptions[existingIdx] = sub;
      } else {
        pushSubscriptions.push(sub);
      }
      changed = true;
    }
  }
  if (changed) {
    savePushSubscriptions(pushSubscriptions);
  }
}

async function broadcastWebPushLockNotification(
  locked: boolean,
  excludeEndpoint?: string
): Promise<void> {
  if (pushSubscriptions.length === 0) return;
  const payload = JSON.stringify({
    locked,
    title: locked
      ? '🔒 تنبيه من المشرف: تم قفل الطلبات'
      : '🔓 تنبيه من المشرف: تم فتح الطلبات الآن',
    body: locked
      ? 'المشرف قفل استقبال الطلبات الحالية.'
      : 'المشرف فتح الطلبات دلوقتي — تقدر تسجل طلبك فوراً!',
    timestamp: Date.now(),
  });

  const validSubs: webpush.PushSubscription[] = [];
  await Promise.all(
    pushSubscriptions.map(async (sub) => {
      if (excludeEndpoint && sub.endpoint === excludeEndpoint) {
        validSubs.push(sub);
        return;
      }
      try {
        await webpush.sendNotification(sub, payload, {
          urgency: 'high',
          TTL: 86400,
        });
        validSubs.push(sub);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode !== 404 && statusCode !== 410) {
          validSubs.push(sub);
        }
      }
    })
  );
  pushSubscriptions = validSubs;
  savePushSubscriptions(pushSubscriptions);
}

function broadcastOrdersUpdate(
  eventType: 'orders:updated' | 'lock:changed' | 'delivery:changed' = 'orders:updated'
) {
  const payload = `data: ${JSON.stringify({
    type: eventType,
    isOrdersLocked,
    isDeliveryEnabled,
    deliveryFee,
    timestamp: Date.now(),
  })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Real-time Server-Sent Events stream for instant multi-phone sync
  app.get('/api/orders/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        isOrdersLocked,
        isDeliveryEnabled,
        deliveryFee,
      })}\n\n`
    );
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // GET /api/orders
  // - If mode=master & passcode=0902 -> returns ALL orders for the Master
  // - If deviceId=<id> -> returns ONLY orders created from that specific phone/deviceId
  app.get('/api/orders', (req, res) => {
    const mode = String(req.query.mode || 'student');
    const passcode = String(req.query.passcode || req.headers['x-master-passcode'] || '');
    const deviceId = String(req.query.deviceId || '').trim();

    if (mode === 'master') {
      if (passcode.trim() !== MASTER_PASSCODE) {
        res.status(403).json({ error: 'باسورد المشرف غير صحيح' });
        return;
      }
      res.json({
        orders: serverOrders,
        isOrdersLocked,
        isDeliveryEnabled,
        deliveryFee,
      });
      return;
    }

    // Student phone request: strictly isolate by deviceId so Student B never sees Student A's orders
    if (!deviceId) {
      res.json({
        orders: [],
        isOrdersLocked,
        isDeliveryEnabled,
        deliveryFee,
      });
      return;
    }

    const myDeviceOrders = serverOrders.filter(
      (order) => order.deviceId && order.deviceId === deviceId
    );
    res.json({
      orders: myDeviceOrders,
      isOrdersLocked,
      isDeliveryEnabled,
      deliveryFee,
    });
  });

  // POST /api/orders -> Student adds an order from their phone
  app.post('/api/orders', (req, res) => {
    try {
      if (isOrdersLocked) {
        res.status(403).json({ error: 'الطلبات مقفولة حالياً من المشرف — لا يمكن إضافة طلبات جديدة.' });
        return;
      }
      const body = req.body || {};
      const deviceId = sanitizeTextInput(String(body.deviceId || ''), 80);
      if (!deviceId) {
        res.status(400).json({ error: 'معرف الجهاز مطلوب لإضافة الطلب.' });
        return;
      }

      const validation = validateOrderItemInput({
        roommateName: String(body.roommateName || ''),
        roomNumber: String(body.roomNumber || ''),
        itemName: String(body.itemName || ''),
        category: body.category === 'pharmacy' || body.category === 'supermarket' || body.category === 'other' ? body.category : 'snacks',
        quantity: Number(body.quantity) || 1,
        unitPrice: Number(body.unitPrice) || 15,
        paymentMethod: body.paymentMethod === 'wallet' ? 'wallet' : 'cash',
        cashPaidAmount: Number(body.cashPaidAmount) || 0,
        notes: String(body.notes || ''),
      });

      if (!validation.valid || !validation.sanitized) {
        res.status(400).json({ error: validation.error || 'بيانات الطلب غير صالحة.' });
        return;
      }

      const s = validation.sanitized;
      const newOrder: RoommateOrderItem = {
        id: sanitizeTextInput(String(body.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`), 80),
        deviceId,
        sessionId: 'sakan_shared_session',
        sessionOwnerId: 'demo_owner_1',
        authorUid: 'demo_owner_1',
        memberUids: ['demo_owner_1'],
        roommateName: s.roommateName,
        roomNumber: s.roomNumber,
        itemName: s.itemName,
        normalizedItemKey: s.normalizedItemKey,
        category: s.category,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        paymentMethod: s.paymentMethod,
        cashPaidAmount: s.cashPaidAmount,
        isPaid: false,
        isPurchased: false,
        notes: s.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      serverOrders = [newOrder, ...serverOrders.filter((o) => o.id !== newOrder.id)];
      savePersistedOrders(serverOrders);
      broadcastOrdersUpdate();
      res.status(201).json({ order: newOrder });
    } catch {
      res.status(500).json({ error: 'حدث خطأ أثناء حفظ الطلب.' });
    }
  });

  // PATCH /api/orders/:id -> Student updates quantity on their own phone
  app.patch('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const deviceId = sanitizeTextInput(String(req.body?.deviceId || ''), 80);
    const roommateName = sanitizeTextInput(String(req.body?.roommateName || ''), 60);
    const roomNumber = sanitizeTextInput(String(req.body?.roomNumber || ''), 30);
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    const target = serverOrders.find((o) => o.id === id);

    if (!target) {
      res.status(404).json({ error: 'الطلب غير موجود' });
      return;
    }

    const isAuthorized = canUserModifyOrder(target, {
      deviceId,
      name: roommateName || undefined,
      room: roomNumber || undefined,
      isSupervisorUnlocked: passcode === MASTER_PASSCODE,
    });
    if (!isAuthorized) {
      res.status(403).json({ error: 'غير مسموح بتعديل طلب طالب آخر' });
      return;
    }

    const newQuantity =
      req.body?.quantity !== undefined
        ? Math.max(1, Math.min(100, Number(req.body.quantity) || 1))
        : target.quantity;

    const oldTotal = Math.round(target.quantity * target.unitPrice * 100) / 100;
    const newTotal = Math.round(newQuantity * target.unitPrice * 100) / 100;
    const updatedCashPaid =
      req.body?.cashPaidAmount !== undefined
        ? Math.max(0, Math.min(50000, Number(req.body.cashPaidAmount) || 0))
        : target.paymentMethod === 'cash' && target.cashPaidAmount === oldTotal
          ? newTotal
          : target.cashPaidAmount;

    const updatedPaymentMethod =
      req.body?.paymentMethod === 'wallet'
        ? 'wallet'
        : req.body?.paymentMethod === 'cash'
          ? 'cash'
          : target.paymentMethod;

    serverOrders = serverOrders.map((o) =>
      o.id === id
        ? {
            ...o,
            quantity: newQuantity,
            paymentMethod: updatedPaymentMethod,
            cashPaidAmount: updatedCashPaid,
            updatedAt: new Date().toISOString(),
          }
        : o
    );
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // POST /api/orders/student-payment -> Student sets their total prepared cash & payment method once for all their orders
  app.post('/api/orders/student-payment', (req, res) => {
    const deviceId = sanitizeTextInput(String(req.body?.deviceId || ''), 80);
    if (!deviceId) {
      res.status(400).json({ error: 'معرف الجهاز مطلوب' });
      return;
    }
    const paymentMethod = req.body?.paymentMethod === 'wallet' ? 'wallet' : 'cash';
    const rawTotalCash = Number(req.body?.totalCashPaidAmount);
    const totalCashPaidAmount =
      paymentMethod === 'cash' && Number.isFinite(rawTotalCash) && rawTotalCash >= 0
        ? Math.min(50000, Math.round(rawTotalCash * 100) / 100)
        : 0;

    let assignedFirst = false;
    const nowIso = new Date().toISOString();
    serverOrders = serverOrders.map((o) => {
      if (o.deviceId !== deviceId) return o;
      const cashForThisOrder = !assignedFirst && paymentMethod === 'cash' ? totalCashPaidAmount : 0;
      assignedFirst = true;
      return {
        ...o,
        paymentMethod,
        cashPaidAmount: cashForThisOrder,
        updatedAt: nowIso,
      };
    });

    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // POST /api/orders/settle-roommate -> Master marks student's change due as خالص
  app.post('/api/orders/settle-roommate', (req, res) => {
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    if (passcode !== MASTER_PASSCODE) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    const orderIds: string[] = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
    serverOrders = serverOrders.map((o) => {
      if (!orderIds.includes(o.id)) return o;
      const itemSubtotal = Math.round(o.quantity * o.unitPrice * 100) / 100;
      return {
        ...o,
        cashPaidAmount: o.paymentMethod === 'cash' ? itemSubtotal : 0,
        isPaid: true,
        updatedAt: new Date().toISOString(),
      };
    });
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // POST /api/orders/deliver-roommate -> Master marks whether student received their items
  app.post('/api/orders/deliver-roommate', (req, res) => {
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    if (passcode !== MASTER_PASSCODE) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    const orderIds: string[] = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
    const targetDeliveredState = Boolean(req.body?.targetDeliveredState);
    serverOrders = serverOrders.map((o) => {
      if (!orderIds.includes(o.id)) return o;
      return {
        ...o,
        isDelivered: targetDeliveredState,
        updatedAt: new Date().toISOString(),
      };
    });
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // POST /api/orders/toggle-group -> Master marks item group as purchased
  app.post('/api/orders/toggle-group', (req, res) => {
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    if (passcode !== MASTER_PASSCODE) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    const normalizedKey = sanitizeTextInput(String(req.body?.normalizedKey || ''), 80);
    const targetPurchasedState = Boolean(req.body?.targetPurchasedState);

    serverOrders = serverOrders.map((o) =>
      o.normalizedItemKey === normalizedKey
        ? { ...o, isPurchased: targetPurchasedState, updatedAt: new Date().toISOString() }
        : o
    );
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // DELETE /api/orders/:id -> Student deletes their own order OR Master deletes an order
  app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const deviceId = sanitizeTextInput(String(req.query.deviceId || req.body?.deviceId || ''), 80);
    const roommateName = sanitizeTextInput(String(req.query.roommateName || req.body?.roommateName || ''), 60);
    const roomNumber = sanitizeTextInput(String(req.query.roomNumber || req.body?.roomNumber || ''), 30);
    const passcode = String(req.query.passcode || req.headers['x-master-passcode'] || '').trim();
    const target = serverOrders.find((o) => o.id === id);

    if (!target) {
      res.json({ ok: true });
      return;
    }

    const isAuthorized = canUserModifyOrder(target, {
      deviceId,
      name: roommateName || undefined,
      room: roomNumber || undefined,
      isSupervisorUnlocked: passcode === MASTER_PASSCODE,
    });
    if (!isAuthorized) {
      res.status(403).json({ error: 'غير مسموح بحذف طلب طالب آخر' });
      return;
    }

    serverOrders = serverOrders.filter((o) => o.id !== id);
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // In-memory store for 4-digit Gmail OTP verification codes, cooldowns, and rate limits
  const otpStore = new Map<
    string,
    { code: string; email: string; name: string; room: string; expiresAt: number; lastSentAt: number }
  >();
  const otpAttemptStore = new Map<string, { failedAttempts: number; lockoutUntilMs: number }>();

  // POST /api/auth/send-otp -> Generates a 4-digit OTP for the student's email and dispatches the verification message
  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const emailCheck = validateEmailInput(String(req.body?.email || ''));
      if (!emailCheck.valid) {
        res.status(400).json({ error: emailCheck.errorAr || 'يرجى إدخال بريد إلكتروني صحيح' });
        return;
      }
      const email = emailCheck.sanitized;
      const name = sanitizeTextInput(String(req.body?.name || ''), 60);
      const room = sanitizeTextInput(String(req.body?.room || ''), 30);
      const sub = req.body?.subscription as webpush.PushSubscription | undefined;

      const existing = otpStore.get(email);
      const now = Date.now();
      if (existing && now - existing.lastSentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        const remainingSec = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - (now - existing.lastSentAt)) / 1000);
        res.status(429).json({
          error: `يرجى الانتظار ${remainingSec} ثانية قبل طلب إرسال كود جديد.`,
          cooldownRemainingSeconds: remainingSec,
        });
        return;
      }

      const requestedCode = String(req.body?.code || '').trim();
      const code = /^\d{4}$/.test(requestedCode)
        ? requestedCode
        : String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = now + OTP_EXPIRY_MS;
      otpStore.set(email, {
        code,
        email,
        name,
        room,
        expiresAt,
        lastSentAt: now,
      });

      if (sub && sub.endpoint) {
        mergeIncomingSubscriptions([sub]);
        const pushPayload = JSON.stringify({
          locked: false,
          title: `📩 رسالة تأكيد البريد (${email})`,
          body: `رمز التحقق (OTP) للدخول إلى طلبات السكن هو: ${code}`,
          timestamp: Date.now(),
        });
        webpush.sendNotification(sub, pushPayload, { urgency: 'high', TTL: 300 }).catch(() => {});
      }

      res.json({
        ok: true,
        email,
        expiresAt,
        cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        subject: 'رمز التحقق من البريد — طلبات السكن STEM EL ARISH',
      });
    } catch {
      res.status(500).json({ error: 'حدث خطأ أثناء إرسال رمز التحقق.' });
    }
  });

  // POST /api/auth/verify-otp -> Verifies the 4-digit OTP code sent to the student's Gmail
  app.post('/api/auth/verify-otp', (req, res) => {
    const email = sanitizeTextInput(String(req.body?.email || ''), 120).toLowerCase();
    const code = sanitizeTextInput(String(req.body?.code || ''), 10);

    if (!email || !code) {
      res.status(400).json({ ok: false, error: 'بيانات التحقق غير مكتملة' });
      return;
    }

    const now = Date.now();
    const attemptState = otpAttemptStore.get(email) || { failedAttempts: 0, lockoutUntilMs: 0 };
    if (attemptState.lockoutUntilMs > now) {
      const remainingSec = Math.ceil((attemptState.lockoutUntilMs - now) / 1000);
      res.status(429).json({
        ok: false,
        error: `تم إيقاف المحاولة مؤقتاً بعد عدة محاولات خاطئة. يرجى الانتظار ${remainingSec} ثانية.`,
      });
      return;
    }

    const record = otpStore.get(email);
    if (!record) {
      res.status(400).json({ ok: false, error: 'لم يتم العثور على كود نشط — اضغط إعادة إرسال الكود' });
      return;
    }

    if (now > record.expiresAt) {
      otpStore.delete(email);
      res.status(400).json({ ok: false, error: 'انتهت صلاحية كود التحقق (5 دقائق) — اضغط إعادة إرسال الكود' });
      return;
    }

    if (record.code !== code) {
      const nextRate = evaluateAttemptRateLimit(
        attemptState.failedAttempts,
        attemptState.lockoutUntilMs,
        now
      );
      otpAttemptStore.set(email, {
        failedAttempts: nextRate.nextFailedAttempts,
        lockoutUntilMs: nextRate.nextLockedUntilMs,
      });
      res.status(400).json({ ok: false, error: nextRate.errorAr || 'رمز التحقق غير صحيح' });
      return;
    }

    otpStore.delete(email);
    otpAttemptStore.delete(email);
    res.json({
      ok: true,
      verified: true,
      email: record.email,
      name: record.name,
      room: record.room,
    });
  });

  // GET /api/push/vapid-public-key -> Returns public VAPID key for Web Push subscription
  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // POST /api/push/subscribe -> Registers one or more phone/browser subscriptions for background Web Push
  app.post('/api/push/subscribe', (req, res) => {
    const sub = req.body?.subscription as webpush.PushSubscription | undefined;
    const subs = Array.isArray(req.body?.subscriptions) ? req.body.subscriptions : [];
    const listToMerge = sub ? [sub, ...subs] : subs;
    if (listToMerge.length === 0) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    mergeIncomingSubscriptions(listToMerge);
    res.json({ ok: true, totalSubscriptions: pushSubscriptions.length });
  });

  // POST /api/push/test-background -> Sends a real background Web Push after delayMs (e.g. 4 seconds) so the user can close the app completely and see/hear it arrive
  app.post('/api/push/test-background', (req, res) => {
    const sub = req.body?.subscription as webpush.PushSubscription | undefined;
    const subs = Array.isArray(req.body?.subscriptions) ? req.body.subscriptions : [];
    const delayMs = Math.max(1000, Math.min(15000, Number(req.body?.delayMs) || 4000));
    const locked = Boolean(req.body?.locked);

    mergeIncomingSubscriptions(sub ? [sub, ...subs] : subs);

    setTimeout(() => {
      const payload = JSON.stringify({
        locked,
        title: locked
          ? '🔒 تنبيه من المشرف: تم قفل الطلبات'
          : '🔓 تنبيه من المشرف: تم فتح الطلبات الآن',
        body: locked
          ? 'المشرف قفل استقبال الطلبات الحالية.'
          : 'المشرف فتح الطلبات دلوقتي — تقدر تسجل طلبك فوراً!',
        timestamp: Date.now(),
      });

      const targets = sub && sub.endpoint ? [sub] : pushSubscriptions;
      for (const targetSub of targets) {
        webpush
          .sendNotification(targetSub, payload, { urgency: 'high', TTL: 86400 })
          .catch(() => {});
      }
    }, delayMs);

    res.json({ ok: true, scheduledInMs: delayMs });
  });

  // POST /api/orders/lock -> Supervisor locks or unlocks receiving new orders
  app.post('/api/orders/lock', (req, res) => {
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    if (passcode !== MASTER_PASSCODE) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    if (Array.isArray(req.body?.subscriptions)) {
      mergeIncomingSubscriptions(req.body.subscriptions);
    }
    const excludeEndpoint =
      typeof req.body?.excludeEndpoint === 'string' ? req.body.excludeEndpoint : undefined;
    isOrdersLocked = Boolean(req.body?.locked);
    savePersistedLockState(isOrdersLocked);
    broadcastOrdersUpdate('lock:changed');
    broadcastWebPushLockNotification(isOrdersLocked, excludeEndpoint).catch(() => {});
    res.json({ ok: true, isOrdersLocked, notifiedCount: pushSubscriptions.length });
  });

  // POST /api/orders/delivery -> Supervisor enables/disables delivery and sets delivery fee
  app.post('/api/orders/delivery', (req, res) => {
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    if (passcode !== MASTER_PASSCODE) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    if (typeof req.body?.enabled === 'boolean') {
      isDeliveryEnabled = req.body.enabled;
    }
    if (req.body?.fee !== undefined) {
      const parsedFee = Number(req.body.fee);
      if (Number.isFinite(parsedFee) && parsedFee >= 0) {
        deliveryFee = Math.min(5000, Math.round(parsedFee * 100) / 100);
      }
    }
    savePersistedDeliveryState(isDeliveryEnabled, deliveryFee);
    broadcastOrdersUpdate('delivery:changed');
    res.json({ ok: true, isDeliveryEnabled, deliveryFee });
  });

  // POST /api/orders/clear -> Master clears all orders for a new round
  app.post('/api/orders/clear', (req, res) => {
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    if (passcode !== MASTER_PASSCODE) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    serverOrders = [];
    isOrdersLocked = false;
    savePersistedOrders(serverOrders);
    savePersistedLockState(false);
    broadcastOrdersUpdate();
    res.json({ ok: true });
  });

  // GET /api/download-apk and /stem-arish-orders.apk -> Direct download of the signed Android APK
  const serveApkDownload = (_req: express.Request, res: express.Response) => {
    const apkPath = path.join(__dirname, 'public', 'stem-arish-orders.apk');
    if (!fs.existsSync(apkPath)) {
      res.status(404).send('APK file not found');
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="stem-arish-orders.apk"');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(apkPath);
  };

  app.get('/api/download-apk', serveApkDownload);
  app.get('/stem-arish-orders.apk', serveApkDownload);

  const distPath = path.join(__dirname, 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const isProd =
    (process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start') &&
    fs.existsSync(distIndexHtml);

  app.use((req, res, next) => {
    if (
      req.path.endsWith('manifest.webmanifest') ||
      req.path.endsWith('sw.js') ||
      req.path.endsWith('push-sw.js') ||
      req.path.endsWith('registerSW.js') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.svg')
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    next();
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('manifest.webmanifest') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('push-sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('index.html') ||
            filePath.endsWith('.png') ||
            filePath.endsWith('.svg')
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(distIndexHtml);
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
