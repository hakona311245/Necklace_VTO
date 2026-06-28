# Command Book

Quick commands and test URLs for the necklace WebAR app.

## Run Locally

Run these from the repo root:

```powershell
cd D:\Coding\Necklace_VTO
python -m http.server 8765
```

Open on the same computer:

```text
http://127.0.0.1:8765/
```

Use a local server instead of opening `index.html` directly. Camera and asset loading are more reliable over HTTP/HTTPS than `file://`.

## Start A Cloudflare Tunnel

Keep the local server running, then open a second PowerShell window:

```powershell
cloudflared tunnel --url http://127.0.0.1:8765
```

Cloudflare will print a public HTTPS URL like:

```text
https://example-name.trycloudflare.com
```

Use that HTTPS URL on your phone. Replace `https://example-name.trycloudflare.com` in the examples below with the URL Cloudflare prints.

## Base Addresses

Desktop local:

```text
http://127.0.0.1:8765/
```

Mobile through Cloudflare:

```text
https://example-name.trycloudflare.com/
```

## Common Test URLs

Current recommended mobile test:

```text
https://example-name.trycloudflare.com/?v=phase5b-2
```

Phase 5b idle test:

```text
https://example-name.trycloudflare.com/?v=phase5b-2
```

Phase 5b idle comparison, chain settle off:

```text
https://example-name.trycloudflare.com/?chainSettle=off&v=phase5b-2
```

Phase 5b slow-turn test:

```text
https://example-name.trycloudflare.com/?v=phase5b-2
```

Old camera fallback:

```text
https://example-name.trycloudflare.com/?cameraProfile=current
```

Standard camera profile explicitly:

```text
https://example-name.trycloudflare.com/?cameraProfile=standardIdeal
```

Full diagnostic comparison URL:

```text
https://example-name.trycloudflare.com/?cameraProfile=standardIdeal&v=phase5b-2
```

## Query Settings

Camera profile:

```text
?cameraProfile=standardIdeal
?cameraProfile=current
```

`standardIdeal` is the current default. `current` is the old camera request fallback.

Physics profile:

```text
?physics=default
?physics=mobile
?physics=calm
```

`default` is desktop baseline. `calm` is the current mobile auto profile. `mobile` remains as the older mobile fallback for comparison.

Pose jump damping:

```text
?poseJumpDamping=on
?poseJumpDamping=off
```

Pose quality gate:

```text
?poseQuality=on
?poseQuality=off
```

Derived visual filter:

```text
?derivedFilter=on
?derivedFilter=off
```

On mobile, derived filter is on by default. On desktop, it stays off unless explicitly enabled.

Soft chain idle settling:

```text
?chainSettle=on
?chainSettle=off
```

By default, mobile/coarse-pointer devices now use the accepted Phase 5b stack: `calm` physics, pose jump damping on, pose quality on, derived filter on, and chain settling on. Desktop keeps the default desktop behavior unless these settings are forced by URL.

Combine settings with `&`:

```text
https://example-name.trycloudflare.com/?v=phase5b-2
```

## Debug Log Capture

1. Open the app URL on mobile.
2. Wait until the necklace is visible.
3. Open `Tracking Debug`.
4. Tap `Reset Peaks`.
5. Run one scenario for about 10 seconds.
6. Tap `Download Debug JSON`.

Suggested log names:

```text
mobile-idle-forward-phase5b-calm.json
mobile-idle-forward-phase5b-off.json
mobile-slow-turn-phase5b-calm.json
```

Check these fields in the debug drawer:

```text
Physics Profile
Pose Jump
Pose Quality
Derived Filter
Derived Y
Chain Settle
Settle Strength
Quality Counter Y
Quality Triggers
Chain Max Dev
Runtime FPS
Actual Camera
```

## Static Check

After editing JavaScript:

```powershell
node --check recreate-necklace.js
```

Optional diff whitespace check:

```powershell
git diff --check -- recreate-necklace.js index.html mobile-improve-plan.md
```
