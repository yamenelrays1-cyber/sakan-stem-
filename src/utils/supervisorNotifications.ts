// Distinctive 3.6-Second Audio & External System/Web-Push Notification Manager for Supervisor (المشرف) Order Lock/Unlock Events

const PERMANENT_VAPID_PUBLIC_KEY =
  'BIOUj2pBaImVs_V8UmVvuGPlqXKbcUNmapsleBZHVIh-w0KXZfyEVBltsF7x4tgGwxP-76dLF8NA5mY9MqIMZwY';

let sharedAudioCtx: AudioContext | null = null;
let preloadedOpenAudio: HTMLAudioElement | null = null;
let preloadedLockAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let lastNotifiedLockState: boolean | null = null;
let lastNotifiedTimestamp = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockNotificationAudioOnInteraction(): void {
  if (typeof window === 'undefined') return;
  try {
    getAudioContext();
    if (!preloadedOpenAudio) {
      preloadedOpenAudio = new Audio('/sounds/supervisor-open.wav?v=3');
      preloadedOpenAudio.preload = 'auto';
    }
    if (!preloadedLockAudio) {
      preloadedLockAudio = new Audio('/sounds/supervisor-lock.wav?v=3');
      preloadedLockAudio.preload = 'auto';
    }
    if (!audioUnlocked) {
      audioUnlocked = true;
      preloadedOpenAudio.muted = true;
      preloadedOpenAudio
        .play()
        .then(() => {
          if (preloadedOpenAudio) {
            preloadedOpenAudio.pause();
            preloadedOpenAudio.currentTime = 0;
            preloadedOpenAudio.muted = false;
          }
        })
        .catch(() => {
          if (preloadedOpenAudio) preloadedOpenAudio.muted = false;
        });

      preloadedLockAudio.muted = true;
      preloadedLockAudio
        .play()
        .then(() => {
          if (preloadedLockAudio) {
            preloadedLockAudio.pause();
            preloadedLockAudio.currentTime = 0;
            preloadedLockAudio.muted = false;
          }
        })
        .catch(() => {
          if (preloadedLockAudio) preloadedLockAudio.muted = false;
        });
    }
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isSameServerKey(sub: PushSubscription, expectedKeyBytes: Uint8Array): boolean {
  try {
    const existingBuf = sub.options?.applicationServerKey;
    if (!existingBuf) return false;
    const existingBytes = new Uint8Array(existingBuf);
    if (existingBytes.length !== expectedKeyBytes.length) return false;
    for (let i = 0; i < existingBytes.length; i++) {
      if (existingBytes[i] !== expectedKeyBytes[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the Push Service Worker (/push-sw.js) is registered at root scope '/'
 * and subscribes the phone to background Web Push notifications (via FCM/WebPush).
 */
export async function registerBackgroundPushSubscription(
  onSubscribed?: (subJson: PushSubscriptionJSON) => void
): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register('/push-sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    await reg.update().catch(() => {});

    const readyRegistration = await navigator.serviceWorker.ready;

    if (
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      !readyRegistration.pushManager
    ) {
      return null;
    }

    let publicKey = PERMANENT_VAPID_PUBLIC_KEY;
    try {
      const res = await fetch('/api/push/vapid-public-key');
      if (res.ok) {
        const data = (await res.json()) as { publicKey?: string };
        if (data.publicKey) publicKey = data.publicKey;
      }
    } catch {
      // fallback to PERMANENT_VAPID_PUBLIC_KEY
    }

    const convertedKey = urlBase64ToUint8Array(publicKey);
    let subscription = await readyRegistration.pushManager.getSubscription();

    if (subscription && !isSameServerKey(subscription, convertedKey)) {
      try {
        await subscription.unsubscribe();
      } catch {
        // ignore
      }
      subscription = null;
    }

    if (!subscription) {
      subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    onSubscribed?.(subJson);

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subJson }),
    }).catch(() => {});

    return subscription;
  } catch {
    return null;
  }
}

/**
 * Schedules a real background push notification from the server in `delayMs` (default 4000ms)
 * so the student can close the app or lock their phone screen and hear the notification arrive.
 */
export async function scheduleDelayedBackgroundPushTest(
  locked: boolean,
  delayMs = 4000,
  extraSubscriptions: PushSubscriptionJSON[] = []
): Promise<boolean> {
  unlockNotificationAudioOnInteraction();
  const perm = await ensureNotificationPermission();
  if (perm !== 'granted') return false;

  const subscription = await registerBackgroundPushSubscription();

  try {
    await fetch('/api/push/test-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription ? subscription.toJSON() : undefined,
        subscriptions: extraSubscriptions,
        locked,
        delayMs,
      }),
    });
  } catch {
    // ignore network error
  }

  return true;
}

/**
 * Plays a long (~3.65 seconds), distinctive 3-phrase melodic chime fanfare
 * exclusively when the Supervisor locks or unlocks orders.
 */
export function playSupervisorLockSound(locked: boolean): void {
  if (typeof window === 'undefined') return;

  let playedWebAudio = false;
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'running') {
      const now = ctx.currentTime;

      const masterFilter = ctx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.setValueAtTime(2600, now);
      masterFilter.Q.setValueAtTime(0.7, now);
      masterFilter.connect(ctx.destination);

      const notes = locked
        ? [
            // Phrase 1 (0.0s - 1.05s): C6 -> G5 -> E5 -> C5
            { freq: 1046.5, start: 0.0, dur: 0.45, vol: 0.34 },
            { freq: 783.99, start: 0.18, dur: 0.45, vol: 0.34 },
            { freq: 659.25, start: 0.36, dur: 0.5, vol: 0.34 },
            { freq: 523.25, start: 0.55, dur: 0.7, vol: 0.38 },
            // Phrase 2 (1.15s - 2.20s): A5 -> E5 -> C5 -> A4
            { freq: 880.0, start: 1.15, dur: 0.45, vol: 0.34 },
            { freq: 659.25, start: 1.33, dur: 0.45, vol: 0.34 },
            { freq: 523.25, start: 1.51, dur: 0.5, vol: 0.34 },
            { freq: 440.0, start: 1.7, dur: 0.7, vol: 0.38 },
            // Phrase 3 (2.30s - 3.65s): G5 -> D5 -> B4 -> G4 resolving cadence
            { freq: 783.99, start: 2.3, dur: 0.5, vol: 0.36 },
            { freq: 587.33, start: 2.48, dur: 0.5, vol: 0.36 },
            { freq: 493.88, start: 2.66, dur: 0.55, vol: 0.36 },
            { freq: 392.0, start: 2.84, dur: 0.85, vol: 0.42 },
          ]
        : [
            // Phrase 1 (0.0s - 1.05s): C5 -> E5 -> G5 -> C6
            { freq: 523.25, start: 0.0, dur: 0.45, vol: 0.34 },
            { freq: 659.25, start: 0.18, dur: 0.45, vol: 0.34 },
            { freq: 783.99, start: 0.36, dur: 0.5, vol: 0.34 },
            { freq: 1046.5, start: 0.55, dur: 0.7, vol: 0.38 },
            // Phrase 2 (1.15s - 2.20s): D5 -> F#5 -> A5 -> D6
            { freq: 587.33, start: 1.15, dur: 0.45, vol: 0.34 },
            { freq: 739.99, start: 1.33, dur: 0.45, vol: 0.34 },
            { freq: 880.0, start: 1.51, dur: 0.5, vol: 0.34 },
            { freq: 1174.66, start: 1.7, dur: 0.7, vol: 0.38 },
            // Phrase 3 (2.30s - 3.65s): Grand resolving G5 -> B5 -> D6 -> G6
            { freq: 783.99, start: 2.3, dur: 0.55, vol: 0.36 },
            { freq: 987.77, start: 2.46, dur: 0.55, vol: 0.36 },
            { freq: 1174.66, start: 2.62, dur: 0.65, vol: 0.38 },
            { freq: 1567.98, start: 2.8, dur: 0.85, vol: 0.42 },
          ];

      for (const n of notes) {
        const osc = ctx.createOscillator();
        const oscOct = ctx.createOscillator();
        const octGain = ctx.createGain();
        const gain = ctx.createGain();

        osc.type = 'sine';
        oscOct.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        oscOct.frequency.setValueAtTime(n.freq * 2, now + n.start);

        octGain.gain.setValueAtTime(0.14, now + n.start);
        octGain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur * 0.6);

        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + n.start + n.dur);

        osc.connect(gain);
        oscOct.connect(octGain);
        octGain.connect(gain);
        gain.connect(masterFilter);

        osc.start(now + n.start);
        oscOct.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
        oscOct.stop(now + n.start + n.dur + 0.02);
      }
      playedWebAudio = true;
    }
  } catch {
    // Fallback to WAV element below
  }

  // Also play the preloaded 3.65s WAV element if WebAudio was suspended or in background tab
  if (!playedWebAudio || document.visibilityState === 'hidden') {
    try {
      const targetAudio = locked ? preloadedLockAudio : preloadedOpenAudio;
      if (targetAudio) {
        targetAudio.muted = false;
        targetAudio.volume = 1.0;
        targetAudio.currentTime = 0;
        targetAudio.play().catch(() => {});
      } else {
        const freshAudio = new Audio(
          locked ? '/sounds/supervisor-lock.wav?v=3' : '/sounds/supervisor-open.wav?v=3'
        );
        freshAudio.volume = 1.0;
        freshAudio.play().catch(() => {});
      }
    } catch {
      // ignore audio errors
    }
  }
}

/**
 * Unlocks the browser's AudioContext on first user tap/click, requests
 * Notification permission, and subscribes to Web Push for background notifications.
 */
export async function ensureNotificationPermission(
  onSubscribed?: (subJson: PushSubscriptionJSON) => void
): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined') return 'unsupported';
  unlockNotificationAudioOnInteraction();
  if (!('Notification' in window)) return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
  }
  if (perm === 'granted') {
    await registerBackgroundPushSubscription(onSubscribed);
  }
  return perm;
}

export interface SupervisorLockNotificationPayload {
  locked: boolean;
  title: string;
  body: string;
  timestamp: number;
}

export interface TriggerNotificationOptions {
  isSupervisor?: boolean;
  fromPushSw?: boolean;
}

/**
 * Fires a complete Supervisor Lock/Unlock Notification:
 * 1. Long (3.65s), distinctive custom musical chime (NEVER the default phone notification tone)
 * 2. Vibration ONLY on student devices (NEVER vibrates for the Supervisor)
 * 3. External Phone Status-Bar / Lock-Screen System Notification with `silent: true` so the phone's
 *    default notification sound never plays over our custom sound.
 */
export function triggerSupervisorLockNotification(
  locked: boolean,
  bypassDedup = false,
  opts?: TriggerNotificationOptions
): SupervisorLockNotificationPayload | null {
  const now = Date.now();
  if (!bypassDedup && lastNotifiedLockState === locked && now - lastNotifiedTimestamp < 1500) {
    return null;
  }
  lastNotifiedLockState = locked;
  lastNotifiedTimestamp = now;

  const isSupervisor = Boolean(opts?.isSupervisor);
  const fromPushSw = Boolean(opts?.fromPushSw);

  const title = locked
    ? '🔒 تنبيه من المشرف: تم قفل الطلبات'
    : '🔓 تنبيه من المشرف: تم فتح الطلبات الآن';

  const body = locked
    ? 'المشرف قفل استقبال الطلبات الحالية.'
    : 'المشرف فتح الطلبات دلوقتي — تقدر تسجل طلبك فوراً!';

  // 1. Play distinctive 3.65-second custom sound
  playSupervisorLockSound(locked);

  // If this device is the Supervisor (المشرف), do NOT vibrate and do NOT show a student alert banner
  if (isSupervisor) {
    return {
      locked,
      title,
      body,
      timestamp: now,
    };
  }

  // 2. Trigger vibration ONLY for Students (never for Supervisor)
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(
        locked ? [400, 120, 400, 120, 600, 150, 500] : [250, 100, 250, 100, 500]
      );
    }
  } catch {
    // ignore
  }

  // 3. Dispatch external OS / Phone Status-Bar Notification with `silent: true`
  // so ONLY our custom 3.65s sound plays and NEVER the phone's default notification sound.
  // Skip if `fromPushSw` is true because push-sw.js already displayed the banner.
  if (
    !fromPushSw &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    const uniqueTag = 'sakan-lock-alert-' + now;
    const notifOptions: NotificationOptions & {
      renotify?: boolean;
      requireInteraction?: boolean;
      vibrate?: number[];
    } = {
      body,
      icon: '/sakan-icon-192.png',
      badge: '/sakan-icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: uniqueTag,
      renotify: false,
      requireInteraction: true,
      silent: true,
      vibrate: locked ? [400, 120, 400, 120, 600, 150, 500] : [250, 100, 250, 100, 500],
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg && typeof reg.showNotification === 'function') {
            return reg.showNotification(title, notifOptions);
          }
          new Notification(title, notifOptions);
        })
        .catch(() => {
          try {
            new Notification(title, notifOptions);
          } catch {
            // ignore
          }
        });
    } else {
      try {
        new Notification(title, notifOptions);
      } catch {
        // ignore
      }
    }
  }

  return {
    locked,
    title,
    body,
    timestamp: now,
  };
}
