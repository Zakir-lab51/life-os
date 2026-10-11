"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/*
  Turns on offline support in the published copy (GitHub Pages): registers the service
  worker that keeps the whole app on the device (see scripts/sw.template.js). Local
  development never registers it. When a newer version has been saved in the
  background, a toast offers to reload into it.
*/
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_OFFLINE !== "1" || !("serviceWorker" in navigator)) return
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
    const hadController = !!navigator.serviceWorker.controller
    const updated = () => {
      if (!hadController) return
      toast("LIFE OS has been updated", { description: "Reload to use the new version.", action: { label: "Reload", onClick: () => location.reload() }, duration: 15000 })
    }
    navigator.serviceWorker.addEventListener("controllerchange", updated)
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {})
    return () => navigator.serviceWorker.removeEventListener("controllerchange", updated)
  }, [])
  return null
}
