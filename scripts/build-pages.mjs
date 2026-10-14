// Builds the static copy of LIFE OS for GitHub Pages (https://zakir-lab51.github.io/life-os/)
// into out/. Run with `npm run build:pages`.
//
// Next's static export writes each page's prefetch data as nested folders
// (settings/__next.<id>/settings/__PAGE__.txt), but the app asks for one flat file
// (settings/__next.<id>.settings.__PAGE__.txt). Static hosts can't map one to the
// other, so every nested file is also written under its flat name. `.nojekyll` stops
// GitHub Pages from hiding the folders that start with an underscore.
//
// Finally it writes out/sw.js from scripts/sw.template.js: the service worker that keeps
// every file of this build on the device (offline support), with a version derived
// from the files' contents so devices pick up each new deploy.

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, GITHUB_PAGES: "1" } })
if (build.status !== 0) process.exit(build.status ?? 1)

const out = "out"
let flattened = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (!statSync(path).isDirectory()) continue
    if (name.startsWith("__next.")) flatten(dir, path)
    else walk(path)
  }
}

function flatten(parent, root) {
  const files = []
  const collect = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) collect(path)
      else files.push(path)
    }
  }
  collect(root)
  for (const file of files) {
    const flat = relative(parent, file).split(/[\\/]/).join(".")
    copyFileSync(file, join(parent, flat))
    flattened++
  }
}

walk(out)
writeFileSync(join(out, ".nojekyll"), "")

// every file to keep offline, as a path under the base path ("settings/index.html" -> "/settings/")
const files = []
const list = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (!name.startsWith("__next.")) list(path) // nested copies; the app uses the flat ones
    } else files.push(path)
  }
}
list(out)
// Fonts: only each font's basic Latin file goes into the offline install. The other
// character sets (extended Latin, Vietnamese, Cyrillic) load, and are kept, the first time
// a page needs them; installing every set of all five fonts was most of the font weight.
const laterFonts = new Set()
for (const css of files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(f, "utf8"))) {
  for (const face of css.match(/@font-face\{[^}]*\}/g) ?? []) {
    const src = face.match(/url\(([^)]+\.woff2)\)/)?.[1]
    const range = face.match(/unicode-range:([^;}]*)/)?.[1] ?? ""
    // basic Latin is U+0-FF, which minified CSS writes as U+??
    if (src && !/(^|,)\s*U\+(\?\?|0+-0*FF)(,|$)/i.test(range)) laterFonts.add(src.split("/").pop())
  }
}
const hash = createHash("sha256")
const precache = []
let fontsLater = 0
for (const file of files.sort()) {
  const rel = "/" + relative(out, file).split(/[\\/]/).join("/")
  if (rel === "/.nojekyll" || rel === "/sw.js") continue
  hash.update(rel).update(readFileSync(file))
  if (laterFonts.has(rel.split("/").pop())) {
    fontsLater++
    continue
  }
  precache.push(rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel)
}
const version = hash.digest("hex").slice(0, 12)
const sw = readFileSync("scripts/sw.template.js", "utf8").replace("__VERSION__", version).replace("__BASE__", "/life-os").replace("__PRECACHE__", JSON.stringify(precache))
writeFileSync(join(out, "sw.js"), sw)
console.log(`\nGitHub Pages build ready in out/ (${flattened} prefetch files flattened, ${precache.length} files kept offline, ${fontsLater} rarer font files on demand, version ${version}).`)
