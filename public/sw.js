// 缓存版本号：每次改动缓存策略务必 +1，旧缓存会在 activate 时清除
const CACHE_NAME = 'todo-app-v2';

// 预缓存的静态资源（仅图标/manifest 这类不常变的）
const urlsToCache = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 关键：POST / 非同源 / 所有 /api/ 请求一律直连网络，绝不经过缓存
  // （之前的版本拦截了 /api/parse 的 POST，导致 AI 解析拿到的是缓存首页 HTML）
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return; // 不调用 respondWith，交给浏览器默认网络请求
  }

  // 本地开发直连网络：dev 的 chunk 文件名不带 hash，缓存优先会让改完代码刷新还是旧版
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // 页面导航：网络优先，保证部署后刷新即见新版；断网才回退缓存首页
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // 静态资源：缓存优先，未命中取网络并缓存
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
