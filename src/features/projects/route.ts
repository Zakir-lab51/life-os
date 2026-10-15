"use client"

import { useSyncExternalStore } from "react"

/*
  A project opens as its own page inside /projects, kept in the URL hash
  (/projects#pr_…), so it survives a reload, can be linked to from anywhere, and the
  browser's Back button returns to the list. pushState doesn't fire "hashchange", so
  opening one in place also sends a "life-os:project" event.
*/
const EVENT = "life-os:project"

function read(): string | null {
  const h = decodeURIComponent(window.location.hash.slice(1))
  return h.startsWith("pr_") ? h : null
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb)
  window.addEventListener("popstate", cb)
  window.addEventListener(EVENT, cb)
  // Next's own navigations (the sidebar's Projects link while a project is open) change the URL without any event
  const poll = window.setInterval(cb, 300)
  return () => {
    window.removeEventListener("hashchange", cb)
    window.removeEventListener("popstate", cb)
    window.removeEventListener(EVENT, cb)
    window.clearInterval(poll)
  }
}

/** The project open on the Projects page, or null while it shows the list. */
export function useOpenProjectId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

export const projectHref = (id: string) => `/projects#${id}`

const onProjectsPage = () => /\/projects\/?$/.test(window.location.pathname)

/** Opens a project's page: in place on the Projects page, otherwise by navigating there. */
export function openProject(id: string, navigate: (href: string) => void) {
  if (!onProjectsPage()) return navigate(projectHref(id))
  if (read() === id) return
  history.pushState({ ...history.state, fromProjectList: read() === null }, "", `#${id}`)
  window.scrollTo({ top: 0 })
  window.dispatchEvent(new Event(EVENT))
}

/** Back to the list. When the list is where the project was opened from, this steps back, so Back doesn't reopen it. */
export function closeProject() {
  if (history.state?.fromProjectList) return history.back()
  history.pushState({ ...history.state, fromProjectList: false }, "", window.location.pathname + window.location.search)
  window.scrollTo({ top: 0 })
  window.dispatchEvent(new Event(EVENT))
}
