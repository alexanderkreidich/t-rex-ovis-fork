# Mac app

T-Rex for the Mac (`macos/`): a native window, Swift and AppKit with the system's WebKit, on the
same bridge and client the browser uses. It looks as the installed app does in Chrome: no title
bar, the window's buttons on T-Rex's top bar. A trial build: CI builds it, it is not released.

## Try it

Needs a Mac with Apple silicon, macOS 15 or later, and [herdr](https://herdr.dev) installed.

1. Open the latest green [Mac app run](https://github.com/alexanderkreidich/t-rex/actions/workflows/mac-app.yml)
   (signed in to GitHub) and download **T-Rex-mac-arm64** under Artifacts. It holds
   `T-Rex-arm64.zip`; open it, and move `T-Rex.app` to Applications.
2. The app is not signed with an Apple Developer ID yet, so macOS refuses to open a downloaded copy
   until its download mark is cleared once:

   ```sh
   xattr -dr com.apple.quarantine /Applications/T-Rex.app
   ```

3. Open T-Rex. With the herdr plugin running, the window joins its bridge; otherwise the app starts
   herdr (when it is not running) and its own bridge.

Or build it from a checkout ([below](#build-it)).

## What it does when it opens

The window opens at once and shows T-Rex when a bridge answers (`macos/Sources/TRex/Bridge.swift`):

1. `T_REX_URL`, when set, is the bridge: a development run against the sandbox's.
2. The app reads the login shell's environment (`$SHELL -ilc`, then `env -0`): an app opened from
   the Dock gets a bare `PATH`, and herdr's panes inherit the environment herdr is started with. A
   shell that prints nothing within 10 s leaves this process's environment, with the usual tool
   folders added. A UTF-8 `LANG` is set when no locale is.
3. A bridge already registered for this herdr (`~/.config/t-rex/bridges`: the herdr plugin's,
   `bun run start`'s) is used as it is. herdr gives each pane to one attached client, so a second
   bridge on the same herdr would take panes from the first.
4. Otherwise herdr is the first one on that `PATH`. When nothing answers on its socket,
   `herdr server` starts detached and outlives the app, as it owns every pane. A socket that is
   there but does not answer is reported, not replaced.
5. The bridge is `Contents/Resources/bridge`: the remote PC bundle for that Mac
   (`scripts/build-remote-bundle.ts`, with Bun, Node and node-pty pinned by checksum, plus
   `server/`, `shared/`, `dist/` and the production `node_modules` the server imports). The app runs
   `bin/bun server/index.ts` on a free loopback port, with that `bin/` first on `PATH` so the PTY
   sidecar finds the bundle's Node, and stops it when it quits. Its state dir is
   `~/Library/Application Support/T-Rex/state`, not the plugin's: the plugin's bridge keeps its
   settings, paired devices and remote PCs.

Logs are in `~/Library/Logs/T-Rex/` (`bridge.log`, `herdr.log`).

## The window

- The page tells the app where its top bar is and what in it takes a click
  (`macos/Resources/app.js`, injected before the page's scripts). The app centres the window's
  buttons on the bar and tells the page how far they reach; `macos/Resources/app.css` keeps that
  clear, as `src/styles.css` does for Chrome's window controls overlay. The bar's empty space moves
  the window, and a double click there zooms it (or what System Settings says).
- The window's colour follows the page's, so a resize or the full-screen animation never shows
  white.
- Links open in the browser. Closing the window keeps the app in the Dock, and the Dock icon brings
  it back. ⌘+, ⌘− and ⌘0 zoom the page and are kept.
- The page sees every key before the menu does: T-Rex's shortcuts and the terminal's ⌘C, ⌘V keep
  working, and the menu's ⌘Q, ⌘W, ⌘M and ⌘H work where the page does not take them.
- Safari's Web Inspector reaches the page (Develop → T-Rex).

## Build it

```bash
bun install && bun run build   # the client the bridge serves
bun run build:mac              # macos/build/T-Rex.app, signed ad hoc
open macos/build/T-Rex.app
```

Xcode's command line tools (Swift 6.2 or later) build `macos/`; `swift build --package-path macos`
alone checks the Swift side. The runtimes are fetched once per machine into
`~/.cache/t-rex/downloads`, by checksum.

`T_REX_URL=http://127.0.0.1:7417 macos/build/T-Rex.app/Contents/MacOS/T-Rex` opens a window on the
sandbox's bridge (`bun run sandbox`).

`bun scripts/mac-app-smoke.ts macos/build/T-Rex.app` opens the app as a user would: herdr and the
app's bridge answer and can attach terminals, the window shows T-Rex from that bridge, and quitting
stops the bridge but not herdr. `.github/workflows/mac-app.yml` runs it on a macOS runner for every
change to the app, then keeps the zip above. It is written for that disposable Mac: on yours its
window takes the keyboard, and it needs no bridge registered for your herdr.

`macos/build/T-Rex.app/Contents/MacOS/T-Rex --snapshot out.png [--size 1280x820]` draws the window
off the keyboard and nearly transparent, writes the page with the window's buttons once T-Rex
shows, and quits: the check of the window's look. With `T_REX_URL` set it touches neither herdr
nor a bridge of yours.

## Not yet

- Apple silicon only, as a CI artifact: no release, no Intel build, no Developer ID signature or
  notarization.
- The app does not update itself; Settings → Updates says to use the plugin or `bun run start`.
- Push alerts need a service worker, which WebKit gives an app's page only with a few entitlements
  this build does not have; the bell's in-page alerts work.
