import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  DORM_ROOMS,
  type DormRoom,
  type OrderCategory,
  type PaymentMethod,
  type RoommateFinancialSummary,
  type RoommateOrderItem,
} from './types/orders';
import {
  aggregateOrdersForMaster,
  calculateRoommateSummaries,
  calculateSessionFinancials,
  verifyMasterPasscode,
  MASTER_PASSCODE,
} from './utils/orderAggregator';
import { TopBar, type AppEdition } from './components/TopBar';
import { SessionToolbar } from './components/SessionToolbar';
import {
  OrderFormCard,
  SAVED_STUDENT_NAME_KEY,
  SAVED_STUDENT_ROOM_KEY,
} from './components/OrderFormCard';
import { MasterAggregatedView } from './components/MasterAggregatedView';
import { CashSettlementView } from './components/CashSettlementView';
import { StudentDeliveryView } from './components/StudentDeliveryView';
import { PWAInstallModal } from './components/PWAInstallModal';
import { EntryScreen } from './components/EntryScreen';
import { Footer } from './components/Footer';
import { usePWAInstall } from './hooks/usePWAInstall';
import { SakanMqttSync, DEFAULT_ROOM_CODE } from './lib/mqttSync';
import {
  ensureNotificationPermission,
  playSupervisorLockSound,
  registerBackgroundPushSubscription,
  scheduleDelayedBackgroundPushTest,
  triggerSupervisorLockNotification,
  unlockNotificationAudioOnInteraction,
} from './utils/supervisorNotifications';
import {
  auth,
  db,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  type User,
} from './lib/firebase';

const LOCAL_STORAGE_DEVICE_ID_KEY = 'sakan_phone_device_id_v1';

function getOrCreatePhoneDeviceId(): string {
  if (typeof window === 'undefined') return 'dev_server';
  const params = new URLSearchParams(window.location.search);
  const queryDevice = params.get('device');
  if (queryDevice && queryDevice.trim()) {
    return queryDevice.trim();
  }
  try {
    const existing = localStorage.getItem(LOCAL_STORAGE_DEVICE_ID_KEY);
    if (existing && existing.trim()) {
      return existing;
    }
    const generated = `phone_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(LOCAL_STORAGE_DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return `phone_${Date.now()}`;
  }
}

const STANDALONE_LOGIN_DONE_KEY = 'sakan_standalone_login_completed_v5';
const BROWSER_LOGIN_DONE_KEY = 'sakan_browser_login_completed_v5';

// One-time cleanup of legacy student profile keys so old test student data is wiped
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('sakan_saved_student_name_v1');
    localStorage.removeItem('sakan_saved_student_room_v1');
    localStorage.removeItem('sakan_standalone_login_completed_v3');
    localStorage.removeItem('sakan_browser_login_completed_v3');
    localStorage.removeItem('sakan_standalone_login_completed_v4');
    localStorage.removeItem('sakan_browser_login_completed_v4');
  } catch {
    // ignore
  }
}

function isStandaloneAppMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone) ||
    params.get('source') === 'pwa'
  );
}

function hasCompletedFirstLogin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = isStandaloneAppMode()
      ? STANDALONE_LOGIN_DONE_KEY
      : BROWSER_LOGIN_DONE_KEY;
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function getInitialEditionFromUrl(): AppEdition {
  if (typeof window === 'undefined') return 'student';
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') || params.get('view');
  if (mode === 'master') return 'master';
  return 'student';
}

function getSavedStudentName(): string {
  try {
    return (localStorage.getItem(SAVED_STUDENT_NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

function getSavedStudentRoom(): DormRoom | '' {
  try {
    const val = (localStorage.getItem(SAVED_STUDENT_ROOM_KEY) || '').trim();
    return DORM_ROOMS.includes(val as DormRoom) ? (val as DormRoom) : '';
  } catch {
    return '';
  }
}

export default function App() {
  const [deviceId] = useState<string>(getOrCreatePhoneDeviceId);
  const [myStudentOrders, setMyStudentOrders] = useState<RoommateOrderItem[]>([]);
  const [masterAllOrders, setMasterAllOrders] = useState<RoommateOrderItem[]>([]);
  const [mqttOrdersMap, setMqttOrdersMap] = useState<Record<string, RoommateOrderItem>>({});

  const [savedStudentName, setSavedStudentName] = useState<string>(getSavedStudentName);
  const [savedStudentRoom, setSavedStudentRoom] = useState<DormRoom | ''>(getSavedStudentRoom);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [edition, setEdition] = useState<AppEdition>(getInitialEditionFromUrl);
  const [showEntryScreen, setShowEntryScreen] = useState<boolean>(() => {
    if (getInitialEditionFromUrl() === 'master') return false;
    const existingName = getSavedStudentName();
    const existingRoom = getSavedStudentRoom();
    if (!hasCompletedFirstLogin() || !existingName || !existingRoom) {
      return true;
    }
    return false;
  });
  const [isMasterUnlocked, setIsMasterUnlocked] = useState(false);
  const [isOrdersLocked, setIsOrdersLocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [copiedSummaryRecently, setCopiedSummaryRecently] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [deleteOrderSignal, setDeleteOrderSignal] = useState<number>(0);
  const [isNotifBannerDismissed, setIsNotifBannerDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sakan_dismissed_notif_banner_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [backgroundTestPending, setBackgroundTestPending] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const mqttRef = useRef<SakanMqttSync | null>(null);
  const mqttPushSubsRef = useRef<Record<string, PushSubscriptionJSON>>({});
  const myPushSubRef = useRef<PushSubscriptionJSON | null>(null);
  const lastKnownLockRef = useRef<boolean | null>(null);
  const initialSyncSettledRef = useRef<boolean>(false);
  const editionRef = useRef<AppEdition>(edition);
  editionRef.current = edition;

  const handleSubscribedPush = useCallback(
    (subJson: PushSubscriptionJSON) => {
      myPushSubRef.current = subJson;
      mqttPushSubsRef.current[deviceId] = subJson;
      mqttRef.current?.publishPushSubscription(deviceId, subJson);
    },
    [deviceId]
  );

  const handleDismissNotifBanner = () => {
    setIsNotifBannerDismissed(true);
    try {
      localStorage.setItem('sakan_dismissed_notif_banner_v1', 'true');
    } catch {
      // ignore
    }
  };

  const applyIncomingLockState = useCallback(
    (nextLocked: boolean, forceNotify = false, fromPushSw = false) => {
      const prevLocked = lastKnownLockRef.current;
      lastKnownLockRef.current = nextLocked;
      setIsOrdersLocked(nextLocked);

      if (
        forceNotify ||
        (initialSyncSettledRef.current && prevLocked !== null && prevLocked !== nextLocked)
      ) {
        triggerSupervisorLockNotification(nextLocked, false, {
          isSupervisor: editionRef.current === 'master',
          fromPushSw,
        });
      }
    },
    []
  );

  useEffect(() => {
    registerBackgroundPushSubscription(handleSubscribedPush).catch(() => {});
    const timer = window.setTimeout(() => {
      initialSyncSettledRef.current = true;
    }, 2200);

    // If opened by tapping a closed-app notification, play the lock/open sound on first interaction
    const params = new URLSearchParams(window.location.search);
    const lockSoundParam = params.get('lockSound');
    if (lockSoundParam === 'locked' || lockSoundParam === 'open') {
      playSupervisorLockSound(lockSoundParam === 'locked');
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('lockSound');
        window.history.replaceState({}, '', cleanUrl.toString());
      } catch {
        // ignore
      }
    }

    const handleFirstInteraction = () => {
      unlockNotificationAudioOnInteraction();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        registerBackgroundPushSubscription(handleSubscribedPush).catch(() => {});
      }
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { once: true, passive: true });

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; locked?: boolean } | undefined;
      if (data && data.type === 'SUPERVISOR_LOCK_PUSH_RECEIVED' && typeof data.locked === 'boolean') {
        applyIncomingLockState(data.locked, true, true);
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        try {
          if (localStorage.getItem(STANDALONE_LOGIN_DONE_KEY) !== 'true') {
            setShowEntryScreen(true);
          }
        } catch {
          setShowEntryScreen(true);
        }
      }
    };
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', handleFirstInteraction);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [applyIncomingLockState, handleSubscribedPush]);

  // Merge server orders + MQTT retained orders cleanly for the Master
  const combinedAllOrders = useMemo(() => {
    const merged = new Map<string, RoommateOrderItem>();
    for (const ord of myStudentOrders) {
      merged.set(ord.id, ord);
    }
    for (const ord of masterAllOrders) {
      merged.set(ord.id, ord);
    }
    for (const [id, ord] of Object.entries(mqttOrdersMap)) {
      const existing = merged.get(id);
      if (!existing || ord.updatedAt >= existing.updatedAt) {
        merged.set(id, ord);
      }
    }
    return Array.from(merged.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [myStudentOrders, masterAllOrders, mqttOrdersMap]);

  // Student's OWN orders on this phone only (strictly isolated by deviceId)
  const combinedMyStudentOrders = useMemo(() => {
    const merged = new Map<string, RoommateOrderItem>();
    for (const ord of myStudentOrders) {
      if (!ord.deviceId || ord.deviceId === deviceId) {
        merged.set(ord.id, ord);
      }
    }
    for (const [id, ord] of Object.entries(mqttOrdersMap)) {
      if (ord.deviceId === deviceId) {
        const existing = merged.get(id);
        if (!existing || ord.updatedAt >= existing.updatedAt) {
          merged.set(id, ord);
        }
      }
    }
    return Array.from(merged.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [myStudentOrders, mqttOrdersMap, deviceId]);

  // Connect to MQTT.js broker (wss://broker.emqx.io:8084/mqtt) for real-time cross-phone sync
  useEffect(() => {
    const sync = new SakanMqttSync({
      roomCode: DEFAULT_ROOM_CODE,
      onStatusChange: (status) => {
        if (status === 'connected' && myPushSubRef.current) {
          sync.publishPushSubscription(deviceId, myPushSubRef.current);
        }
      },
      onLockStatusChange: (locked) => {
        applyIncomingLockState(locked);
      },
      onPushSubscriptionReceived: (subDeviceId, sub) => {
        mqttPushSubsRef.current[subDeviceId] = sub;
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        }).catch(() => {});
      },
      onOrderReceived: (orderId, order) => {
        setMqttOrdersMap((prev) => {
          const next = { ...prev };
          if (!order) {
            delete next[orderId];
          } else {
            next[orderId] = order;
          }
          return next;
        });
        if (!order) {
          setMyStudentOrders((prev) => prev.filter((o) => o.id !== orderId));
          setMasterAllOrders((prev) => prev.filter((o) => o.id !== orderId));
        }
      },
    });

    sync.connect();
    mqttRef.current = sync;

    return () => {
      sync.disconnect();
      mqttRef.current = null;
    };
  }, [applyIncomingLockState, deviceId]);

  // Fetch ONLY this phone's orders for Student Edition
  const fetchMyPhoneOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?mode=student&deviceId=${encodeURIComponent(deviceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          setMyStudentOrders(data.orders);
        }
        if (typeof data.isOrdersLocked === 'boolean') {
          applyIncomingLockState(data.isOrdersLocked);
        }
      }
    } catch {
      // ignore offline fetch errors
    }
  }, [deviceId, applyIncomingLockState]);

  // Fetch ALL phones' orders for Supervisor Edition (requires 0902 passcode)
  const fetchMasterOrders = useCallback(async () => {
    if (!isMasterUnlocked) return;
    try {
      const res = await fetch(`/api/orders?mode=master&passcode=${encodeURIComponent(MASTER_PASSCODE)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          setMasterAllOrders(data.orders);
        }
        if (typeof data.isOrdersLocked === 'boolean') {
          applyIncomingLockState(data.isOrdersLocked);
        }
      }
    } catch {
      // ignore offline fetch errors
    }
  }, [isMasterUnlocked, applyIncomingLockState]);

  useEffect(() => {
    fetchMyPhoneOrders();
  }, [fetchMyPhoneOrders]);

  useEffect(() => {
    if (edition === 'master' && isMasterUnlocked) {
      fetchMasterOrders();
    }
  }, [edition, isMasterUnlocked, fetchMasterOrders]);

  // Subscribe to Server-Sent Events so any order or lock change from any phone updates live
  useEffect(() => {
    const evtSource = new EventSource('/api/orders/stream');
    evtSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          isOrdersLocked?: boolean;
        };
        if (typeof parsed.isOrdersLocked === 'boolean') {
          applyIncomingLockState(
            parsed.isOrdersLocked,
            parsed.type === 'lock:changed'
          );
        }
      } catch {
        // ignore parse errors
      }
      fetchMyPhoneOrders();
      if (isMasterUnlocked) {
        fetchMasterOrders();
      }
    };
    return () => {
      evtSource.close();
    };
  }, [fetchMyPhoneOrders, fetchMasterOrders, isMasterUnlocked, applyIncomingLockState]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  const handleSelectEdition = (nextEdition: AppEdition) => {
    setEdition(nextEdition);
    setShowEntryScreen(false);
    if (nextEdition === 'student') {
      setIsMasterUnlocked(false);
      setPasscodeInput('');
      setPasscodeError(null);
      setStatusBanner(null);
    }
    try {
      const url = new URL(window.location.href);
      if (nextEdition === 'master') {
        url.searchParams.set('mode', 'master');
      } else {
        url.searchParams.delete('mode');
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore URL errors
    }
  };

  const handleSaveStudentProfileAndEnter = (name: string, room: DormRoom) => {
    try {
      localStorage.setItem(SAVED_STUDENT_NAME_KEY, name);
      localStorage.setItem(SAVED_STUDENT_ROOM_KEY, room);
      if (isStandaloneAppMode()) {
        localStorage.setItem(STANDALONE_LOGIN_DONE_KEY, 'true');
      }
      localStorage.setItem(BROWSER_LOGIN_DONE_KEY, 'true');
    } catch {
      // ignore
    }
    setSavedStudentName(name);
    setSavedStudentRoom(room);
    setEdition('student');
    setShowEntryScreen(false);
    ensureNotificationPermission(handleSubscribedPush).then((perm) => setNotificationPermission(perm));
  };

  const handleUnlockMaster = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyMasterPasscode(passcodeInput)) {
      setIsMasterUnlocked(true);
      setPasscodeError(null);
      setPasscodeInput('');
      ensureNotificationPermission(handleSubscribedPush).then((perm) => setNotificationPermission(perm));
    } else {
      setPasscodeError('الباسورد غير صحيح — نسخة المشرف محمية بباسورد.');
    }
  };

  // Derived Master Aggregation, Roommate Summaries, and Session Totals
  const aggregatedItems = useMemo(
    () => aggregateOrdersForMaster(combinedAllOrders),
    [combinedAllOrders]
  );
  const roommateSummaries = useMemo(
    () => calculateRoommateSummaries(combinedAllOrders, 0),
    [combinedAllOrders]
  );
  const financials = useMemo(
    () => calculateSessionFinancials(combinedAllOrders, 0),
    [combinedAllOrders]
  );

  // Student's own combined financial summary across all items they ordered
  const myTotalRequired = useMemo(
    () =>
      Math.round(
        combinedMyStudentOrders.reduce((acc, o) => acc + o.quantity * o.unitPrice, 0) * 100
      ) / 100,
    [combinedMyStudentOrders]
  );

  const myCurrentPreparedCash = useMemo(
    () =>
      Math.round(
        combinedMyStudentOrders.reduce((acc, o) => acc + o.cashPaidAmount, 0) * 100
      ) / 100,
    [combinedMyStudentOrders]
  );

  const myCurrentPaymentMethod: 'cash' | 'wallet' = useMemo(
    () =>
      combinedMyStudentOrders.some((o) => o.paymentMethod === 'wallet')
        ? 'wallet'
        : 'cash',
    [combinedMyStudentOrders]
  );

  const isMyOrdersFullyPaid = useMemo(
    () =>
      combinedMyStudentOrders.length > 0 &&
      combinedMyStudentOrders.every((o) => o.isPaid),
    [combinedMyStudentOrders]
  );

  const myChangeDue = useMemo(
    () =>
      !isMyOrdersFullyPaid && myCurrentPaymentMethod === 'cash'
        ? Math.max(0, Math.round((myCurrentPreparedCash - myTotalRequired) * 100) / 100)
        : 0,
    [isMyOrdersFullyPaid, myCurrentPaymentMethod, myCurrentPreparedCash, myTotalRequired]
  );

  const [studentPreparedInput, setStudentPreparedInput] = useState<string>('');
  const [studentOrderSubmittedMsg, setStudentOrderSubmittedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (combinedMyStudentOrders.length === 0) {
      setStudentPreparedInput('');
      setStudentOrderSubmittedMsg(null);
      return;
    }
    setStudentPreparedInput(String(myCurrentPreparedCash || myTotalRequired));
  }, [myCurrentPreparedCash, myTotalRequired, combinedMyStudentOrders.length]);

  const applyPaymentAcrossMyOrders = useCallback(
    async (
      ordersList: RoommateOrderItem[],
      nextMethod: 'cash' | 'wallet',
      desiredTotalCash: number
    ) => {
      if (ordersList.length === 0) return;
      const totalReq =
        Math.round(
          ordersList.reduce((acc, o) => acc + o.quantity * o.unitPrice, 0) * 100
        ) / 100;
      const effectiveTotalCash =
        nextMethod === 'cash'
          ? Math.max(totalReq, Math.round((Number(desiredTotalCash) || totalReq) * 100) / 100)
          : 0;

      const nowIso = new Date().toISOString();
      const updatedList = ordersList.map((ord, idx) => ({
        ...ord,
        paymentMethod: nextMethod,
        cashPaidAmount: nextMethod === 'cash' && idx === 0 ? effectiveTotalCash : 0,
        updatedAt: nowIso,
      }));

      setMyStudentOrders(updatedList);
      setMqttOrdersMap((prev) => {
        const next = { ...prev };
        for (const u of updatedList) {
          next[u.id] = u;
        }
        return next;
      });

      for (const u of updatedList) {
        mqttRef.current?.publishOrder(u);
      }

      try {
        await fetch('/api/orders/student-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            paymentMethod: nextMethod,
            totalCashPaidAmount: effectiveTotalCash,
          }),
        });
      } catch {
        // ignore network error
      }
    },
    [deviceId]
  );

  const handleAddOrder = async (sanitized: {
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
  }) => {
    const newId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const isPaid = false;
    const activeMethod: PaymentMethod =
      combinedMyStudentOrders.length > 0 ? myCurrentPaymentMethod : 'cash';
    const itemSubtotal = Math.round(sanitized.quantity * sanitized.unitPrice * 100) / 100;
    const newTotalReq = Math.round((myTotalRequired + itemSubtotal) * 100) / 100;
    const hadCustomHigherBill =
      combinedMyStudentOrders.length > 0 && myCurrentPreparedCash > myTotalRequired;
    const targetTotalPrepared =
      activeMethod === 'cash'
        ? hadCustomHigherBill
          ? Math.max(newTotalReq, myCurrentPreparedCash)
          : newTotalReq
        : 0;

    // If this is the first order or we put total prepared cash on the newest (first) order:
    const newOrder: RoommateOrderItem = {
      id: newId,
      deviceId,
      sessionId: DEFAULT_ROOM_CODE,
      sessionOwnerId: currentUser ? currentUser.uid : 'demo_owner_1',
      authorUid: currentUser ? currentUser.uid : 'demo_owner_1',
      memberUids: currentUser ? [currentUser.uid] : ['demo_owner_1'],
      roommateName: sanitized.roommateName,
      roomNumber: sanitized.roomNumber,
      itemName: sanitized.itemName,
      normalizedItemKey: sanitized.normalizedItemKey,
      category: sanitized.category,
      quantity: sanitized.quantity,
      unitPrice: sanitized.unitPrice,
      paymentMethod: activeMethod,
      cashPaidAmount: activeMethod === 'cash' ? targetTotalPrepared : 0,
      isPaid,
      isPurchased: false,
      notes: sanitized.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const zeroedPreviousOrders = combinedMyStudentOrders.map((ord) => ({
      ...ord,
      paymentMethod: activeMethod,
      cashPaidAmount: 0,
      updatedAt: new Date().toISOString(),
    }));

    const nextOrdersList = [newOrder, ...zeroedPreviousOrders];

    // 1. Optimistic update on this student's phone
    setMyStudentOrders(nextOrdersList);
    setMqttOrdersMap((prev) => {
      const next = { ...prev, [newId]: newOrder };
      for (const z of zeroedPreviousOrders) {
        next[z.id] = z;
      }
      return next;
    });

    // 2. Publish to MQTT cloud
    mqttRef.current?.publishOrder(newOrder);
    for (const z of zeroedPreviousOrders) {
      mqttRef.current?.publishOrder(z);
    }

    // 3. Persist to backend API
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          deviceId,
          ...sanitized,
          paymentMethod: activeMethod,
          cashPaidAmount: activeMethod === 'cash' ? targetTotalPrepared : 0,
        }),
      });
      if (zeroedPreviousOrders.length > 0) {
        await fetch('/api/orders/student-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            paymentMethod: activeMethod,
            totalCashPaidAmount: targetTotalPrepared,
          }),
        });
      }
    } catch {
      // ignore network error
    }

    if (currentUser) {
      const orderRef = doc(db, 'sessions', DEFAULT_ROOM_CODE, 'orders', newId);
      try {
        await setDoc(orderRef, {
          sessionId: DEFAULT_ROOM_CODE,
          sessionOwnerId: currentUser.uid,
          authorUid: currentUser.uid,
          memberUids: [currentUser.uid],
          roommateName: newOrder.roommateName,
          roomNumber: newOrder.roomNumber,
          itemName: newOrder.itemName,
          normalizedItemKey: newOrder.normalizedItemKey,
          category: newOrder.category,
          quantity: newOrder.quantity,
          unitPrice: newOrder.unitPrice,
          paymentMethod: newOrder.paymentMethod,
          cashPaidAmount: newOrder.cashPaidAmount,
          isPaid: newOrder.isPaid,
          isPurchased: newOrder.isPurchased,
          notes: newOrder.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `sessions/${DEFAULT_ROOM_CODE}/orders/${newId}`);
      }
    }
  };

  const handleUpdateOrderQuantity = async (orderId: string, newQuantity: number) => {
    const clamped = Math.max(1, Math.min(100, newQuantity));
    const target = combinedMyStudentOrders.find((o) => o.id === orderId);
    if (!target) return;

    const updatedList = combinedMyStudentOrders.map((o) =>
      o.id === orderId ? { ...o, quantity: clamped, updatedAt: new Date().toISOString() } : o
    );
    const newTotalReq =
      Math.round(
        updatedList.reduce((acc, o) => acc + o.quantity * o.unitPrice, 0) * 100
      ) / 100;
    const hadCustomHigherBill = myCurrentPreparedCash > myTotalRequired;
    const desiredCash =
      myCurrentPaymentMethod === 'cash'
        ? hadCustomHigherBill
          ? Math.max(newTotalReq, myCurrentPreparedCash)
          : newTotalReq
        : 0;

    try {
      await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          quantity: clamped,
        }),
      });
    } catch {
      // ignore
    }

    await applyPaymentAcrossMyOrders(updatedList, myCurrentPaymentMethod, desiredCash);
  };

  // Master marks student's change due (الباقي) as خالص
  const handleSettleRoommateChange = async (summary: RoommateFinancialSummary) => {
    const itemIds = summary.items.map((i) => i.id);
    const nowIso = new Date().toISOString();

    for (const item of summary.items) {
      const itemSubtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
      const settledOrder: RoommateOrderItem = {
        ...item,
        cashPaidAmount: item.paymentMethod === 'cash' ? itemSubtotal : 0,
        isPaid: true,
        updatedAt: nowIso,
      };
      setMqttOrdersMap((prev) => ({ ...prev, [item.id]: settledOrder }));
      mqttRef.current?.publishOrder(settledOrder);
    }

    setMasterAllOrders((prev) =>
      prev.map((o) => {
        if (!itemIds.includes(o.id)) return o;
        const itemSubtotal = Math.round(o.quantity * o.unitPrice * 100) / 100;
        return {
          ...o,
          cashPaidAmount: o.paymentMethod === 'cash' ? itemSubtotal : 0,
          isPaid: true,
          updatedAt: nowIso,
        };
      })
    );

    try {
      await fetch('/api/orders/settle-roommate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: MASTER_PASSCODE,
          orderIds: itemIds,
        }),
      });
    } catch {
      // ignore
    }
  };

  // Master marks whether student received their items (استلم حاجته ولا لسه)
  const handleToggleRoommateDelivered = async (
    summary: RoommateFinancialSummary,
    targetDeliveredState: boolean
  ) => {
    const itemIds = summary.items.map((i) => i.id);
    const nowIso = new Date().toISOString();

    for (const item of summary.items) {
      const updatedOrder: RoommateOrderItem = {
        ...item,
        isDelivered: targetDeliveredState,
        updatedAt: nowIso,
      };
      setMqttOrdersMap((prev) => ({ ...prev, [item.id]: updatedOrder }));
      mqttRef.current?.publishOrder(updatedOrder);
    }

    setMasterAllOrders((prev) =>
      prev.map((o) =>
        itemIds.includes(o.id)
          ? {
              ...o,
              isDelivered: targetDeliveredState,
              updatedAt: nowIso,
            }
          : o
      )
    );

    setMyStudentOrders((prev) =>
      prev.map((o) =>
        itemIds.includes(o.id)
          ? {
              ...o,
              isDelivered: targetDeliveredState,
              updatedAt: nowIso,
            }
          : o
      )
    );

    try {
      await fetch('/api/orders/deliver-roommate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: MASTER_PASSCODE,
          orderIds: itemIds,
          targetDeliveredState,
        }),
      });
    } catch {
      // ignore
    }
  };

  const handleToggleGroupPurchased = async (
    normalizedKey: string,
    targetPurchasedState: boolean
  ) => {
    const nowIso = new Date().toISOString();
    const matching = combinedAllOrders.filter((o) => o.normalizedItemKey === normalizedKey);

    for (const ord of matching) {
      const updated: RoommateOrderItem = {
        ...ord,
        isPurchased: targetPurchasedState,
        updatedAt: nowIso,
      };
      setMqttOrdersMap((prev) => ({ ...prev, [ord.id]: updated }));
      mqttRef.current?.publishOrder(updated);
    }

    setMasterAllOrders((prev) =>
      prev.map((o) =>
        o.normalizedItemKey === normalizedKey
          ? { ...o, isPurchased: targetPurchasedState, updatedAt: nowIso }
          : o
      )
    );

    try {
      await fetch('/api/orders/toggle-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: MASTER_PASSCODE,
          normalizedKey,
          targetPurchasedState,
        }),
      });
    } catch {
      // ignore
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setDeleteOrderSignal((prev) => prev + 1);
    const remainingMyOrders = combinedMyStudentOrders.filter((o) => o.id !== orderId);
    setMyStudentOrders((prev) => prev.filter((o) => o.id !== orderId));
    setMasterAllOrders((prev) => prev.filter((o) => o.id !== orderId));
    setMqttOrdersMap((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });

    mqttRef.current?.deleteOrder(orderId);

    try {
      await fetch(
        `/api/orders/${encodeURIComponent(orderId)}?deviceId=${encodeURIComponent(
          deviceId
        )}&passcode=${encodeURIComponent(isMasterUnlocked ? MASTER_PASSCODE : '')}`,
        { method: 'DELETE' }
      );
    } catch {
      // ignore
    }

    if (edition === 'student' && remainingMyOrders.length > 0) {
      const newTotalReq =
        Math.round(
          remainingMyOrders.reduce((acc, o) => acc + o.quantity * o.unitPrice, 0) * 100
        ) / 100;
      const hadCustomHigherBill = myCurrentPreparedCash > myTotalRequired;
      const desiredCash =
        myCurrentPaymentMethod === 'cash'
          ? hadCustomHigherBill
            ? Math.max(newTotalReq, myCurrentPreparedCash)
            : newTotalReq
          : 0;
      await applyPaymentAcrossMyOrders(
        remainingMyOrders,
        myCurrentPaymentMethod,
        desiredCash
      );
    }

    if (currentUser) {
      const orderRef = doc(db, 'sessions', DEFAULT_ROOM_CODE, 'orders', orderId);
      try {
        await deleteDoc(orderRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `sessions/${DEFAULT_ROOM_CODE}/orders/${orderId}`);
      }
    }
  };

  const handleToggleOrdersLock = async () => {
    await ensureNotificationPermission(handleSubscribedPush).then((perm) =>
      setNotificationPermission(perm)
    );
    const nextLocked = !isOrdersLocked;
    initialSyncSettledRef.current = true;
    lastKnownLockRef.current = nextLocked;
    setIsOrdersLocked(nextLocked);
    // Supervisor toggles orders: play sound without vibrating the Supervisor's own phone
    triggerSupervisorLockNotification(nextLocked, true, { isSupervisor: true });
    mqttRef.current?.publishLockStatus(nextLocked);

    const studentSubscriptions = Object.entries(mqttPushSubsRef.current)
      .filter(([subDeviceId]) => subDeviceId !== deviceId)
      .map(([, sub]) => sub);

    try {
      await fetch('/api/orders/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: MASTER_PASSCODE,
          locked: nextLocked,
          subscriptions: studentSubscriptions,
          excludeEndpoint: myPushSubRef.current?.endpoint,
        }),
      });
    } catch {
      // ignore
    }

    setStatusBanner(
      nextLocked
        ? 'تم قفل الطلبات.'
        : 'تم فتح الطلبات.'
    );
  };

  const handleClearAllOrders = async () => {
    const allIds = combinedAllOrders.map((o) => o.id);
    mqttRef.current?.clearAllOrders(allIds);
    mqttRef.current?.publishLockStatus(false);

    setMasterAllOrders([]);
    setMyStudentOrders([]);
    setMqttOrdersMap({});
    lastKnownLockRef.current = false;
    setIsOrdersLocked(false);

    try {
      await fetch('/api/orders/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: MASTER_PASSCODE }),
      });
    } catch {
      // ignore
    }
    setStatusBanner('تم مسح القائمة لبدء أوردر جديد.');
  };

  const handleCopyMasterSummary = async () => {
    const lines: string[] = [
      `🛒 *مجموع الطلبات للمشرف:*`,
      ...aggregatedItems.map(
        (item) =>
          `• ${item.totalQuantity} × ${item.displayName} = ${item.totalCost} ج.م`
      ),
      `────────────────────`,
      `👥 *الاسم والأوض والطلبات والباقي:*`,
      ...roommateSummaries.map((s) => {
        const itemsText = s.items.map((i) => `${i.quantity}× ${i.itemName}`).join(' + ');
        return s.isFullyPaid
          ? `• ${s.roommateName} (${s.roomNumber}) [${itemsText}]: مطلوب ${s.totalRequired} ج.م | تم الدفع (خالص)`
          : s.paymentMethod === 'cash'
            ? `• ${s.roommateName} (${s.roomNumber}) [${itemsText}]: مطلوب ${s.totalRequired} ج.م | دفع كاش — لسه مدفعش${
                s.changeDue > 0 ? ` (محضر ${s.cashPaidAmount} ج.م · الباقي ليه: ${s.changeDue} ج.م)` : ''
              }`
            : `• ${s.roommateName} (${s.roomNumber}) [${itemsText}]: مطلوب ${s.totalRequired} ج.م | فودافون كاش — لسه محولش`;
      }),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      // ignore
    }
    setCopiedSummaryRecently(true);
    setStatusBanner('تم نسخ قائمة المشرف والاسم والأوض والباقي.');
    setTimeout(() => setCopiedSummaryRecently(false), 3000);
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
      setStatusBanner('تم تسجيل الدخول بحساب Google وتفعيل المزامنة.');
    } catch {
      setStatusBanner('تعذر فتح نافذة تسجيل الدخول حالياً.');
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setStatusBanner('تم تسجيل الخروج.');
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar with Student Edition vs Master Edition Switcher + Direct APK Download */}
      <TopBar
        edition={edition}
        onSelectEdition={handleSelectEdition}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        isInstalled={isInstalled}
        onOpenEntryScreen={() => setShowEntryScreen(true)}
      />

      {/* PWA / APK Installation Modal */}
      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        isInstallable={isInstallable}
        onTriggerNativeInstall={install}
      />

      {/* Master Summary Strip ONLY in Master Edition after Passcode 0902 is verified */}
      {!showEntryScreen && edition === 'master' && isMasterUnlocked && (
        <SessionToolbar
          financials={financials}
          currentUser={currentUser}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onClearAllOrders={handleClearAllOrders}
          onCopyMasterSummary={handleCopyMasterSummary}
          copiedSummaryRecently={copiedSummaryRecently}
          isOrdersLocked={isOrdersLocked}
          onToggleOrdersLock={handleToggleOrdersLock}
        />
      )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-6">
        {!showEntryScreen && edition === 'master' && isMasterUnlocked && statusBanner && (
          <div
            role="status"
            className="mb-6 p-3.5 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium flex items-center justify-between gap-4"
          >
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs text-slate-300 hover:text-white underline shrink-0 cursor-pointer"
            >
              إخفاء
            </button>
          </div>
        )}

        {/* START / ENTRY SCREEN (صفحة البداية أو تسجيل الدخول بالاسم والأوضة) */}
        {showEntryScreen && (
          <EntryScreen
            initialName={savedStudentName}
            initialRoom={savedStudentRoom}
            onSaveStudentProfileAndEnter={handleSaveStudentProfileAndEnter}
            onEnterEdition={handleSelectEdition}
          />
        )}

        {/* EDITION 1: STUDENT EDITION ONLY (فورم الطالب + طلباتك الخاصة بجهازك فقط) */}
        {!showEntryScreen && edition === 'student' && (
          <div id="student-edition" className="max-w-xl mx-auto space-y-6">
            {!isNotifBannerDismissed && (
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                {notificationPermission !== 'granted' ? (
                  <>
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold text-slate-900">
                        إشعارات الموبايل وأنت قافل التطبيق 🔔
                      </div>
                      <div className="text-[11px] text-slate-500">
                        فعّلها مرة واحدة علشان يوصلك إشعار على شاشة القفل أول ما المشرف يفتح أو يقفل الطلبات وأنت سايب الموبايل.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const perm = await ensureNotificationPermission(handleSubscribedPush);
                          setNotificationPermission(perm);
                          playSupervisorLockSound(isOrdersLocked);
                        }}
                        className="min-h-[38px] px-3.5 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        تفعيل إشعارات الموبايل 🔔
                      </button>
                      <button
                        type="button"
                        onClick={handleDismissNotifBanner}
                        className="min-h-[38px] px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        إزالة
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold text-emerald-800">
                        إشعارات الخلفية وشاشة القفل مفعّلة على موبايلك ✅
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {backgroundTestPending
                          ? 'اقفل التطبيق خالص دلوقتي أو اقفل شاشة الموبايل — هيوصلك الإشعار بالصوت خلال 4 ثواني...'
                          : 'هيوصلك إشعار بالصوت على التليفون تلقائياً أول ما المشرف يفتح أو يقفل الطلبات حتى لو قافل التطبيق خالص.'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={backgroundTestPending}
                        onClick={async () => {
                          setBackgroundTestPending(true);
                          await scheduleDelayedBackgroundPushTest(
                            isOrdersLocked,
                            4000,
                            Object.values(mqttPushSubsRef.current)
                          );
                          window.setTimeout(() => {
                            setBackgroundTestPending(false);
                          }, 4500);
                        }}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {backgroundTestPending
                          ? 'اقفل التطبيق الآن (4 ثواني)...'
                          : 'تجربة الإشعار وأنت قافل التطبيق 📱'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDismissNotifBanner}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        إزالة
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <OrderFormCard
              nameInputRef={nameInputRef}
              isOrdersLocked={isOrdersLocked}
              savedStudentName={savedStudentName}
              savedStudentRoom={savedStudentRoom}
              ordersCount={combinedMyStudentOrders.length}
              deleteSignal={deleteOrderSignal}
              onEditStudentProfile={() => setShowEntryScreen(true)}
              onAddOrder={handleAddOrder}
            />

            {/* Student's OWN orders + Unified Total Required & Prepared Cash Section */}
            <section
              id="my-student-orders"
              aria-label="طلباتك والحساب المطلوب منك"
              className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
            >
              <div className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  طلباتك والحساب المطلوب منك ({combinedMyStudentOrders.length})
                </h2>
                {combinedMyStudentOrders.length > 0 && (
                  <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-bold font-mono tabular-nums">
                    إجمالي المطلوب منك: {myTotalRequired} ج.م
                  </span>
                )}
              </div>

              {combinedMyStudentOrders.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  لسه مضفتش طلبات — ضيف كل الطلبات اللي عايزها فوق، وبعدها هيظهرلك هنا إجمالي الفلوس المطلوبة منك وتحدد هتجهز كام للمشرف مرة واحدة.
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {combinedMyStudentOrders.map((order) => {
                      const lineTotal = Math.round(order.quantity * order.unitPrice * 100) / 100;
                      return (
                        <div
                          key={order.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-bold text-amber-800 font-mono tabular-nums">
                              {order.quantity} × {order.itemName}
                            </span>
                            <span className="text-xs text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              {lineTotal} ج.م
                            </span>
                            <span className="text-xs text-slate-400" aria-hidden="true">
                              ({order.unitPrice} ج.م للواحدة)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              aria-label={`زيادة كمية ${order.itemName}`}
                              onClick={() => handleUpdateOrderQuantity(order.id, order.quantity + 1)}
                              className="min-w-[38px] min-h-[38px] px-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              aria-label={`تقليل كمية ${order.itemName}`}
                              onClick={() => {
                                if (order.quantity > 1) {
                                  handleUpdateOrderQuantity(order.id, order.quantity - 1);
                                }
                              }}
                              disabled={order.quantity <= 1}
                              className="min-w-[38px] min-h-[38px] px-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                            >
                              −1
                            </button>
                            <button
                              type="button"
                              aria-label={`حذف طلب ${order.itemName}`}
                              onClick={() => handleDeleteOrder(order.id)}
                              className="min-h-[38px] px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Unified Payment & Prepared Money Section Once After Ordering Everything */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <div className="text-[11px] text-slate-500">الفلوس المطلوبة منك</div>
                        <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                          {myTotalRequired} <span className="text-xs font-normal text-slate-500">ج.م</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <div className="text-[11px] text-slate-500">
                          {myCurrentPaymentMethod === 'cash' ? 'المبلغ اللي هتجهزه' : 'طريقة الدفع'}
                        </div>
                        <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                          {myCurrentPaymentMethod === 'cash' ? (
                            <>
                              {myCurrentPreparedCash || myTotalRequired}{' '}
                              <span className="text-xs font-normal text-slate-500">ج.م</span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-rose-700">فودافون كاش</span>
                          )}
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-amber-50/80 border border-amber-200">
                        <div className="text-[11px] text-amber-900 font-medium">الباقي ليك عند المشرف</div>
                        <div className="text-lg font-extrabold font-mono tabular-nums text-amber-900 mt-0.5">
                          {isMyOrdersFullyPaid ? (
                            <span className="text-sm font-bold text-emerald-700">تم الدفع (خالص)</span>
                          ) : myCurrentPaymentMethod === 'wallet' ? (
                            <span className="text-xs font-bold text-rose-700">تحويل {myTotalRequired} ج.م</span>
                          ) : (
                            <>
                              {myChangeDue} <span className="text-xs font-normal text-amber-700">ج.م</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isMyOrdersFullyPaid && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-200/80">
                          <span className="text-xs font-bold text-slate-800">
                            طريقة الدفع لكل طلباتك:
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
                            <button
                              type="button"
                              onClick={() => {
                                setStudentPreparedInput(String(myTotalRequired));
                                applyPaymentAcrossMyOrders(
                                  combinedMyStudentOrders,
                                  'cash',
                                  myTotalRequired
                                );
                              }}
                              className={`min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                                myCurrentPaymentMethod === 'cash'
                                  ? 'bg-white text-slate-900 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              دفع كاش (عادي)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStudentPreparedInput('0');
                                applyPaymentAcrossMyOrders(combinedMyStudentOrders, 'wallet', 0);
                              }}
                              className={`min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                                myCurrentPaymentMethod === 'wallet'
                                  ? 'bg-rose-700 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              فودافون كاش
                            </button>
                          </div>
                        </div>

                        {myCurrentPaymentMethod === 'cash' ? (
                          <div className="space-y-2 pt-2 border-t border-slate-200/80">
                            <label
                              htmlFor="student-total-prepared-cash"
                              className="block text-xs font-bold text-slate-800"
                            >
                              هتجهز كام جنيه كاش للمشرف؟ (لكل طلباتك مع بعض)
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                id="student-total-prepared-cash"
                                type="number"
                                min={myTotalRequired}
                                step="1"
                                placeholder={`اكتب المبلغ اللي هتجهزه (مثال: ${myTotalRequired})...`}
                                value={studentPreparedInput}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setStudentPreparedInput(raw);
                                  setStudentOrderSubmittedMsg(null);
                                  const num = Number(raw);
                                  if (Number.isFinite(num) && num >= myTotalRequired) {
                                    applyPaymentAcrossMyOrders(
                                      combinedMyStudentOrders,
                                      'cash',
                                      num
                                    );
                                  }
                                }}
                                onBlur={() => {
                                  const num = Number(studentPreparedInput);
                                  const validCash =
                                    Number.isFinite(num) && num >= myTotalRequired
                                      ? num
                                      : myTotalRequired;
                                  setStudentPreparedInput(String(validCash));
                                  applyPaymentAcrossMyOrders(
                                    combinedMyStudentOrders,
                                    'cash',
                                    validCash
                                  );
                                }}
                                className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                              <span className="text-xs font-bold text-slate-600 shrink-0">
                                ج.م
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-slate-600 font-medium">
                              المطلوب تحويله فودافون كاش للمشرف عن كل طلباتك:
                            </span>
                            <span className="font-bold font-mono tabular-nums text-rose-700">
                              {myTotalRequired} ج.م
                            </span>
                          </div>
                        )}

                        {studentOrderSubmittedMsg && (
                          <div
                            role="status"
                            className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 text-center"
                          >
                            {studentOrderSubmittedMsg}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={async () => {
                            const num = Number(studentPreparedInput);
                            const validCash =
                              myCurrentPaymentMethod === 'cash'
                                ? Number.isFinite(num) && num >= myTotalRequired
                                  ? num
                                  : myTotalRequired
                                : 0;
                            if (myCurrentPaymentMethod === 'cash') {
                              setStudentPreparedInput(String(validCash));
                            }
                            await applyPaymentAcrossMyOrders(
                              combinedMyStudentOrders,
                              myCurrentPaymentMethod,
                              validCash
                            );
                            const changeVal =
                              myCurrentPaymentMethod === 'cash'
                                ? Math.max(0, Math.round((validCash - myTotalRequired) * 100) / 100)
                                : 0;
                            setStudentOrderSubmittedMsg(
                              myCurrentPaymentMethod === 'cash'
                                ? `تم إرسال طلبك للمشرف بنجاح ✅ (المطلوب: ${myTotalRequired} ج.م · هتجهز: ${validCash} ج.م${
                                    changeVal > 0 ? ` · الباقي ليك: ${changeVal} ج.م` : ''
                                  })`
                                : `تم إرسال طلبك للمشرف بنجاح ✅ (المطلوب فودافون كاش: ${myTotalRequired} ج.م)`
                            );
                          }}
                          className="w-full min-h-[48px] px-5 py-3 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                        >
                          إرسال الطلب للمشرف ({myTotalRequired} ج.م)
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* EDITION 2: SUPERVISOR EDITION PASSCODE GATE (0902) */}
        {!showEntryScreen && edition === 'master' && !isMasterUnlocked && (
          <div id="master-passcode-gate" className="max-w-md mx-auto mt-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="pb-3 border-b border-slate-100 flex items-center gap-3">
                <img
                  src="/icon.svg"
                  alt="أيقونة طلبات السكن"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-2xl shadow-xs shrink-0"
                />
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    دخول نسخة المشرف
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    نسخة المشرف محمية بباسورد علشان تظهر للمشرف بس.
                  </p>
                </div>
              </div>

              <form onSubmit={handleUnlockMaster} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="master-passcode-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    باسورد المشرف
                  </label>
                  <input
                    id="master-passcode-input"
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    placeholder="اكتب الباسورد..."
                    value={passcodeInput}
                    onChange={(e) => {
                      setPasscodeInput(e.target.value);
                      setPasscodeError(null);
                    }}
                    className="w-full h-11 px-3.5 text-center font-mono tabular-nums text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {passcodeError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800"
                  >
                    {passcodeError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    دخول نسخة المشرف
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectEdition('student')}
                    className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    رجوع لنسخة الطلاب
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDITION 2: MASTER EDITION UNLOCKED (بعد إدخال الباسورد 0902) */}
        {!showEntryScreen && edition === 'master' && isMasterUnlocked && (
          <div id="master-edition" className="space-y-5">
            <MasterAggregatedView
              aggregatedItems={aggregatedItems}
              onToggleGroupPurchased={handleToggleGroupPurchased}
            />

            <CashSettlementView
              roommateSummaries={roommateSummaries}
              onSettleRoommateChange={handleSettleRoommateChange}
              onDeleteOrder={handleDeleteOrder}
            />

            <StudentDeliveryView
              roommateSummaries={roommateSummaries}
              onToggleRoommateDelivered={handleToggleRoommateDelivered}
            />
          </div>
        )}
      </main>

      {/* Bottom Footer with STEM EL ARISH Logo & Designer Credit */}
      <Footer />
    </div>
  );
}
