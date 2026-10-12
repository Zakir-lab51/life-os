/*
  LIFE OS contrast probe, part 1 (in the page). Paste into the browser console on a
  running copy, then run `copy(lifeOsTextBoxes())` and save the clipboard as boxes.json.
  Take a screenshot of the same view without scrolling, then run
  `python scripts/contrast-measure.py screenshot.png boxes.json <window width in CSS px>`.

  Each entry: [text, x, y, width, height, font size, bold, "r,g,b,a", secondary], where
  the colour's alpha includes every ancestor's opacity and "secondary" marks text in the
  muted colours.
*/
window.lifeOsTextBoxes = (root = document.body) => {
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const rgba = (c) => {
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "#000"
    cx.fillStyle = c
    cx.fillRect(0, 0, 1, 1)
    return [...cx.getImageData(0, 0, 1, 1).data]
  }
  const items = []
  for (const el of root.querySelectorAll("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!own) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden") continue
    let opacity = 1
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) opacity *= +getComputedStyle(a).opacity
    if (opacity < 0.5) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
    const c = rgba(cs.color)
    c[3] = Math.round(c[3] * opacity)
    const secondary = el.closest("[class*=muted-foreground], [class*=muted-backdrop]") ? 1 : 0
    items.push([el.textContent.trim().slice(0, 24), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), parseFloat(cs.fontSize), +cs.fontWeight >= 600 ? 1 : 0, c.join(","), secondary])
  }
  return JSON.stringify(items)
}
