# WebAR Necklace Project Status

This document is a compact maintenance log for the mobile optimization work. It summarizes what was learned, what changed, how the current mobile stack behaves, and how to continue safely.

## 1. Current Goal

Make the WebAR necklace stable on mobile without hiding real tracking errors or breaking the accepted desktop behavior.

The current accepted mobile target is:

- Use the `standardIdeal` camera request profile.
- Use `calm` physics by default on mobile/coarse-pointer devices.
- Keep raw WebAR tracking, solvePnP, follower setup, necklace placement, chain geometry, pendant assets, material/link style, and occlusion/fade behavior intact.
- Stabilize only measured derived outputs and chain physics amplification.

## 2. Current State

Safe-distance mobile behavior is acceptable. When the user holds the phone at a reasonable distance and moves slowly, the necklace is mostly stable and responsive.

Remaining visible jitter usually appears when:

- the phone is too close to the face/neck;
- the hand-held camera is moving constantly;
- framing changes quickly and the neck occupies too much of the portrait stream;
- tracking produces sustained pose/framing drift rather than one isolated bad frame.

Phase 5b is accepted for safe-distance mobile behavior. Do not increase chain settling further unless new logs prove that soft-chain rest deviation is high while pose input is stable.

## 3. Important Files

| File | Purpose | Notes |
| --- | --- | --- |
| `recreate-necklace.js` | Main WebAR necklace app, tracking integration, chain/pendant physics, debug export. | Most mobile optimization code lives here. |
| `index.html` | Page shell, script loading, debug drawer UI. | Script cache-bust currently uses `recreate-necklace.js?v=phase5b-2`. |
| `helpers/WebARRocksFaceThreeHelper.js` | WebAR.Rocks/Three helper. | Exposes source video element for diagnostics only. Avoid core helper rewrites. |
| `helpers/landmarksStabilizers/OneEuroLMStabilizer.js` | Landmark smoothing used by WebAR.Rocks. | Keep as baseline; later filtering is applied to derived visual outputs. |
| `mobile-improve.md` | Original mobile research and high-level recommendations. | Use for reasoning and constraints, not as current implementation state. |
| `mobile-improve-plan.md` | Phase-by-phase implementation history and reports. | Source of truth for what was actually implemented. |
| `command-book.md` | Local server, Cloudflare tunnel, and test URL guide. | Use this for manual QA setup. |
| `mobile-log/` | Captured debug JSON logs. | Compare phase logs before tuning thresholds. |
| `NECKLACE_SAFETY_STABILITY_PLAN.md` | Safety/stability planning. | Relevant for Phase 6 safety guard. |
| `CODEX_PROJECT_CONTEXT.md` / `handoff.md` | Broader project context. | Useful before large refactors. |

## 4. What Has Been Implemented

| Area | What changed | Why | Status |
| --- | --- | --- | --- |
| Mobile diagnostics | Added rolling debug samples, camera/layout/FPS fields, copy/download debug JSON. | Make mobile problems measurable before tuning. | Implemented |
| Camera diagnostics | Added `standardIdeal` and `current` camera profiles. | Test whether request shape affects real mobile stream. | Implemented |
| Camera default | `standardIdeal` became default; `?cameraProfile=current` remains fallback. | Logs showed better mobile source and lower landmark bias. | Accepted |
| Raw landmark export | Export six neck landmark coordinates and bias metrics. | Prove center/back landmark bias instead of guessing. | Implemented |
| Physics profiles | Added `?physics=default`, `?physics=mobile`, `?physics=calm`. | Compare desktop baseline, older mobile, and stronger handheld calming. | Implemented |
| Mobile physics default | Mobile/coarse-pointer now defaults to `calm`; desktop stays `default`. | Current accepted mobile behavior uses calm stack. | Accepted |
| Pose jump damping | Added mobile transient Y counter-offset and velocity damping for sudden pose jumps. | Reduce chain whip from quick phone-distance changes. | Implemented |
| Pose quality gate | Added mobile good/suspect/bad classifier and accepted pose-Y baseline. | Slow or hold visual application during suspect pose frames. | Implemented |
| Pose quality tuning | Added warm-up, reduced counter Y, rate limit, relaxed false-positive triggers. | First gate was too aggressive in idle. | Accepted |
| Derived visual filter | Filters derived local X/Y and pendant yaw/pitch/roll inputs. | Reduce frame-to-frame visual jitter without touching raw tracking. | Implemented |
| Chain idle settling | Added `?chainSettle=on/off`, soft-chain rest/freedom/velocity settling in calm mobile idle. | Reduce residual soft-chain jitter while preserving tracking. | Accepted for safe distance |
| Debug drawer/export | Added fields for camera, pose jump, pose quality, derived filter, chain settle, and chain audit. | Keep every tuning pass measurable and reversible. | Implemented |

## 5. Current Tracking/Rendering Behavior

- Tracking source: WebAR.Rocks with `NN_NECKLACE_9.json` and six active neck landmarks. The app keeps the existing solvePnP/follower flow.
- Camera: `standardIdeal` camera profile is default. Use `?cameraProfile=current` to compare the older request style.
- Follower: `TRACKING_POSE_MODE` stays `sourceRaw`. Mobile fixes do not replace the raw follower.
- Derived visual application: local visual offsets are layered after tracking. Mobile can apply pose jump damping, pose quality counter-offset, and derived filtering.
- Chain physics: soft-chain Verlet simulation remains the main chain behavior. Mobile calm profile adjusts effective damping/deadzone/rest/freedom through multiplier logic.
- Pendant: pendant physics uses existing swing/damping/yaw-kick controls. Phase 5 filters derived rotation inputs before pendant physics.
- Occlusion/fade: not part of the mobile optimization work. Do not use fade/occlusion to hide normal placement or tracking bugs.
- Debug tools: open Tracking Debug, Reset Peaks before each scenario, then Copy/Download Debug JSON.

## 6. Known Issues

| Issue | Where seen | Likely cause | Current plan |
| --- | --- | --- | --- |
| Jitter when phone is too close | Mobile distance-change tests and visual observation. | Sustained pose/framing drift from handheld close camera, not just soft-chain instability. | Do not increase chain settling; consider Phase 6 safety or a safe-distance UX guidance phase. |
| Back landmarks can bias preview-right | Early debug screen observations and Phase 1b logs. | Six-landmark pose source is fragile; back landmarks can drift with neck/shoulder appearance. | Keep diagnostics; only change solvePnP points if future logs prove sustained input bias. |
| Detection score stays high during bad geometry | Phase 1 logs. | Score does not represent landmark geometry quality. | Use geometry/pose metrics, not score alone. |
| Chain can amplify tiny pose changes | Phase 2/5 logs. | Soft-chain inertia and pendant swing make small pose noise visible. | Current calm + derived filter + chain settle handles safe-distance cases. |
| No completed lower-face safety guard | Safety plan and Phase 6 remain pending. | Current guards are motion/chain recovery, not full face intrusion state. | Phase 6 should add conservative safety state. |
| Mobile placement calibration not separately done | Phase 3 skipped for now. | Logs pointed more to stability/framing than fixed placement offset. | Only revisit if stable mobile logs show consistent vertical offset. |

## 7. Mobile Improvement Plan Summary

The mobile work followed a measured layered approach:

1. Add diagnostics first, so camera, layout, pose, chain, and pendant state can be exported from the phone.
2. Compare camera request profiles and make `standardIdeal` the default because it improved mobile source behavior.
3. Add physics profiles without changing desktop constants.
4. Add transient pose jump damping for short phone-distance jumps.
5. Add a conservative mobile pose quality gate after tuning out idle false positives.
6. Add derived visual filtering for local visual outputs and pendant inputs only.
7. Add soft-chain idle settling for mobile/calm idle cases.

The main rule from the plan still stands: do not change WebAR init, solvePnP, follower setup, sourceRaw, chain rest geometry, pendant assets, or desktop behavior unless logs prove that layer is the root cause.

## 8. What Has Not Been Done From The Plan

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 3: Mobile placement calibration | Not done | Skip until stable logs show a consistent vertical placement offset. |
| Phase 6: Face/mouth safety guard | Not started | Recommended next if chain can enter lower face during bad frames. |
| Phase 7: Mobile QA and tuning matrix | Not formalized | Current logs are useful, but a repeatable device matrix is still missing. |
| Phase 8: Optional MediaPipe validation | Not started | Only consider if lightweight WebAR-side fixes cannot handle remaining cases. |

## 9. How To Test

Start the local server:

```powershell
python -m http.server 8765
```

Start a Cloudflare tunnel in another terminal:

```powershell
cloudflared tunnel --url http://127.0.0.1:8765
```

Use the generated `https://...trycloudflare.com` URL on mobile.

Current recommended mobile URL:

```text
https://your-tunnel.trycloudflare.com/?v=phase5b-2
```

Important mobile debug params:

| Param | Use |
| --- | --- |
| `?cameraProfile=standardIdeal` | Current default camera request; explicit form for comparison. |
| `?cameraProfile=current` | Old camera request fallback. |
| `?physics=calm` | Current mobile auto physics profile; explicit form for logs. |
| `?physics=mobile` | Older mobile physics fallback. |
| `?physics=default` | Desktop baseline physics, useful for A/B. |
| `?poseJumpDamping=off` | Disable Phase 2b transient pose jump damping. |
| `?poseQuality=off` | Disable Phase 4/4b pose quality gate. |
| `?derivedFilter=off` | Disable Phase 5 derived visual filtering. |
| `?chainSettle=off` | Disable Phase 5b soft-chain idle settling. |
| `?v=phase5b-2` | Cache-bust the JS script/current accepted mobile stack. |

Recommended log routine:

1. Open the app on mobile and wait until the necklace is visible.
2. Open Tracking Debug.
3. Tap Reset Peaks.
4. Hold one scenario for 10 seconds.
5. Immediately Download Debug JSON.
6. Put the file in `mobile-log/` with a descriptive name.

Useful scenarios:

- `mobile-idle-forward`
- `mobile-slow-turn`
- `mobile-distance-change`
- `mobile-fast-yaw`
- `mobile-tracking-loss`

When comparing logs, inspect these fields first:

- `runtime.effectivePhysics.profile`
- `runtime.effectivePhysics.poseQualityEnabled`
- `runtime.effectivePhysics.derivedFilterEnabled`
- `runtime.effectivePhysics.chainSettleEnabled`
- `latest.motionDebug.poseQualityMode`
- `latest.motionDebug.poseQualityCounterY`
- `latest.motionDebug.derivedFilterY`
- `latest.motionDebug.chainSettleMode`
- `latest.motionDebug.chainMaxRestDev`
- `latest.motionDebug.chainTopScreenY`
- `latest.motionDebug.chainFrontScreenY`
- per-sample `poseParentY`, `rawYDelta`, `yawStep`, `neckWidthPx`, `backOffsetNorm`

## 10. How To Diagnose Future Problems

| Symptom | Check first | Likely fix direction |
| --- | --- | --- |
| Chain jitters while user is truly still | `chainMaxRestDev`, `chainSettleMode`, `rawYDelta`, `yawStep` | If pose is stable but rest dev is high, tune Phase 5b. If pose is moving, do not tune chain first. |
| Necklace jumps upward when phone moves | `poseParentY`, `rawYDelta`, `poseJumpMode`, `poseQualityMode` | Tune pose jump/pose quality thresholds, not chain geometry. |
| Necklace feels frozen or laggy | `poseQualityMode`, `derivedFilterBlend`, `chainSettleStrength` | Relax pose quality/derived filter/settle strength. |
| Pendant swings too much | pendant yaw/pitch/roll debug fields, physics profile | Tune pendant damping/yaw kick through physics profile. |
| Chain appears in lower face/mouth | `chainTopScreenY`, `chainFrontScreenY`, unsafe reason | Implement Phase 6 safety guard. Do not globally lower necklace. |
| Mobile and desktop placement differ consistently | source size, canvas layout, chain top/front baseline | Revisit Phase 3 mobile placement calibration. |
| Back/center landmarks look biased | raw landmark coords, `backOffsetNorm`, `centerOffsetNorm` | Keep diagnostics; only change pose inputs after repeated proof. |

## 11. Next Recommended Steps

1. Implement Phase 6 Face/Mouth Safety Guard if the chain can enter the lower face during bad mobile frames.
2. Add a lightweight safe-distance UX/guidance layer if close-phone framing remains the main user-facing problem.
3. Formalize Phase 7 QA with repeatable device/browser scenarios and before/after metric tables.
4. Only revisit Phase 3 placement calibration if stable forward-facing logs show a consistent fixed offset.
5. Treat MediaPipe/shoulder validation as optional Phase 8 work, not the next default fix.

## 12. Notes For Future Codex Runs

- Read this file, `mobile-improve-plan.md`, and `command-book.md` before changing mobile behavior.
- Do not start by changing solvePnP points, follower setup, `sourceRaw`, chain geometry, or pendant transforms.
- Keep every new mobile behavior behind a URL fallback or mobile-only default.
- Preserve desktop as the baseline unless the user explicitly asks to change desktop.
- Always update `mobile-improve-plan.md` when implementing a phase or changing the accepted mobile default.
- Bump the `recreate-necklace.js?v=...` cache-bust in `index.html` after JS changes that need mobile testing.
- Use logs from `mobile-log/` before tuning thresholds. Visual reports are useful, but thresholds should be changed from evidence.
- If a change makes idle worse, first check for over-correction: large local counter Y, high settle strength, or filter state jumps.
- If safe-distance idle and slow-turn are stable, do not make chain physics stronger to solve close-phone framing drift.
