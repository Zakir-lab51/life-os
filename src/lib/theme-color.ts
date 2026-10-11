/*
  The browser/status-bar colour (meta theme-color). On iPad and iPhone home-screen apps
  the status bar gets its own strip in this colour (status bar style "default"), so it
  should match the app's chosen theme rather than the device's. The two values are the
  page background (--background) in each theme.
*/
export const THEME_COLORS = { light: "#f7f6f9", dark: "#09080a" } as const

/** Points meta[name=theme-color] at the colour for this theme. */
export function setThemeColor(theme: "light" | "dark") {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement("meta")
    meta.name = "theme-color"
    document.head.appendChild(meta)
  }
  meta.content = THEME_COLORS[theme]
}

/** Inline <head> script: picks the colour from the saved theme (next-themes' "theme" key) before the app loads. */
export const THEME_COLOR_SCRIPT = `try{var t=localStorage.getItem("theme")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)})}catch(e){}`
