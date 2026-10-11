// Publishes LIFE OS to https://zakir-lab51.github.io/life-os/: runs the tests, builds the
// static copy into out/ (scripts/build-pages.mjs), then pushes out/ as the only commit
// on the gh-pages branch, which GitHub Pages serves. Run with `npm run deploy:pages`.

import { spawnSync } from "node:child_process"

const run = (cmd, args, opts = {}) => {
  // npm is a .cmd script on Windows and needs a shell; git doesn't (and a shell would split the commit message)
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" && cmd === "npm", ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
const read = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" }).stdout.trim()

const remote = read("git", ["remote", "get-url", "origin"])
if (!remote) {
  console.error("No git remote called origin.")
  process.exit(1)
}
const source = read("git", ["rev-parse", "--short", "HEAD"])

run("npm", ["test"])
run("node", ["scripts/build-pages.mjs"])

const inOut = { cwd: "out" }
run("git", ["init", "-q", "-b", "gh-pages"], inOut)
run("git", ["add", "-A"], inOut)
run("git", ["commit", "-q", "-m", `Deploy ${source}`], inOut)
run("git", ["push", "-q", "--force", remote, "gh-pages"], inOut)
console.log(`\nPublished ${source} to https://zakir-lab51.github.io/life-os/ (GitHub Pages updates within a minute or two).`)
