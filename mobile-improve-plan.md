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

Report: Phase 1 diagnostics implemented and mobile logs reviewed. Actual mobile camera/source is portrait 720x1280 at about 30fps, despite requesting 1280x720. Canvas layout adapts to the portrait source, so the canvas is not stuck at 1280x720, but the tracker is receiving less horizontal neck/shoulder context than intended. Detection score remains high even during bad behavior, so score alone cannot identify landmark geometry errors. Chain metrics show frequent "chain near soft limit" states, with chain max rest deviation often close to SOFT_MAX_DEV. The debug screen observation that BackUp and BackDown are offset preview-right is important because both landmarks are currently part of ACTIVE_IMGPOINTS and can bias solvePnP. Current exports do not include raw landmark coordinates, so Phase 1b is required before Phase 2 to measure landmark bias directly and test camera constraint behavior.

## Phase 1b. Camera And Landmark Diagnostics

Goal:
Measure whether mobile shake/tilt is caused by portrait camera input, biased back landmarks, or chain physics amplification before changing tracking or physics behavior.

What to implement:

- Keep this diagnostics-only.
- Clear the rolling debug sample buffer when `Reset Peaks` is tapped, so each exported JSON contains only the intended scenario.
- Add raw normalized landmark coordinates to each debug sample for all six labels: `torsoNeckCenterUp`, `torsoNeckCenterDown`, `torsoNeckLeftUp`, `torsoNeckRightUp`, `torsoNeckBackUp`, and `torsoNeckBackDown`.
- Add computed landmark metrics per sample: center-vs-side offset, `backUpOffsetPx`, `backDownOffsetPx`, `backMidOffsetPx`, `backOffsetNorm`, `backSlopePx`, and landmark screen positions for center, side, and back points.
- Add a diagnostics-only camera request profile selector with `current` and `standardIdeal`.
- Export the selected camera profile name and actual returned camera/source settings.

Implementation hints:

- Use existing `normalizeLandmarks()`, `NN_LANDMARK_LABELS`, `landmarkScreenPoint()`, and `computeLandmarkBiasMetrics()`.
- Do not change `ACTIVE_IMGPOINTS`, solvePnP, follower setup, chain geometry, chain physics, pendant placement, or safety guard behavior.
- Read the camera profile only before tracking starts. Do not switch camera constraints live after WebAR init.
- Keep all new camera-profile behavior clearly diagnostic so it can be removed or promoted later.

Acceptance check:

- A forward-facing mobile export can prove whether `BackUp` and `BackDown` are consistently biased preview-right relative to the midpoint of `LeftUp` and `RightUp`.
- A mobile export clearly shows whether `standardIdeal` changes actual camera output from portrait `720x1280` to any more useful stream.
- `Reset Peaks` also clears the debug sample buffer.
- `node --check recreate-necklace.js` passes.
- No visual tracking or necklace behavior changes are introduced.

Report: Phase 1b diagnostics implemented. Reset Peaks now clears the rolling debug sample buffer, exports include raw six-landmark coordinates and computed back-landmark bias metrics, and the debug drawer includes a diagnostics-only camera profile selector. Logs from `current` vs `standardIdeal` showed `standardIdeal` improved the actual mobile stream from portrait `720x1280` to `600x800`, reduced average `backOffsetNorm` from about `0.074` to `0.032`, and improved neck-center confidence from about `0.846` to `0.985`. Code now uses `standardIdeal` as the default camera profile. The old camera request remains available as fallback with `?cameraProfile=current`, or by setting `DEFAULT_CAMERA_PROFILE` back to `current` in `recreate-necklace.js`.

## Phase 2. Mobile Chain Physics Taming

Goal:
Reduce mobile shake caused by soft-chain and pendant physics amplifying small pose noise, while keeping desktop behavior as the baseline.

What to implement:

- Add a lightweight mobile/calm physics profile or multiplier layer only if needed; do not change base desktop physics constants directly.
- Keep the default desktop profile available as the comparison baseline.
- Add a debug/URL override such as `?physics=default`, `?physics=mobile`, or `?physics=calm` so behavior can be compared during QA.
- Calm the soft chain on mobile using existing knobs only: motion deadzone, damping, rest blend, front freedom, spike velocity damping, and tracking-loss/regain velocity resets.
- Calm the pendant only through existing knobs: yaw kick and damping.

Implementation hints:

- Work in `simulateChain()`, `resetSoftChainVelocity()`, `relaxSoftChainToRest()`, and `updatePendantPendulum()`.
- Prefer deriving mobile-specific values from existing `PARAMS`; avoid new params unless needed for the profile/override layer.
- Reset Verlet velocity on tracking loss, tracking regain, large frame stalls, or any existing guard/hold state if already available.
- Log which physics profile is active in the diagnostics overlay.
- Do not implement pose quality classification, safety guard behavior, MediaPipe validation, or placement calibration in this phase.

Acceptance check:

- On mobile, chain shimmer is reduced while normal movement remains responsive.
- The pendant remains attached and does not lag obviously behind the front chain point.
- Desktop behavior remains unchanged under the default physics profile.
- URL/debug overrides can compare default versus mobile/calm physics without code edits.

Report: Phase 2 implemented as a lightweight physics multiplier layer. Base desktop `PARAMS` constants remain unchanged. Desktop defaults to the `default` physics profile, while mobile/coarse-pointer runtimes auto-select `mobile` unless overridden. URL overrides are available with `?physics=default`, `?physics=mobile`, and `?physics=calm`. The profile layer only affects existing chain/pendant physics knobs: soft-chain motion deadzone, damping, rest blend, freedom scale, spike velocity damping, motion-guard velocity damping, pendant damping, and pendant yaw kick. Debug/export now records the active physics profile and effective physics values. `calm` was strengthened as a handheld-camera-shake test profile: higher deadzone/rest blend, lower soft-chain velocity carry/freedom, stronger spike/guard damping, higher pendant damping, and much lower yaw kick. `default` and `mobile` were left unchanged for A/B comparison. No pose-quality classification, safety guard, MediaPipe validation, placement calibration, solvePnP, follower setup, chain geometry, or pendant placement changes were made.

## Phase 2b. Mobile Pose Jump Damping

Goal:
Reduce mobile necklace jumps caused by sudden derived pose movement when the phone moves closer/farther from the face, without changing solvePnP, follower setup, base placement, or chain geometry.

What to implement:

- Keep this as a small bridge between Phase 2 physics calming and Phase 4 pose-quality gating.
- Detect obvious mobile pose jumps using existing measured signals only: `poseParentY`, `rawYDelta`, `neckWidthPx`, `centerOffsetNorm`, `backOffsetNorm`, yaw/pitch changes, tracking loss/regain, and large frame stalls.
- When a jump is detected, damp or blend only the derived visual application for a short recovery window.
- Reset or damp soft-chain and pendant velocity on jump/recovery so the chain does not whip upward after the pose settles.
- Keep desktop behavior unchanged unless explicitly tested through a debug/URL override.

Implementation hints:

- Do not classify frames as good/suspect/bad yet; that belongs to Phase 4.
- Do not add a full safety guard, MediaPipe validation, placement calibration, or new landmark source.
- Prefer using existing motion debug fields and the Phase 2 physics profile plumbing.
- Add diagnostics for whether pose-jump damping is active, which signal triggered it, and how long the recovery window remains.
- Treat this as a temporary measured stabilizer: Phase 4 may replace or generalize it later.

Relation to Phase 4:

- Phase 2b handles one proven issue from the Phase 2 calm logs: large short-term pose jumps caused by handheld camera distance/framing changes.
- Phase 4 is still the broader pose-quality gate. It should generalize Phase 2b into good/suspect/bad frame handling only after we confirm which Phase 2b signals actually predict bad necklace movement.
- Do not duplicate Phase 2b thresholds blindly in Phase 4. Use Phase 2b logs to decide which signals become permanent quality inputs.

Acceptance check:

- Moving the phone slightly closer/farther from the face no longer causes a strong necklace jump upward or chain whip.
- Normal slow yaw remains responsive.
- Chain physics remains calm and does not hide a bad pose by stretching toward `SOFT_MAX_DEV`.
- Debug JSON shows when damping triggered and whether it correlates with visible improvement.
- No solvePnP, follower setup, camera pipeline, placement calibration, chain geometry, or pendant asset changes are introduced.

Report: Phase 2b implemented as a mobile-only transient pose-jump damping layer. It does not change camera startup, solvePnP, follower setup, base placement, chain geometry, pendant assets, or desktop default behavior. The damping auto-enables on mobile/coarse-pointer runtimes and can be forced with `?poseJumpDamping=on` or disabled with `?poseJumpDamping=off`. It watches existing signals from the current frame: `poseParentY` delta, neck width delta, pitch/yaw step, `centerOffsetNorm`, `backOffsetNorm`, tracking stalls, and Phase 1b landmark metrics. When a short jump is detected, it applies a temporary local Y counter-offset to the necklace group, damps soft-chain Verlet velocity, damps pendant velocity, then fades out over a short recovery window. Debug/export now records `poseJumpMode`, `poseJumpReason`, `poseJumpRecovery`, `poseJumpOffsetY`, neck-width delta, landmark bias values, trigger count, and whether pose-jump damping is enabled. The `mobile-distance-change-phase2b-calm.json` log confirmed Phase 2b ran correctly and modestly reduced measured `chainTopY`/`chainFrontY` range compared with `poseJumpDamping=off`, but visible shake remained because `poseParentY` still drifted by about `68px` while Phase 2b only applied a small transient counter-offset. The remaining issue is sustained mobile pose/framing drift, not only short pose jumps, so Phase 4 is required.

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

Report: Phase 4b tuning pass implemented. The pose-quality gate now has a short warm-up window after init/reset/tracking regain, lower max counter Y, per-frame counter rate limiting, relaxed pose/neck/bias thresholds, and more conservative classification rules. `previous chain limit` is no longer a direct `bad` trigger; it only contributes when pose/framing drift is also present. Center/back bias are now supporting signals only and do not trigger `suspect` by themselves. Neck-width drift also requires pose Y drift or raw Y movement before stronger intervention. Existing `?poseQuality=on/off`, Phase 4 debug/export fields, Phase 2b jump damping, camera startup, solvePnP, follower setup, `sourceRaw`, chain geometry, pendant assets, material/link style, and desktop default behavior remain unchanged.

## Phase 4. Light Pose Quality Gate

Goal:
Stop obviously suspect mobile frames from driving the necklace and chain physics at full strength, using Phase 2b results as measured input rather than starting from new assumptions.

What to implement:

- Classify frames as good, suspect, or bad using existing available signals.
- For good frames, accept normal updates.
- For suspect frames, blend more slowly and use calmer chain physics.
- For bad frames, briefly hold the last safe pose, reset or damp chain velocity, and fade only if the bad state persists.
- Promote only the Phase 2b pose-jump signals that proved useful in logs; remove or relax signals that caused false positives.

Implementation hints:

- Use detection score, finite landmarks, neck width stability, neck-center offset, follower translation/rotation deltas, yaw/pitch/roll velocity, tracking loss, and tracking regain windows.
- Keep thresholds centralized and visible in diagnostics.
- Avoid reprojection-error work unless it is cheap to compute from already available data.
- Do not replace `sourceRaw`; gate the derived application of the pose.

Acceptance check:

- Fast mobile motion no longer produces full-strength necklace jumps.
- Short tracking glitches recover without a large chain whip.
- Normal tracking still feels responsive.

Report: Phase 4 implemented as a mobile-only light pose-quality gate. It auto-enables on mobile/coarse-pointer runtimes and can be forced with `?poseQuality=on` or disabled with `?poseQuality=off`. It classifies frames as `good`, `suspect`, or `bad` using existing measured signals only: pose Y drift, raw Y delta, neck-width drift, center/back landmark bias, pitch/yaw step, frame stalls, and prior chain soft-limit state. It does not change camera startup, solvePnP, follower setup, `sourceRaw`, chain geometry, pendant assets, or desktop default behavior. The gate maintains an accepted pose-Y baseline, applies a clamped local counter-offset to the necklace group, damps soft-chain and pendant velocity during suspect/bad frames, and feeds the existing soft-chain recovery path with stronger rest blend and lower freedom. Debug/export now records `poseQualityMode`, `poseQualityReason`, `poseQualityRecovery`, `poseQualityBlend`, `poseQualityCounterY`, `poseQualityAcceptedY`, `poseQualityLiveDeltaY`, `poseQualityNeckWidthRest`, `poseQualityNeckWidthDelta`, `poseQualityTriggerCount`, and whether pose quality is enabled. The first idle log after Phase 4 showed the approach is directionally valid but over-aggressive: chain screen-position ranges were numerically small and chain rest deviation stayed low, but `poseQualityCounterY` ranged roughly from `-4.1` to `+11.6` during idle and the gate entered `bad`/`suspect` because of prior chain-limit state, center bias, and neck-width drift. This made the visual result feel shakier. Phase 4 therefore needs a tuning pass before Phase 5.

## Phase 4b. Pose Quality Tuning Pass 1

Goal:
Make Phase 4 conservative enough that idle/mobile-forward does not feel worse, while still catching real phone-distance/framing drift.

What to implement:

- Keep this as tuning only; do not change camera startup, solvePnP, follower setup, `sourceRaw`, chain geometry, pendant assets, or desktop default behavior.
- Add a short warm-up after init/reset/tracking regain so quality classification cannot trigger on the first few frames.
- Remove `previous chain limit` as a direct `bad` trigger. Keep it only as a weak supporting diagnostic unless pose/framing drift is also clearly present.
- Make center/back landmark bias supporting signals only. They should not trigger `suspect` by themselves during idle.
- Lower and rate-limit the Phase 4 counter-offset so it cannot create large visible local Y jumps during idle.
- Relax neck-width sensitivity for idle; require neck-width drift to combine with pose Y drift or raw Y delta before strong intervention.
- Keep `?poseQuality=on/off` and all Phase 4 debug fields so logs can compare before/after tuning.

Implementation hints:

- Prefer smaller threshold and blend changes over adding new systems.
- Do not remove Phase 2b; keep it as a narrow transient jump damper and diagnostic bridge.
- The gate should mostly stay `good` during `mobile-idle-forward-phase4-calm`.
- During distance-change, the gate may enter `suspect`, but `bad` should be rare and reserved for frame stalls, tracking loss/regain, or large combined pose/framing jumps.

Acceptance check:

- Idle forward with `?physics=calm&poseQuality=on` does not look shakier than `poseQuality=off`.
- `poseQualityCounterY` stays small during idle, with no large first-frame counter jump.
- `Pose Quality` is mostly `good` during idle.
- Distance-change still shows some `suspect` activity and reduced `chainTopY`/`chainFrontY` range compared with Phase 2b.
- `node --check recreate-necklace.js` passes.

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
