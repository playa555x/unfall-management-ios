// Service Worker für iPhone-optimierte Unfall-Management PWA
const CACHE_NAME = 'unfall-manager-ios-v1.2.0';
const STATIC_CACHE = 'static-v1.2.0';
const DYNAMIC_CACHE = 'dynamic-v1.2.0';

// URLs für statisches Caching
const staticAssets = [
  '/unfall-management-ios/',
  '/unfall-management-ios/index.html',
  '/unfall-management-ios/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// URLs für dynamisches Caching
const dynamicAssets = [
  'https://fonts.gstatic.com/',
  '/unfall-management-ios/apple-touch-icon',
  '/unfall-management-ios/icon-',
  '/unfall-management-ios/splash-'
];

// iOS-spezifische Cache-Strategien
const iOSOptimizations = {
  // Längere Cache-Zeiten für iOS
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage
  // Kleinere Cache-Größe für iOS Memory Management
  maxEntries: 50,
  // Aggressive Cleanup für iOS
  cleanupInterval: 2 * 60 * 60 * 1000 // 2 Stunden
};

// Install Event - Optimiert für iOS
self.addEventListener('install', event => {
  console.log('[SW] Installing iOS-optimized Service Worker');
  
  event.waitUntil(
    Promise.all([
      // Statische Assets cachen
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW] Caching static assets for iOS');
        return cache.addAll(staticAssets).catch(error => {
          console.warn('[SW] Failed to cache some static assets:', error);
          // Versuche einzeln zu cachen für bessere iOS-Kompatibilität
          return Promise.allSettled(
            staticAssets.map(url => cache.add(url))
          );
        });
      }),
      
      // Dynamic Cache initialisieren
      caches.open(DYNAMIC_CACHE).then(cache => {
        console.log('[SW] Dynamic cache initialized for iOS');
        return cache;
      })
    ]).then(() => {
      console.log('[SW] iOS Service Worker installation complete');
      return self.skipWaiting(); // Sofort aktivieren für iOS
    }).catch(error => {
      console.error('[SW] Installation failed:', error);
      throw error;
    })
  );
});

// Activate Event - iOS Memory Management
self.addEventListener('activate', event => {
  console.log('[SW] Activating iOS-optimized Service Worker');
  
  event.waitUntil(
    Promise.all([
      // Alte Caches löschen
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache for iOS memory:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // iOS-spezifische Initialisierung
      initializeIOSFeatures()
    ]).then(() => {
      console.log('[SW] iOS Service Worker activated');
      return self.clients.claim();
    })
  );
});

// iOS-spezifische Features initialisieren
async function initializeIOSFeatures() {
  try {
    // iOS Safari spezifische Optimierungen
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
      console.log('[SW] Navigation preload enabled for iOS');
    }
    
    // Background Sync für iOS (falls unterstützt)
    if ('sync' in self.registration) {
      console.log('[SW] Background sync available for iOS');
    }
    
    // Periodic Background Sync (experimentell für iOS)
    if ('periodicSync' in self.registration) {
      console.log('[SW] Periodic sync available for iOS');
    }
    
  } catch (error) {
    console.warn('[SW] Some iOS features not available:', error);
  }
}

// Fetch Event - iOS-optimierte Request Handling
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Nur HTTP/HTTPS Requests für iOS
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // iOS Safari spezifische URL-Filter
  if (url.pathname.includes('__webpack') || 
      url.pathname.includes('hot-update') ||
      url.search.includes('_sw-precache')) {
    return;
  }
  
  // Bestimme Strategie basierend auf Request-Typ
  if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else if (isAPIRequest(request)) {
    event.respondWith(handleAPIRequest(request));
  } else if (isNavigationRequest(request)) {
    event.respondWith(handleNavigationRequest(request));
  } else {
    event.respondWith(handleDynamicRequest(request));
  }
});

// Statische Assets (Cache First für iOS)
async function handleStaticAsset(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] iOS Cache hit:', request.url);
      
      // Background Update für iOS
      updateCacheInBackground(request, cache);
      
      return cachedResponse;
    }
    
    // Fallback zu Network
    console.log('[SW] iOS Cache miss, fetching:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Clone für iOS Memory Management
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[SW] Static asset error:', error);
    return new Response('Asset not available offline', { 
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// API Requests (Network First für iOS)
async function handleAPIRequest(request) {
  try {
    // iOS Network Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s für iOS
    
    const networkResponse = await fetch(request, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      // Cache für iOS Offline Support
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn('[SW] API request failed, trying cache:', error);
    
    // Fallback zu Cache für iOS
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Offline Response für iOS
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'Diese Funktion ist offline nicht verfügbar'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Navigation Requests (für iOS SPA)
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Navigation failed, serving cached index:', error);
    
    // Fallback zur cached index.html für iOS
    const cache = await caches.open(STATIC_CACHE);
    const cachedIndex = await cache.match('/index.html') || 
                       await cache.match('/');
    
    if (cachedIndex) {
      return cachedIndex;
    }
    
    // Offline Fallback für iOS
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - Unfall-Manager</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
          }
          .offline-message {
            background: rgba(255,255,255,0.1);
            padding: 30px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
        </style>
      </head>
      <body>
        <div class="offline-message">
          <h1>🏥 Unfall-Manager</h1>
          <h2>📱 Offline Modus</h2>
          <p>Du bist momentan offline. Die App wird automatisch synchronisiert, sobald eine Internetverbindung verfügbar ist.</p>
          <button onclick="window.location.reload()" style="
            background: #667eea; 
            color: white; 
            border: none; 
            padding: 15px 30px; 
            border-radius: 10px; 
            font-size: 16px;
            margin-top: 20px;
          ">🔄 Erneut versuchen</button>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Dynamische Requests (für iOS)
async function handleDynamicRequest(request) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    
    // Versuche Network First für iOS
    try {
      const networkResponse = await fetch(request);
      
      if (networkResponse.ok) {
        // iOS Memory Management - limitiere Cache-Größe
        await manageCacheSize(cache);
        await cache.put(request, networkResponse.clone());
      }
      
      return networkResponse;
      
    } catch (networkError) {
      // Fallback zu Cache für iOS
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        console.log('[SW] iOS serving from cache:', request.url);
        return cachedResponse;
      }
      throw networkError;
    }
    
  } catch (error) {
    console.error('[SW] Dynamic request failed:', error);
    return new Response('Content not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Background Cache Update für iOS
async function updateCacheInBackground(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse);
      console.log('[SW] iOS background cache updated:', request.url);
    }
  } catch (error) {
    console.warn('[SW] iOS background update failed:', error);
  }
}

// iOS Cache Size Management
async function manageCacheSize(cache) {
  try {
    const keys = await cache.keys();
    
    if (keys.length > iOSOptimizations.maxEntries) {
      // Lösche älteste Einträge für iOS Memory Management
      const entriesToDelete = keys.length - iOSOptimizations.maxEntries + 5;
      
      for (let i = 0; i < entriesToDelete; i++) {
        await cache.delete(keys[i]);
      }
      
      console.log(`[SW] iOS cache cleaned: removed ${entriesToDelete} entries`);
    }
  } catch (error) {
    console.warn('[SW] iOS cache management failed:', error);
  }
}

// Helper Functions
function isStaticAsset(request) {
  const url = new URL(request.url);
  return staticAssets.some(asset => url.pathname.includes(asset)) ||
         url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/);
}

function isAPIRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || 
         url.pathname.includes('api') ||
         request.method !== 'GET';
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
         (request.method === 'GET' && 
          request.headers.get('accept').includes('text/html'));
}

// iOS Background Sync
self.addEventListener('sync', event => {
  console.log('[SW] iOS Background Sync:', event.tag);
  
  if (event.tag === 'ios-sync-data') {
    event.waitUntil(syncDataForIOS());
  } else if (event.tag === 'ios-sync-diary') {
    event.waitUntil(syncDiaryForIOS());
  }
});

// iOS Data Sync
async function syncDataForIOS() {
  try {
    console.log('[SW] Syncing data for iOS...');
    
    // Hier würde normalerweise eine API-Synchronisation stattfinden
    // Da wir localStorage verwenden, simulieren wir den Sync
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'IOS_SYNC_COMPLETE',
        data: 'Data synchronized for iOS'
      });
    });
    
    console.log('[SW] iOS data sync completed');
  } catch (error) {
    console.error('[SW] iOS data sync failed:', error);
    throw error;
  }
}

// iOS Diary Sync
async function syncDiaryForIOS() {
  try {
    console.log('[SW] Syncing diary for iOS...');
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'IOS_DIARY_SYNC_COMPLETE',
        data: 'Diary synchronized for iOS'
      });
    });
    
    console.log('[SW] iOS diary sync completed');
  } catch (error) {
    console.error('[SW] iOS diary sync failed:', error);
    throw error;
  }
}

// iOS Push Notifications (falls unterstützt)
self.addEventListener('push', event => {
  console.log('[SW] iOS Push received:', event);
  
  if (!event.data) {
    return;
  }

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Neue Benachrichtigung vom Unfall-Manager',
      icon: '/apple-touch-icon-180x180.png',
      badge: '/apple-touch-icon-76x76.png',
      vibrate: [200, 100, 200, 100, 200], // iOS Vibration Pattern
      data: data.data || {},
      actions: [
        {
          action: 'open',
          title: 'Öffnen',
          icon: '/apple-touch-icon-120x120.png'
        },
        {
          action: 'close',
          title: 'Schließen'
        }
      ],
      requireInteraction: false, // iOS bevorzugt non-persistent
      tag: data.tag || 'unfall-manager-ios-notification',
      renotify: true,
      silent: false
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || 'Unfall-Manager', 
        options
      )
    );
  } catch (error) {
    console.error('[SW] iOS push notification error:', error);
  }
});

// iOS Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('[SW] iOS Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // iOS App öffnen oder fokussieren
  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(clientList => {
      // iOS Safari Tab Management
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Neuen iOS Safari Tab öffnen
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// iOS Message Handler
self.addEventListener('message', event => {
  console.log('[SW] iOS Message received:', event.data);
  
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_NAME });
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        Promise.all([
          caches.delete(STATIC_CACHE),
          caches.delete(DYNAMIC_CACHE),
          caches.delete(CACHE_NAME)
        ]).then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
      );
      break;
      
    case 'IOS_FORCE_SYNC':
      event.waitUntil(syncDataForIOS());
      break;
      
    case 'IOS_CACHE_STATUS':
      event.waitUntil(
        getCacheStatus().then(status => {
          event.ports[0]?.postMessage({ cacheStatus: status });
        })
      );
      break;
  }
});

// iOS Cache Status
async function getCacheStatus() {
  try {
    const [staticCache, dynamicCache] = await Promise.all([
      caches.open(STATIC_CACHE),
      caches.open(DYNAMIC_CACHE)
    ]);
    
    const [staticKeys, dynamicKeys] = await Promise.all([
      staticCache.keys(),
      dynamicCache.keys()
    ]);
    
    return {
      static: staticKeys.length,
      dynamic: dynamicKeys.length,
      total: staticKeys.length + dynamicKeys.length,
      maxEntries: iOSOptimizations.maxEntries
    };
  } catch (error) {
    console.error('[SW] iOS cache status error:', error);
    return { error: error.message };
  }
}

// iOS Periodic Cache Cleanup
setInterval(async () => {
  try {
    console.log('[SW] iOS periodic cleanup starting...');
    
    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    await manageCacheSize(dynamicCache);
    
    // iOS Memory Pressure Detection (simuliert)
    if (performance.memory && performance.memory.usedJSHeapSize > 50000000) {
      console.log('[SW] iOS memory pressure detected, aggressive cleanup');
      const keys = await dynamicCache.keys();
      const deleteCount = Math.floor(keys.length * 0.3); // 30% löschen
      
      for (let i = 0; i < deleteCount; i++) {
        await dynamicCache.delete(keys[i]);
      }
    }
    
    console.log('[SW] iOS periodic cleanup completed');
  } catch (error) {
    console.error('[SW] iOS periodic cleanup failed:', error);
  }
}, iOSOptimizations.cleanupInterval);

// iOS Error Handlers
self.addEventListener('error', event => {
  console.error('[SW] iOS Service Worker error:', event.error);
  
  // iOS Error Reporting (könnte an Analytics gesendet werden)
  if (event.error && event.error.stack) {
    console.error('[SW] iOS Error Stack:', event.error.stack);
  }
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] iOS Unhandled promise rejection:', event.reason);
  
  // iOS Promise Rejection Handling
  event.preventDefault(); // Verhindert Konsolen-Spam auf iOS
});

// iOS Visibility Change (App Background/Foreground)
self.addEventListener('visibilitychange', event => {
  console.log('[SW] iOS Visibility changed:', document.visibilityState);
  
  if (document.visibilityState === 'visible') {
    // App wurde aktiviert - iOS Sync triggern
    self.registration.sync?.register('ios-sync-data');
  }
});

console.log('[SW] iOS-optimized Service Worker loaded successfully');

// iOS Performance Monitoring
if ('performance' in self && 'mark' in performance) {
  performance.mark('sw-ios-loaded');
}

