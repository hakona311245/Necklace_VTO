# Mobile WebAR Necklace Improvement Plan

This document is an implementation-phase plan only. It follows `mobile-improve.md`, `NECKLACE_SAFETY_STABILITY_PLAN.md`, `CODEX_PROJECT_CONTEXT.md`, and the current `recreate-necklace.js` architecture as the source of truth.

The current desktop placement is acceptable. Mobile issues should be treated as a layered stability problem: actual camera input variance, derived pose jitter, chain/pendant physics amplification, and incomplete visual safety state. Do not make risky changes to the core WebAR pipeline to hide those symptoms.

Keep these constraints unless a later phase proves otherwise:

- Do not change WebAR.Rocks initialization strategy, `NN_NECKLACE_9.json`, solvePnP image/object points, or `threeFaceFollowers[0]`.
- Keep `TRACKING_POSE_MODE: 'sourceRaw'` as the base pose path.
- Do not change pendant asset loading, product catalog behavior, GLB pendant transforms, or material/link style.
- Do not use safety guards as a replacement for normal placement calibration.
- Prefer lightweight measured fixes before MediaPipe, shoulder tracking, or major safety-state rewrites.

## Phase 1. Mobile Diagnostics Overlay

Goal:
Make the mobile problem measurable before changing behavior.

What to implement:

- Extend the existing debug drawer rather than replacing it.
- Show actual mobile camera/runtime data: media track settings when accessible, video/source width and height, canvas CSS size, backing buffer size, DPR, and effective frame timing.
- Add a rolling debug buffer for recent tracking, pose, chain, pendant, motion guard, and neck-center confidence data.
- Add a copy/download debug JSON action for mobile test sessions.

Implementation hints:

- Use existing `STATE.layout`, `STATE.motionDebug`, `STATE.motionPeaks`, `computeChainAuditMetrics()`, `updateDebugStats()`, and debug drawer markup in `index.html`.
- If camera track settings are not directly exposed by the helper, add the smallest helper accessor needed rather than rewriting camera startup.
- Use `requestVideoFrameCallback` where available for video-frame timing; fall back to render-frame timing.
- Throttle DOM updates and keep console logging off by default so diagnostics do not create extra mobile jitter.

Acceptance check:

- A mobile run can report actual camera resolution/FPS, canvas mapping, pose deltas, chain top/front screen position, chain rest deviation, and active guard states.
- A debug JSON snapshot can be captured from the phone.
- No visual behavior changes are introduced in this phase.

Report: _Not started yet._

## Phase 2. Mobile Chain Physics Taming

Goal:
Reduce mobile shake caused by soft-chain and pendant physics amplifying small pose noise.

What to implement:

- Add a lightweight mobile tuning path that reuses existing physics parameters and code paths.
- Calm the soft chain on mobile by tuning existing concepts: motion deadzone, damping, rest blend, front pin freedom, spike velocity damping, and tracking-loss velocity resets.
- Calm the pendant on mobile by reducing yaw kick and increasing damping only if diagnostics show pendant swing is contributing to visible shake.

Implementation hints:

- Work in `simulateChain()`, `resetSoftChainVelocity()`, `relaxSoftChainToRest()`, and `updatePendantPendulum()`.
- Prefer deriving mobile-specific values from existing `PARAMS`; avoid adding new params unless the value needs to be visible/tunable.
- Reset Verlet velocity on tracking loss, tracking regain, large stalls, and bad pose holds.
- Log which physics profile is active in the diagnostics overlay.

Acceptance check:

- On mobile, chain shimmer is reduced while normal movement remains responsive.
- The pendant remains attached and does not lag obviously behind the front chain point.
- Desktop behavior remains visually unchanged or only minimally affected.

Report: _Not started yet._

## Phase 3. Mobile Placement Calibration

Goal:
Fix mobile-specific vertical placement only after camera/layout measurements confirm the offset.

What to implement:

- Compare mobile and desktop debug captures for source size, canvas contain mapping, follower Y, chain top/front Y, and neck width.
- If mobile placement is consistently too low, add a small mobile-only local placement calibration layer.
- Keep the front-bottom point, pendant attachment, and accepted desktop chain shape stable.

Implementation hints:

- First verify `layoutCanvases(aspect)` and WebAR/Three canvas backing sizes match the camera source mapping.
- If calibration is needed, prefer a small local necklace wrapper/group Y offset or scale-aware local offset over changing solvePnP or landmarks.
- Keep placement calibration separate from face/mouth safety logic.
- Do not lower or raise the whole necklace to mask unsafe tracking frames.

Acceptance check:

- Mobile necklace height matches desktop intent more closely under forward-facing posture.
- Pendant remains centered under the front chain point.
- No solvePnP, follower, or asset transform changes are required.

Report: _Not started yet._

## Phase 4. Light Pose Quality Gate

Goal:
Stop obviously suspect mobile frames from driving the necklace and chain physics at full strength.

What to implement:

- Classify frames as good, suspect, or bad using existing available signals.
- For good frames, accept normal updates.
- For suspect frames, blend more slowly and use calmer chain physics.
- For bad frames, briefly hold the last safe pose, reset or damp chain velocity, and fade only if the bad state persists.

Implementation hints:

- Use detection score, finite landmarks, neck width stability, neck-center offset, follower translation/rotation deltas, yaw/pitch/roll velocity, tracking loss, and tracking regain windows.
- Keep thresholds centralized and visible in diagnostics.
- Avoid reprojection-error work unless it is cheap to compute from already available data.
- Do not replace `sourceRaw`; gate the derived application of the pose.

Acceptance check:

- Fast mobile motion no longer produces full-strength necklace jumps.
- Short tracking glitches recover without a large chain whip.
- Normal tracking still feels responsive.

Report: _Not started yet._

## Phase 5. Derived Pose Filtering

Goal:
Smooth the visual channels that still react too strongly after landmark stabilization.

What to implement:

- Add filtering for derived visual values rather than replacing the raw follower pose.
- Filter neck center compensation, yaw/Y compensation, yaw used by chain fade/kick, and pitch/roll used by pendant physics.
- Increase smoothing when pose quality is suspect and reset filters cleanly on tracking loss/regain.

Implementation hints:

- Reuse the existing One Euro approach where practical, with separate tuning for position-like, rotation-like, and scale-like values.
- Keep filter state small and explicit.
- Apply filtering after diagnostics and pose-quality classification so it can adapt to frame quality.

Acceptance check:

- Mobile jitter is reduced in chain and pendant motion without visible rubber-band lag.
- Tracking loss/regain does not resume with stale filtered values.
- Desktop remains close to the current accepted behavior.

Report: _Not started yet._

## Phase 6. Face/Mouth Safety Guard

Goal:
Prevent impossible necklace positions near the lower face when tracking briefly fails or drifts.

What to implement:

- Build a conservative screen-space safety state using existing chain audit metrics.
- Add a small state machine: safe, unsafe candidate, unsafe, recovering.
- When unsafe is sustained, hold or restore the last safe chain state, fade the chain/pendant slightly if needed, reset velocity, and recover with hysteresis.

Implementation hints:

- Start from `computeChainAuditMetrics()` and existing debug fields for chain top/front screen position.
- Derive the upper boundary from stable chain baseline and trustworthy neck landmarks first; only add face validation later if required.
- Keep this as a safety layer, not a normal placement or styling tool.
- Avoid sudden full disappearance unless the unsafe state persists.

Acceptance check:

- Chain geometry does not visibly enter the mouth/lower-face area during bad mobile frames.
- Recovery is smooth once tracking becomes valid again.
- Accepted forward-facing placement is not shifted by the guard.

Report: _Not started yet._

## Phase 7. Mobile QA And Tuning

Goal:
Tune with repeatable mobile scenarios instead of visual guessing.

What to implement:

- Define a short manual QA script for mobile sessions.
- Capture debug JSON and screen recordings for each tuning pass.
- Track key metrics before and after each phase.

Implementation hints:

- Test idle forward-facing for 10 seconds, slow yaw, fast yaw, nodding, shoulder raise, tracking loss/regain, and product switching.
- Test at least iPhone Safari and Android Chrome when available.
- Record FPS, chain top/front jitter, suspect/bad frame counts, recovery time, placement offset, and safety trigger count.
- Store tuning notes in this file's phase reports or a small `mobile-qa-notes.md`.

Acceptance check:

- Each mobile improvement can be compared against a previous debug capture.
- The final tuning pass shows less visible shaking, correct height, and no new desktop regression.
- `node --check recreate-necklace.js` passes after any code phase.

Report: _Not started yet._

## Phase 8. Optional Face/Shoulder Validation

Goal:
Evaluate heavier validation only if lightweight WebAR-side fixes are not enough.

What to implement:

- Consider MediaPipe Pose shoulders as a low-rate validator for body center and scale.
- Consider Face Landmarker only for a lower-face/chin boundary if the screen-space safety guard needs a stronger face reference.
- Keep any optional validator behind a feature flag and graceful fallback.

Implementation hints:

- Do not use MediaPipe as a second primary tracker for the necklace.
- Run optional validation at a reduced cadence or off the main frame path where practical.
- Use it to corroborate or reject suspect states, not to replace WebAR.Rocks solvePnP.
- Add this only after phases 1-7 prove the remaining issue needs it.

Acceptance check:

- Optional validation improves safety or placement confidence on mobile without causing frame drops.
- The app still works when the validator is unavailable or disabled.
- Core WebAR necklace behavior remains unchanged.

Report: _Not started yet._
