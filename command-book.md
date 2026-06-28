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
https://example-name.trycloudflare.com/?physics=calm&poseQuality=on
```

Phase 4b idle test:

```text
https://example-name.trycloudflare.com/?physics=calm&poseQuality=on
```

Phase 4b distance-change comparison, quality on:

```text
https://example-name.trycloudflare.com/?physics=calm&poseQuality=on
```

Phase 4b distance-change comparison, quality off:

```text
https://example-name.trycloudflare.com/?physics=calm&poseQuality=off
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
https://example-name.trycloudflare.com/?cameraProfile=standardIdeal&physics=calm&poseJumpDamping=on&poseQuality=on
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

`default` is desktop baseline. `mobile` is the mobile auto profile. `calm` is the stronger handheld-camera-shake test profile.

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

Combine settings with `&`:

```text
https://example-name.trycloudflare.com/?physics=calm&poseQuality=on
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
mobile-idle-forward-phase4b-calm.json
mobile-distance-change-phase4b-calm.json
mobile-distance-change-phase4b-off.json
```

Check these fields in the debug drawer:

```text
Physics Profile
Pose Jump
Pose Quality
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
