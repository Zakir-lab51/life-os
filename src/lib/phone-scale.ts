/*
  On a phone the whole interface is drawn a step larger, the way the browser's own zoom does
  it: the page is laid out a little narrower than the screen and the browser scales it up to
  fill it, so text, icons, spacing, tap targets and the timeline all grow together and the
  look stays exactly the same. At 1:1 a phone got 32 px buttons and 9–11 px captions; at
  1.125 they're 36 px and 10–12.4 px, and body text is about 16 px.

  Pages are built down to 320 px wide, so a phone is never laid out narrower than that.
  iPads and computers (a short side of 600 px or more) stay at 1:1. It's a separate
  viewport tag, added before the first paint, so the one Next.js renders is left alone; the
  browser follows the last one. It's recomputed when the phone turns.
*/
export const PHONE_SCALE = 1.125
export const MIN_LAYOUT_WIDTH = 320

/** The width a phone lays the page out at, for a screen this wide in its current orientation. */
export function phoneLayoutWidth(screenWidth: number) {
  return Math.max(Math.min(MIN_LAYOUT_WIDTH, screenWidth), Math.round(screenWidth / PHONE_SCALE))
}

export const PHONE_SCALE_SCRIPT = `try{(function(){var m=document.createElement("meta");m.name="viewport";m.id="phone-scale";document.head.appendChild(m);var p=matchMedia("(orientation: portrait)");function fit(){var a=Math.min(screen.width,screen.height),b=Math.max(screen.width,screen.height);if(a>=600){m.content="width=device-width, initial-scale=1, viewport-fit=cover";return}var w=p.matches?a:b;var l=Math.max(Math.min(${MIN_LAYOUT_WIDTH},w),Math.round(w/${PHONE_SCALE}));m.content="width="+l+", initial-scale="+(w/l).toFixed(4)+", viewport-fit=cover"}fit();p.addEventListener("change",fit)})()}catch(e){}`
