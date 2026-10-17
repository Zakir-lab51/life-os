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
const VERSION = "6157ac70ca66"
const BASE = "/life-os"
const PRECACHE = ["/404.html","/404/","/__next.!KG9zKQ.__PAGE__.txt","/__next._full.txt","/__next._tree.txt","/_next/static/BxkUCEjOpAI90Za8ev8g3/_buildManifest.js","/_next/static/BxkUCEjOpAI90Za8ev8g3/_clientMiddlewareManifest.js","/_next/static/BxkUCEjOpAI90Za8ev8g3/_ssgManifest.js","/_next/static/chunks/0-q9xxba96umg.js","/_next/static/chunks/02xbmo2a5gqeq.js","/_next/static/chunks/05ypog4vwg_--.js","/_next/static/chunks/07_x0bhs7gspt.js","/_next/static/chunks/07a4jutfdukrv.js","/_next/static/chunks/07kx9i7izvvlq.js","/_next/static/chunks/0_22-rehizyxk.js","/_next/static/chunks/0_wbkhnwj_5_x.js","/_next/static/chunks/0cz1d0mv5g_q7.js","/_next/static/chunks/0frrwrgu3ia5j.js","/_next/static/chunks/0h4sr1ra3b0b6.js","/_next/static/chunks/0hpjjr9gjr5l8.js","/_next/static/chunks/0i8t9_3q7ko7l.js","/_next/static/chunks/0io2c13jeao1p.js","/_next/static/chunks/0k-zirhl2oj-3.js","/_next/static/chunks/0pwdx8h48uv-z.js","/_next/static/chunks/0rzp0kesybwcf.js","/_next/static/chunks/0umogavsn2git.js","/_next/static/chunks/0vw7_7hgdgnar.js","/_next/static/chunks/0xm2esg7r36b3.js","/_next/static/chunks/11co-mi-c999y.js","/_next/static/chunks/1248pe08ox28l.js","/_next/static/chunks/151cck1htdlue.js","/_next/static/chunks/16e828iio_drk.js","/_next/static/chunks/19z_k2qzacimh.js","/_next/static/chunks/1_z3y9tgz22sn.js","/_next/static/chunks/1a9pbvzosdlko.js","/_next/static/chunks/1ao6_8x_qe0vg.js","/_next/static/chunks/1asydjlh8fis-.js","/_next/static/chunks/1c1wv-8_19-za.js","/_next/static/chunks/1dtdns44_eg9q.js","/_next/static/chunks/1gl1h4zx0f0lk.js","/_next/static/chunks/1gorl2ryzzgey.js","/_next/static/chunks/1j1vdt7cl-0jx.js","/_next/static/chunks/1o7tje9u4lfns.js","/_next/static/chunks/1rz_-93_x6sd0.js","/_next/static/chunks/1szk8up8so5is.js","/_next/static/chunks/1v6v-0fntq3z9.js","/_next/static/chunks/1zwnlnkqnbe6u.js","/_next/static/chunks/2084f8n5ndx00.js","/_next/static/chunks/20tijgstnc_c_.js","/_next/static/chunks/259nh0h-h26i1.js","/_next/static/chunks/25z43nuxui95o.js","/_next/static/chunks/268r52-_1ojq-.js","/_next/static/chunks/2_0rck_ngk7ms.js","/_next/static/chunks/2bcin-x3_hw5x.js","/_next/static/chunks/2f5ib5_c9h1-6.js","/_next/static/chunks/2mqulb7iqzwu_.js","/_next/static/chunks/2ogrde5rk744m.js","/_next/static/chunks/2syuyg_884bpp.js","/_next/static/chunks/2uecqb0_m-sm6.js","/_next/static/chunks/2vee5zxfcz1vw.js","/_next/static/chunks/2w0lvk-hul1y9.js","/_next/static/chunks/3-aowj8ca3m9g.js","/_next/static/chunks/33nj653q5ca_v.css","/_next/static/chunks/34lh34h3i1s9-.js","/_next/static/chunks/37ph4ck7jqzsn.js","/_next/static/chunks/3akzsjawr8aws.js","/_next/static/chunks/3b1pwu4kvga91.js","/_next/static/chunks/3b_2wmp42km1a.js","/_next/static/chunks/3br430trwg4ly.js","/_next/static/chunks/3dpy2a3i4qkg5.js","/_next/static/chunks/3elo5a9657e-e.css","/_next/static/chunks/3inuij-pcfa_a.js","/_next/static/chunks/3jrpq-ws-22is.js","/_next/static/chunks/3jsoy9ry7ov2-.js","/_next/static/chunks/3kb4zrcitfpbz.js","/_next/static/chunks/3lgq1rz9_xzbh.js","/_next/static/chunks/3oei-w9teagh6.js","/_next/static/chunks/3srfjz42u14tx.js","/_next/static/chunks/3u26yrb4ivm1a.js","/_next/static/chunks/3vz63xd-26d4t.js","/_next/static/chunks/3wkeuvh3o874j.js","/_next/static/chunks/3x1ch6bqji1su.js","/_next/static/chunks/3ydpnbk_6yebp.js","/_next/static/chunks/40m0k4owg-p4k.js","/_next/static/chunks/turbopack-1nd89nns0a-4_.js","/_next/static/media/0c89a48fa5027cee-s.2cyn07wtgehh0.woff2","/_next/static/media/1b99372b3eaef0c8-s.1gsd1jahc5dg_.woff2","/_next/static/media/797e433ab948586e-s.p.0r6juujl39pe6.woff2","/_next/static/media/83afe278b6a6bb3c-s.2bn3s6zvc0dyp.woff2","/_next/static/media/favicon.0oinp9zlvcv9x.ico","/_next/static/media/fba5a26ea33df6a3-s.p.18rizl4rsrl42.woff2","/_not-found/__next._full.txt","/_not-found/__next._not-found.__PAGE__.txt","/_not-found/__next._tree.txt","/_not-found/","/_not-found/index.txt","/analytics/__next.!KG9zKQ.analytics.__PAGE__.txt","/analytics/__next._full.txt","/analytics/__next._tree.txt","/analytics/","/analytics/index.txt","/backgrounds/mountains-sm.webp","/backgrounds/mountains.webp","/calendar/__next.!KG9zKQ.calendar.__PAGE__.txt","/calendar/__next._full.txt","/calendar/__next._tree.txt","/calendar/","/calendar/index.txt","/favicon.ico","/focus/__next.!KG9zKQ.focus.__PAGE__.txt","/focus/__next._full.txt","/focus/__next._tree.txt","/focus/","/focus/index.txt","/goals/__next.!KG9zKQ.goals.__PAGE__.txt","/goals/__next._full.txt","/goals/__next._tree.txt","/goals/","/goals/index.txt","/habits/__next.!KG9zKQ.habits.__PAGE__.txt","/habits/__next._full.txt","/habits/__next._tree.txt","/habits/","/habits/index.txt","/icons/apple-touch-icon.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-512.png","/","/index.txt","/manifest.webmanifest","/notes/__next.!KG9zKQ.notes.__PAGE__.txt","/notes/__next._full.txt","/notes/__next._tree.txt","/notes/","/notes/index.txt","/projects/__next.!KG9zKQ.projects.__PAGE__.txt","/projects/__next._full.txt","/projects/__next._tree.txt","/projects/","/projects/index.txt","/settings/__next.!KG9zKQ.settings.__PAGE__.txt","/settings/__next._full.txt","/settings/__next._tree.txt","/settings/","/settings/index.txt","/tasks/__next.!KG9zKQ.tasks.__PAGE__.txt","/tasks/__next._full.txt","/tasks/__next._tree.txt","/tasks/","/tasks/index.txt","/today/__next.!KG9zKQ.today.__PAGE__.txt","/today/__next._full.txt","/today/__next._tree.txt","/today/","/today/index.txt"]
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
