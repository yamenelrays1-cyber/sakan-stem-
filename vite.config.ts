import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const FALLBACK_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0265025778',
  appId: '1:95540180740:web:c206c37d33aa1b9d748251',
  apiKey: 'AIzaSyCi0C79esQwD8Pya6D6B-4vHaayi0i0pBA',
  authDomain: 'gen-lang-client-0265025778.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-ccc0553f-b13f-46a4-b683-153bfde9bb70',
  storageBucket: 'gen-lang-client-0265025778.firebasestorage.app',
  messagingSenderId: '95540180740',
  measurementId: '',
  oAuthClientId: '95540180740-t1qah73a8f6dn1341ceullg8769rqfe8.apps.googleusercontent.com',
  recaptchaSiteKey: '',
};

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'firebase-applet-config-fallback',
        resolveId(source) {
          if (source.endsWith('firebase-applet-config.json')) {
            const configPath = path.resolve(import.meta.dirname, 'firebase-applet-config.json');
            if (!fs.existsSync(configPath)) {
              return '\0virtual:firebase-applet-config';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0virtual:firebase-applet-config') {
            return `export default ${JSON.stringify(FALLBACK_FIREBASE_CONFIG)};`;
          }
          return null;
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'sakan-icon-192.png', 'sakan-icon-512.png'],
        manifest: false, // Uses /public/manifest.webmanifest
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: false,
    },
  };
});
