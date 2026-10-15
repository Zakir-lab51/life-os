"use client"

import { useSyncExternalStore } from "react"

/*
  A record that opens as its own page inside a route, kept in the URL hash
  (/projects#pr_…, /notes#n_…), so it survives a reload, can be linked to from anywhere,
  and the browser's Back button returns to the list. pushState doesn't fire
  "hashchange", so opening one in place also sends a "life-os:hash" event.
*/
const EVENT = "life-os:hash"

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb)
  window.addEventListener("popstate", cb)
  window.addEventListener(EVENT, cb)
  // Next's own navigations (the sidebar's link to the page while a record is open) change the URL without any event
  const poll = window.setInterval(cb, 300)
  return () => {
    window.removeEventListener("hashchange", cb)
    window.removeEventListener("popstate", cb)
    window.removeEventListener(EVENT, cb)
    window.clearInterval(poll)
  }
}

export interface HashRoute {
  /** The record open on the page, or null while it shows the list. */
  useOpenId: () => string | null
  href: (id: string) => string
  /** Opens a record: in place on its page, otherwise by navigating there. */
  open: (id: string, navigate: (href: string) => void) => void
  /** Back to the list. When the list is where the record was opened from, this steps back, so Back doesn't reopen it. */
  close: () => void
}

/** `path` is the page ("/projects"); `matches` says which hashes are records of it. */
export function hashRoute(path: string, matches: (hash: string) => boolean): HashRoute {
  const read = (): string | null => {
    const h = decodeURIComponent(window.location.hash.slice(1))
    return h && matches(h) ? h : null
  }
  const here = new RegExp(`${path.replace(/\//g, "\\/")}\\/?$`)
  const onPage = () => here.test(window.location.pathname)
  const announce = () => {
    window.scrollTo({ top: 0 })
    window.dispatchEvent(new Event(EVENT))
  }
  return {
    useOpenId: () => useSyncExternalStore(subscribe, read, () => null),
    href: (id) => `${path}#${encodeURIComponent(id)}`,
    open: (id, navigate) => {
      if (!onPage()) return navigate(`${path}#${encodeURIComponent(id)}`)
      if (read() === id) return
      history.pushState({ ...history.state, fromList: read() === null }, "", `#${encodeURIComponent(id)}`)
      announce()
    },
    close: () => {
      if (history.state?.fromList) return history.back()
      history.pushState({ ...history.state, fromList: false }, "", window.location.pathname + window.location.search)
      announce()
    },
  }
}
