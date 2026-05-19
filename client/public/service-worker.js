var CACHE_NAME = 'fuse-phone-v36';
var PHOTOS_CACHE = 'fuse-photos-v1';
var PHOTOS_CACHE_LIMIT = 500;
var STATIC_ASSETS = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
];

var badgeCount = 0;

function fetchWithRateLimitRetry(request, maxRetries, baseDelay) {
  return fetch(request.clone()).then(function(response) {
    if (response.status === 429 && maxRetries > 0) {
      console.warn('[SW] Rate limited (429), retrying in', baseDelay, 'ms, retries left:', maxRetries);
      return new Promise(function(resolve) {
        setTimeout(resolve, baseDelay);
      }).then(function() {
        return fetchWithRateLimitRetry(request, maxRetries - 1, baseDelay * 2);
      });
    }
    if (response.ok || response.status === 304) return response;
    return response.clone().text().then(function(body) {
      var bodyLower = (body || '').toLowerCase();
      if ((bodyLower.indexOf('rate') !== -1 || bodyLower.indexOf('exceeded') !== -1) && maxRetries > 0) {
        console.warn('[SW] Rate limit body detected, retrying in', baseDelay, 'ms');
        return new Promise(function(resolve) {
          setTimeout(resolve, baseDelay);
        }).then(function() {
          return fetchWithRateLimitRetry(request, maxRetries - 1, baseDelay * 2);
        });
      }
      return response;
    }).catch(function() {
      return response;
    });
  }).catch(function(err) {
    if (maxRetries > 0) {
      console.warn('[SW] Network error, retrying in', baseDelay, 'ms:', err.message || err);
      return new Promise(function(resolve) {
        setTimeout(resolve, baseDelay);
      }).then(function() {
        return fetchWithRateLimitRetry(request, maxRetries - 1, baseDelay * 2);
      });
    }
    throw err;
  });
}

self.addEventListener('install', function(event) {
  console.log('[SW] Installing version:', CACHE_NAME, 'origin:', self.location.origin);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[SW] Failed to cache some static assets:', err);
      });
    })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      var oldCaches = cacheNames.filter(function(name) {
        return name !== CACHE_NAME && name !== PHOTOS_CACHE && name !== 'fuse-outbox';
      });
      if (oldCaches.length > 0) {
        console.log('[SW] Deleting old caches:', oldCaches);
      }
      return Promise.all(
        oldCaches.map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.registration.navigationPreload && self.registration.navigationPreload.enable
        ? self.registration.navigationPreload.enable()
        : Promise.resolve();
    }).then(function() {
      console.log('[SW] Claiming clients');
      return clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/socket.io')) return;

  var isNavigation = event.request.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      (event.preloadResponse || Promise.resolve(null)).then(function(preloaded) {
        if (preloaded) return preloaded;
        return fetch(event.request).then(function(response) {
          if (response.status === 502 || response.status === 503 || response.status === 504) {
            return caches.match('/offline.html').then(function(cached) {
              return cached || new Response('Service temporarily unavailable', { status: 503, headers: { 'Content-Type': 'text/html' } });
            });
          }
          return response;
        });
      }).catch(function() {
        return caches.match('/offline.html').then(function(cached) {
          return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } });
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    console.log('[SW] Skipping cross-origin:', url.href, '(sw-origin:', self.location.origin + ')');
    return;
  }

  var isObjectPhoto = url.pathname.startsWith('/objects/');

  if (isObjectPhoto) {
    event.respondWith(
      caches.open(PHOTOS_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetchWithRateLimitRetry(event.request, 2, 500).then(function(response) {
            if (response.ok) {
              var clone = response.clone();
              cache.put(event.request, clone).then(function() {
                cache.keys().then(function(keys) {
                  if (keys.length > PHOTOS_CACHE_LIMIT) {
                    var excess = keys.length - PHOTOS_CACHE_LIMIT;
                    for (var i = 0; i < excess; i++) {
                      cache.delete(keys[i]);
                    }
                  }
                });
              });
            }
            return response;
          }).catch(function() {
            return new Response('', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  var isHashedAsset = url.pathname.match(/\/assets\/.*-[a-zA-Z0-9]{8,}\.(js|css)(\?.*)?$/);
  var isStaticAsset = url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?.*)?$/);

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      }).catch(function() {
        return new Response('', { status: 503, statusText: 'Offline' });
      })
    );
  } else if (isStaticAsset) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
    );
  }
});

self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  } else if (event.tag === 'check-notifications') {
    event.waitUntil(checkNotifications());
  }
});

self.addEventListener('sync', function(event) {
  if (event.tag === 'outbox-sync') {
    event.waitUntil(processOutbox());
  }
  if (event.tag === 'sync-pending') {
    event.waitUntil(syncData());
  }
});

function syncData() {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    for (var i = 0; i < clientList.length; i++) {
      clientList[i].postMessage({ type: 'PERIODIC_SYNC', tag: 'sync-data' });
    }
  });
}

function checkNotifications() {
  return fetch('/api/notifications/unread-count').then(function(response) {
    if (!response.ok) return;
    return response.json();
  }).then(function(data) {
    if (data && data.count > 0) {
      badgeCount = data.count;
      if ('setAppBadge' in self.navigator) {
        self.navigator.setAppBadge(badgeCount);
      }
    }
  }).catch(function() {});
}

function processOutbox() {
  return caches.open('fuse-outbox').then(function(cache) {
    return cache.keys();
  }).then(function(requests) {
    return Promise.all(
      requests.map(function(request) {
        return caches.open('fuse-outbox').then(function(cache) {
          return cache.match(request);
        }).then(function(response) {
          if (!response) return;
          return response.json();
        }).then(function(data) {
          if (!data) return;
          return fetch(data.url, {
            method: data.method || 'POST',
            headers: data.headers || { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.body),
            credentials: 'include'
          });
        }).then(function(fetchResponse) {
          if (fetchResponse && fetchResponse.ok) {
            return caches.open('fuse-outbox').then(function(cache) {
              return cache.delete(request);
            });
          }
        }).catch(function(err) {
          console.warn('SW: Outbox sync failed for request:', err);
        });
      })
    );
  });
}

self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    var data = event.data.json();
    var options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || ('fuse-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
      data: {
        url: data.url || '/messages',
      },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    };

    badgeCount++;

    event.waitUntil(
      self.registration.showNotification(data.title || 'Notification', options).then(function() {
        if ('setAppBadge' in navigator) {
          return navigator.setAppBadge(badgeCount);
        }
      }).then(function() {
        return clients.matchAll({ type: 'window', includeUncontrolled: true });
      }).then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          clientList[i].postMessage({
            type: 'PUSH_RECEIVED',
            tag: data.tag || '',
            url: data.url || '/messages',
          });
        }
      })
    );
  } catch (e) {
    console.error('Push event error:', e);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var url = event.notification.data?.url || '/messages';

  badgeCount = Math.max(0, badgeCount - 1);

  event.waitUntil(
    Promise.resolve().then(function() {
      if ('setAppBadge' in navigator) {
        if (badgeCount > 0) {
          return navigator.setAppBadge(badgeCount);
        } else {
          return navigator.clearAppBadge();
        }
      }
    }).then(function() {
      return clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: url });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    badgeCount = 0;
    if ('setAppBadge' in navigator) {
      navigator.clearAppBadge();
    }
  } else if (event.data && event.data.type === 'SET_BADGE') {
    badgeCount = event.data.count || 0;
    if ('setAppBadge' in navigator) {
      if (badgeCount > 0) {
        navigator.setAppBadge(badgeCount);
      } else {
        navigator.clearAppBadge();
      }
    }
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'QUEUE_OUTBOX') {
    var outboxData = event.data.payload;
    if (outboxData) {
      caches.open('fuse-outbox').then(function(cache) {
        var key = new Request('outbox-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
        cache.put(key, new Response(JSON.stringify(outboxData)));
      });
    }
  }
});
