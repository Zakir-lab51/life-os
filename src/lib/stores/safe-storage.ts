import { createJSONStorage } from "zustand/middleware"

/** localStorage when available; a no-op store on the server or when storage is blocked. */
export const safeStorage = createJSONStorage(() => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const probe = "__life_os_probe__"
      window.localStorage.setItem(probe, "1")
      window.localStorage.removeItem(probe)
      return window.localStorage
    }
  } catch {
    // private mode or blocked storage: fall through
  }
  const memory = new Map<string, string>()
  return {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  }
})
