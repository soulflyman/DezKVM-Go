# Fork Changelog

This is a community fork of [tobychui/DezKVM-Go](https://github.com/tobychui/DezKVM-Go). It tracks upstream but adds the fixes and features listed below, which are not present in the original project. Several entries were implemented with AI coding assistance (noted per entry); those changes are also marked inline in the source with `AI-assisted` comments.

## Video capture device detection & connection (AI-assisted)

- Fixed a false-positive "VID:PID could not be confirmed" warning and unreliable auto-selection when two devices share the same USB PID (e.g. Gen1 `534d:2109` and Gen2 `345f:2109`) — exact VID:PID matches are now always preferred over partial PID-only matches, across all supported device pairs.
- Fixed a Chrome-specific bug where video would flicker or fail to reconnect: the `devicechange` handler no longer unconditionally restarts the stream, only when the current stream is actually unhealthy or the device has disappeared.
- Fixed Chrome sometimes failing to connect even after correctly detecting the right device, by adding a fallback, unconstrained `getUserMedia` attempt instead of dead-ending in an alert when strict resolution/framerate constraints were rejected.
- Added a manual capture-device selection dialog (with live preview) for cases where automatic detection can't find a confident match, when more than one device has a valid VID:PID pair, or on Firefox (which never exposes VID:PID in device labels).

## Serial (CH9329) connection diagnostics

- Surfaced previously-silent serial connection/write errors as toast notifications instead of failing invisibly, which was part of the "input paired but nothing forwards, no errors" symptom.
- Removed a false-positive "initial handshake failed" warning after pairing — the underlying handshake retry logic remains, but the warning proved to be an unreliable indicator on some setups (input worked fine despite it firing), so it's now a console log only rather than a user-facing toast.

## Display settings

- Added video scaling modes to Settings > Display: Fill (stretch to fit, previous default behavior), Fit (scale down to fit without upscaling), and 1:1 Native (exact source resolution, scrollable).
- Added a color saturation slider to Settings > Display, for capture cards that render some colors pale/washed out.

## Keep Remote Awake (formerly "Mouse Jiggler")

- Added two alternative keep-awake methods alongside the original mouse-jiggle: periodic Ctrl tap, and periodic Right/Left arrow tap (useful when the remote is a headless Linux shell, where mouse movement has no effect but a keypress resets both application- and shell/SSH-level idle timeouts).

## Keyboard capture mode (AI-assisted)

- Added an optional keyboard capture mode (via the Keyboard Lock API, Chromium-based browsers only) that, while the viewer is fullscreen, captures OS-reserved key combinations such as the Windows key and Alt+Tab and forwards them to the remote instead of letting the local OS intercept them.

## Non-US keyboard layout support (AI-assisted)

- Fixed live keyboard forwarding (typing, toggle-key taps, and Stacked Keys) producing wrong or missing characters on non-US keyboard layouts (e.g. German: `ß`, `ü`, `ö`, `ä`, the ISO extra key). Forwarding now uses the physical key position (`KeyboardEvent.code`) mapped through the standard USB HID Usage Table, instead of the legacy, US-layout-only `keyCode` value, so the correct physical key reaches the remote regardless of either side's configured layout.
- Fixed Paste to Remote silently dropping umlauts (`ü`, `ö`, `ä`, `ß`) and sending the wrong symbol for several punctuation characters (`< > [ ] { } | \ ~` and others) when the remote uses a German (QWERTZ) layout. Added a "Paste Keyboard Layout" setting (Settings > Keyboard & Mouse) with US and German character tables, each mapping every character to its correct physical key and modifiers (including AltGr) for that specific remote layout — since pasted text has no live `KeyboardEvent` to read a physical position from, unlike live typing above. On the German table, the two dead-key characters (´ acute, ^ circumflex) and the backtick `` ` `` (which shares the dead-grave key) still can't be sent as a single keypress and are reported as skipped, same as any other unsupported character.

## Paste to Remote reliability (AI-assisted)

- Fixed the Paste to Remote modal getting permanently stuck showing "Sending..." if the serial port wasn't connected (or dropped mid-paste): the old "not connected" check never actually detected this case, and any error partway through sending left the Send/Cancel buttons and progress bar stuck with no way to recover except reloading the page. Sending now correctly detects a missing serial connection up front, and always restores the UI afterward regardless of how sending ends. Also fixed a related issue where a failed keystroke mid-paste could leave Shift or AltGr stuck "held," corrupting subsequent keystrokes (including live typing) until reload.

## Offline-capable dependencies (AI-assisted)

- Removed the last runtime dependency on an external CDN: Fomantic-UI (2.9.4, already the latest release) is now vendored locally under `scripts/fomantic-ui/` instead of being loaded from `cdnjs.cloudflare.com`, alongside the already-local jQuery. This is a step toward the app being installable/usable with no internet connection (e.g. as a PWA); it does not change any behavior. jQuery was left on 3.7.1 (the latest 3.x release) rather than bumped to the newly-released jQuery 4.0.0, since Fomantic-UI's jQuery-based modules haven't confirmed compatibility with that breaking major version.
- Added a PWA manifest (`manifest.json`, linked from `index.html`) with app icons (192px/512px, generated from the existing logo) so the app can be installed as a standalone app from the browser instead of only running as a regular tab, plus `apple-touch-icon`/`apple-mobile-web-app-*` meta tags for iOS home-screen installs. Note this only covers installability — it does not yet make the app work with zero network connectivity on first load, since that requires a service worker to cache assets, which hasn't been added yet.
