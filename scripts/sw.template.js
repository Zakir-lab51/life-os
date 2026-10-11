/*
  LIFE OS service worker (written into out/sw.js by scripts/build-pages.mjs, which fills
  in VERSION, BASE and PRECACHE). It keeps the whole app on the device so it opens
  instantly and works offline:
  - install: downloads every file of this version into its own cache
  - build files (/_next/static, content-hashed): served from the cache
  - pages, page data and other files: served from the cache straight away and
    refreshed in the background, so the next launch has any update
  - activate: keeps this version and the one before it (a page still open on the old
    version may lazy-load its files), drops anything older
*/
const VERSION = "__VERSION__"
const BASE = "__BASE__"
const PRECACHE = __PRECACHE__
const PREFIX = "life-os-"
const CACHE = PREFIX + VERSION

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      for (let i = 0; i < PRECACHE.length; i += 8) {
        // one missing file shouldn't stop the rest from being saved
        await Promise.all(PRECACHE.slice(i, i + 8).map((path) => cache.add(new Request(BASE + path, { cache: "reload" })).catch(() => {})))
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE)
      // cache names don't carry dates, so keep the most recently opened older one
      const keep = keys.slice(-1)
      await Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

const isOurs = (url) => url.origin === self.location.origin && (url.pathname === BASE || url.pathname.startsWith(BASE + "/"))

async function fromCache(request) {
  const cache = await caches.open(CACHE)
  return (await cache.match(request, { ignoreSearch: true })) || (await caches.match(request, { ignoreSearch: true }))
}

async function save(request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return
  const cache = await caches.open(CACHE)
  await cache.put(request, response)
}

async function navigationFallback(url) {
  const withSlash = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/"
  return (await fromCache(new Request(url.origin + withSlash))) || (await fromCache(new Request(url.origin + BASE + "/")))
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (!isOurs(url)) return

  if (url.pathname.startsWith(BASE + "/_next/static/")) {
    event.respondWith(
      (async () => {
        const hit = await fromCache(request)
        if (hit) return hit
        const response = await fetch(request)
        event.waitUntil(save(request, response.clone()))
        return response
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const hit = (await fromCache(request)) || (request.mode === "navigate" ? await navigationFallback(url) : undefined)
      const refresh = fetch(request).then(async (response) => {
        await save(request, response.clone())
        return response
      })
      if (hit) {
        event.waitUntil(refresh.catch(() => {}))
        return hit
      }
      try {
        return await refresh
      } catch (error) {
        const fallback = request.mode === "navigate" ? await navigationFallback(url) : undefined
        if (fallback) return fallback
        throw error
      }
    })(),
  )
})
