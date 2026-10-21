// Top-Level Synchronous Push & Lock-Screen Notification Service Worker for Sakan Orders

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  let payload = {
    title: '🔔 تنبيه من المشرف — طلبات السكن',
    body: 'تم تحديث حالة استقبال الطلبات في السكن.',
    locked: false,
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
  const eventTimestamp = payload.timestamp || Date.now();
  const alertTag = 'sakan-lock-alert-' + eventTimestamp;
  const soundUrl = isLocked
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
              title: payload.title,
              body: payload.body,
            });
          });
        }

        // If this phone is currently on the Supervisor screen, do not show or vibrate a push alert
        if (isSupervisorWindow) {
          return;
        }

        // When the app is open or in background (hasOpenClient = true), the client plays the 3.6s
        // custom distinctive audio directly — so we set silent: true here to prevent the phone's
        // default notification tone from playing over our custom sound.
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
            url: '/?lockSound=' + (isLocked ? 'locked' : 'open'),
            locked: isLocked,
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

  // silent: true ensures ONLY our 3.6-second distinctive custom audio plays,
  // never the phone's default notification sound.
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
