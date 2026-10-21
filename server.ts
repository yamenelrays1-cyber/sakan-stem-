import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import type { RoommateOrderItem } from './src/types/orders.ts';
import { INITIAL_DEMO_ORDERS } from './src/utils/seedData.ts';
import { MASTER_PASSCODE, normalizeArabicItemName } from './src/utils/orderAggregator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const LOCK_FILE = path.join(DATA_DIR, 'lock.json');
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
    // fallback to demo seed
  }
  return [...INITIAL_DEMO_ORDERS];
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

let serverOrders: RoommateOrderItem[] = loadPersistedOrders();
let isOrdersLocked: boolean = loadPersistedLockState();
const sseClients = new Set<express.Response>();

const PERMANENT_VAPID_PUBLIC_KEY =
  'BIOUj2pBaImVs_V8UmVvuGPlqXKbcUNmapsleBZHVIh-w0KXZfyEVBltsF7x4tgGwxP-76dLF8NA5mY9MqIMZwY';
const PERMANENT_VAPID_PRIVATE_KEY =
  'jXf52KC_ZMiI2ZAPHC_zU2F40RecF9_fxyR4J7xugGY';

const vapidKeys = {
  publicKey: PERMANENT_VAPID_PUBLIC_KEY,
  privateKey: PERMANENT_VAPID_PRIVATE_KEY,
};
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf8');
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

function broadcastOrdersUpdate(eventType: 'orders:updated' | 'lock:changed' = 'orders:updated') {
  const payload = `data: ${JSON.stringify({
    type: eventType,
    isOrdersLocked,
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

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
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
      res.json({ orders: serverOrders, isOrdersLocked });
      return;
    }

    // Student phone request: strictly isolate by deviceId so Student B never sees Student A's orders
    if (!deviceId) {
      res.json({ orders: [], isOrdersLocked });
      return;
    }

    const myDeviceOrders = serverOrders.filter(
      (order) => order.deviceId && order.deviceId === deviceId
    );
    res.json({ orders: myDeviceOrders, isOrdersLocked });
  });

  // POST /api/orders -> Student adds an order from their phone
  app.post('/api/orders', (req, res) => {
    if (isOrdersLocked) {
      res.status(403).json({ error: 'الطلبات مقفولة حالياً من المشرف — لا يمكن إضافة طلبات جديدة.' });
      return;
    }
    const body = req.body || {};
    const deviceId = String(body.deviceId || '').trim();
    const roommateName = String(body.roommateName || '').trim();
    const roomNumber = String(body.roomNumber || '').trim();
    const itemName = String(body.itemName || '').trim();
    const quantity = Math.max(1, Math.min(100, Number(body.quantity) || 1));
    const unitPrice = Math.max(0.5, Math.min(10000, Number(body.unitPrice) || 15));
    const paymentMethod = body.paymentMethod === 'wallet' ? 'wallet' : 'cash';
    const cashPaidAmount =
      paymentMethod === 'cash'
        ? Math.max(0, Math.min(50000, Number(body.cashPaidAmount) || 0))
        : 0;

    if (!roommateName || !roomNumber || !itemName || !deviceId) {
      res.status(400).json({ error: 'بيانات الطلب غير مكتملة — يرجى كتابة الاسم واختيار الأوضة والطلب.' });
      return;
    }

    const newOrder: RoommateOrderItem = {
      id: String(body.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
      deviceId,
      sessionId: 'sakan_shared_session',
      sessionOwnerId: 'demo_owner_1',
      authorUid: 'demo_owner_1',
      memberUids: ['demo_owner_1'],
      roommateName,
      roomNumber,
      itemName,
      normalizedItemKey: normalizeArabicItemName(itemName),
      category: 'snacks',
      quantity,
      unitPrice,
      paymentMethod,
      cashPaidAmount,
      isPaid: false,
      isPurchased: false,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    serverOrders = [newOrder, ...serverOrders.filter((o) => o.id !== newOrder.id)];
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.status(201).json({ order: newOrder });
  });

  // PATCH /api/orders/:id -> Student updates quantity on their own phone
  app.patch('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const deviceId = String(req.body?.deviceId || '').trim();
    const passcode = String(req.body?.passcode || req.headers['x-master-passcode'] || '').trim();
    const target = serverOrders.find((o) => o.id === id);

    if (!target) {
      res.status(404).json({ error: 'الطلب غير موجود' });
      return;
    }

    const isAuthorized =
      passcode === MASTER_PASSCODE || (deviceId && target.deviceId === deviceId);
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
        ? Number(req.body.cashPaidAmount)
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
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!deviceId) {
      res.status(400).json({ error: 'معرف الجهاز مطلوب' });
      return;
    }
    const paymentMethod = req.body?.paymentMethod === 'wallet' ? 'wallet' : 'cash';
    const rawTotalCash = Number(req.body?.totalCashPaidAmount);
    const totalCashPaidAmount =
      paymentMethod === 'cash' && Number.isFinite(rawTotalCash) && rawTotalCash >= 0
        ? Math.round(rawTotalCash * 100) / 100
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
    const normalizedKey = String(req.body?.normalizedKey || '');
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
    const deviceId = String(req.query.deviceId || req.body?.deviceId || '').trim();
    const passcode = String(req.query.passcode || req.headers['x-master-passcode'] || '').trim();
    const target = serverOrders.find((o) => o.id === id);

    if (!target) {
      res.json({ ok: true });
      return;
    }

    const isAuthorized =
      passcode === MASTER_PASSCODE || (deviceId && target.deviceId === deviceId);
    if (!isAuthorized) {
      res.status(403).json({ error: 'غير مسموح بحذف طلب طالب آخر' });
      return;
    }

    serverOrders = serverOrders.filter((o) => o.id !== id);
    savePersistedOrders(serverOrders);
    broadcastOrdersUpdate();
    res.json({ ok: true });
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
