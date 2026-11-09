// Full PWA Offline Caching + Web Push Service Worker for Sakan Orders

const CACHE_NAME = 'sakan-pwa-ui-cache-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/sakan-icon-192.png',
  '/sakan-icon-512.png',
  '/icon.svg',
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS).catch(function () {
          // Ignore individual asset failure during dev
        });
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// Cache-first / Stale-while-revalidate for UI shell, scripts, styles, fonts, and images so the app opens fast on weak internet
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache real-time API or SSE streams
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests: Network first, fallback to cached /index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (networkRes) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put('/index.html', clone);
          });
          return networkRes;
        })
        .catch(function () {
          return caches.match('/index.html').then(function (cached) {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // Static UI assets (JS, CSS, fonts, images, sounds): Stale-While-Revalidate
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(req).then(function (cachedRes) {
        const networkFetch = fetch(req)
          .then(function (networkRes) {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(req, clone);
              });
            }
            return networkRes;
          })
          .catch(function () {
            return cachedRes;
          });

        return cachedRes || networkFetch;
      })
    );
  }
});

self.addEventListener('push', function (event) {
  let payload = {
    title: '🔔 تنبيه من المشرف — طلبات السكن',
    body: 'تم تحديث حالة الطلب في السكن.',
    locked: false,
    sessionStatus: 'open',
    timestamp: Date.now(),
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && parsed.title) {
        payload = parsed;
      }
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const isLocked = Boolean(payload.locked);
  const sessionStatus = payload.sessionStatus || (isLocked ? 'sent' : 'open');
  const eventTimestamp = payload.timestamp || Date.now();
  const alertTag = 'sakan-status-alert-' + sessionStatus + '-' + eventTimestamp;
  const soundUrl =
    sessionStatus === 'sent'
      ? '/sounds/supervisor-lock.wav?v=3'
      : '/sounds/supervisor-open.wav?v=3';

  const studentVibrationPattern = isLocked
    ? [400, 120, 400, 120, 600, 150, 500]
    : [250, 100, 250, 100, 500];

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        const hasOpenClient = Boolean(clientList && clientList.length > 0);
        let isSupervisorWindow = false;

        if (hasOpenClient) {
          clientList.forEach(function (client) {
            if (client.url && client.url.indexOf('mode=master') !== -1) {
              isSupervisorWindow = true;
            }
            client.postMessage({
              type: 'SUPERVISOR_LOCK_PUSH_RECEIVED',
              locked: isLocked,
              sessionStatus: sessionStatus,
              title: payload.title,
              body: payload.body,
            });
          });
        }

        if (isSupervisorWindow) {
          return;
        }

        const options = {
          body: payload.body,
          icon: '/sakan-icon-192.png',
          badge: '/sakan-icon-192.png',
          sound: soundUrl,
          dir: 'rtl',
          lang: 'ar',
          tag: alertTag,
          renotify: !hasOpenClient,
          requireInteraction: true,
          silent: hasOpenClient,
          timestamp: eventTimestamp,
          vibrate: studentVibrationPattern,
          actions: [
            {
              action: 'open_app',
              title: 'فتح طلبات السكن',
            },
          ],
          data: {
            url: '/?lockSound=' + (sessionStatus === 'sent' ? 'locked' : 'open'),
            locked: isLocked,
            sessionStatus: sessionStatus,
            timestamp: eventTimestamp,
          },
        };

        return self.registration.showNotification(payload.title, options);
      })
  );
});

self.addEventListener('message', function (event) {
  const data = event.data;
  if (!data || data.type !== 'SHOW_SYSTEM_NOTIFICATION') return;

  const isLocked = Boolean(data.locked);
  const isSupervisor = Boolean(data.isSupervisor);
  if (isSupervisor) return;

  const eventTimestamp = Date.now();
  const alertTag = 'sakan-lock-alert-' + eventTimestamp;
  const vibrationPattern = isLocked
    ? [400, 120, 400, 120, 600, 150, 500]
    : [250, 100, 250, 100, 500];

  const options = {
    body: data.body || '',
    icon: '/sakan-icon-192.png',
    badge: '/sakan-icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: alertTag,
    renotify: false,
    requireInteraction: true,
    silent: true,
    timestamp: eventTimestamp,
    vibrate: vibrationPattern,
    actions: [
      {
        action: 'open_app',
        title: 'فتح طلبات السكن',
      },
    ],
    data: {
      url: '/?lockSound=' + (isLocked ? 'locked' : 'open'),
      locked: isLocked,
    },
  };

  if (self.registration && typeof self.registration.showNotification === 'function') {
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if ('focus' in client) {
            client.postMessage({
              type: 'SUPERVISOR_LOCK_PUSH_RECEIVED',
              locked: Boolean(event.notification.data && event.notification.data.locked),
              sessionStatus: event.notification.data && event.notification.data.sessionStatus,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
