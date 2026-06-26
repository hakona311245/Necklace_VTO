# Necklace Safety/Stability Implementation Plan

## 1. Problem Statement

The necklace starts in a good position, but after sustained tilting, nodding, or turning, the tracked pose can drift or spike. When that happens, the chain can jump upward and visually enter the lower face or mouth area.

This is not only a static placement problem. The initial rest path can be correct while the runtime combination of follower pose, soft-chain physics, yaw compensation, occlusion, and fade creates a bad frame later. The fix should preserve the current accepted placement and add safety behavior around motion, drift, and recovery.

WebAR.Rocks tracking cannot be assumed perfect in this use case. Neck landmarks are harder than face landmarks under yaw, collars, hair, shoulder occlusion, low light, and motion blur. The application needs a visual safety layer that prevents impossible necklace positions even when the upstream tracker briefly produces inaccurate pose data.

## 2. Current Pipeline Risk Points

- `buildStaticChain()` / chain curve / rest loop points: the rest path defines where the chain wants to sit. If side arcs are too round or too inward, later pose error can push them into the neck or face area.
- Follower pose jitter: `threeFaceFollowers[0]` is the source of truth in `sourceRaw` mode. Sudden pose Y, pitch, or yaw changes can move the entire local necklace frame.
- Soft-chain simulation drift: Verlet state in `simulateChain()` can preserve deformation or velocity after spikes unless it is damped, clamped, or relaxed back to rest.
- Side/back chain visibility: yaw fade, link back fade, and occluder behavior reduce rear artifacts, but they do not currently define an explicit upper-face safety boundary.
- Lack of safety boundary near face/mouth: the system does not currently project chain points into screen space and reject, fade, or recover when visible chain geometry enters an unsafe region.

## 3. Phased Implementation Plan

### Phase 1: Baseline Audit And Debug Metrics

Purpose:
Establish whether bad frames come from follower pose, soft-chain deformation, chain rest shape, or visibility/fade behavior.

Files/functions likely affected:

- [recreate-necklace.js](D:/Coding/Necklace_VTO/recreate-necklace.js)
- `updateNecklaceMotionStabilizer()`
- `simulateChain()`
- `rebuildChainGeometryFromNodes()`
- `updateDebugStats()`
- debug drawer markup in [index.html](D:/Coding/Necklace_VTO/index.html), only if more visible fields are needed

Implementation notes:

- Add debug-only metrics before changing behavior.
- Log or show follower world Y, pitch, yaw, yaw step, raw Y delta, applied group Y, soft-chain max deviation, highest visible chain point, and pendant/front point screen position.
- Add a simple "last unsafe reason" field once Phase 4 begins.
- Compare static rest points against simulated points to detect whether the chain itself drifted upward.
- Preserve the existing `sourceRaw` mode while measuring.

Acceptance criteria:

- During a bad frame, debug data can identify whether the cause is follower pose jump, soft-chain state, or rest-curve geometry.
- Metrics remain cheap enough for live demo use.
- No visual behavior changes yet.

Risks:

- Too much debug work can distract from the demo fix.
- Excess console logging can reduce performance on mobile.

What NOT to change:

- Do not alter WebAR init, solvePnP points, follower setup, static placement, pendant placement, product loading, or GLB transform.

### Phase 2: Curve Safety Tuning

Purpose:
Reduce the chance that a correct necklace pose becomes unsafe under moderate tracking error by making the chain shape more stable and less prone to side arcs curling toward the face.

Files/functions likely affected:

- [recreate-necklace.js](D:/Coding/Necklace_VTO/recreate-necklace.js)
- `PARAMS`
- `buildNeckModel()`
- `buildStaticChain()`
- `placePendantAtChainFront()`, for verification only

Implementation notes:

- Keep the pendant/front point stable. The lowest/front chain node is the attachment reference and should not move casually.
- Prefer rest-path tuning over occlusion or shader fade for actual shape problems.
- Make the front path read as a softer V instead of a round U.
- Reduce side inward curl by tuning width/depth/rear arc parameters conservatively.
- Use screenshots or live debug checks before and after each small change.

Acceptance criteria:

- Initial placement remains visually accepted.
- Pendant still attaches cleanly to the front chain point.
- Side arcs are less likely to appear inside the neck or lower face during mild yaw.
- The chain still looks like a necklace, not a rigid collar.

Risks:

- Over-tuning the rest curve can break the currently good initial placement.
- Moving the front node can detach the pendant visually.
- Fixing shape with occlusion/fade may hide symptoms while keeping bad geometry.

What NOT to change:

- Do not change solvePnP landmarks or object points.
- Do not move `pendantPivot` as a curve-shape fix.
- Do not retune GLB transform.

### Phase 3: Dynamic Drift/Rebalance

Purpose:
Ensure runtime state returns to a safe baseline after motion, stalls, tracking loss, or pose spikes.

Files/functions likely affected:

- [recreate-necklace.js](D:/Coding/Necklace_VTO/recreate-necklace.js)
- `updateNecklaceMotionStabilizer()`
- `applyTrackingPoseMode()`
- `resetSoftChainVelocity()`
- `relaxSoftChainToRest()`
- `simulateChain()`
- `resetPendantPendulum()`

Implementation notes:

- Confirm compensation relaxes back to zero in `sourceRaw` mode except for intentional yaw/Y safety compensation.
- Keep soft-chain `cur` and `prev` blending toward rest to avoid injecting velocity.
- On tracking lost/regain, reset velocity and relax more aggressively for a short period.
- Clamp accumulated upward drift from yaw/Y stabilization and soft-chain deformation.
- Add a short cooldown after large pose spikes where soft-chain freedom is reduced or rest blend is temporarily stronger.

Acceptance criteria:

- After a nod/turn spike, the chain settles back to rest instead of staying high.
- Tracking loss/regain does not preserve old upward deformation.
- Normal small motion remains natural.
- Existing good initial placement is unchanged.

Risks:

- Too much damping makes the chain feel glued to the neck.
- Aggressive reset can cause visible snapping.
- Yaw/Y compensation can become a hidden second placement system if it is allowed to accumulate.

What NOT to change:

- Do not replace `sourceRaw` as the default tracking pose mode.
- Do not introduce a second follower or pendant path.
- Do not change base static placement as part of drift handling.

### Phase 4: Face/Upper-Neck Safety Guard

Purpose:
Add an explicit visual safety boundary so visible chain geometry cannot remain in the user's face or mouth region when tracking becomes inaccurate.

Files/functions likely affected:

- [recreate-necklace.js](D:/Coding/Necklace_VTO/recreate-necklace.js)
- `updateNecklaceMotionStabilizer()`
- `rebuildChainGeometryFromNodes()`
- `updateChainLinkInstances()`
- `updateDebugStats()`
- possibly new helpers such as `projectChainSafetyPoints()` and `evaluateNecklaceSafety()`

Implementation notes:

- Project representative chain points to screen space using the Three.js camera after follower/world transforms are current.
- Start with a practical screen-space heuristic for the demo:
  - sample front and side visible chain points;
  - detect if any visible point rises above a conservative upper-neck boundary;
  - use the tracked neck landmarks when available to estimate a safe upper limit;
  - fall back to a fixed screen band if landmark quality is weak.
- Keep the guard conservative. It should catch obvious mouth/lower-face intrusion, not micromanage every necklace pixel.
- Track safety state with hysteresis:
  - `safe`
  - `unsafeCandidate`
  - `unsafe`
  - `recovering`
- Add debug output for highest projected chain point, boundary Y, unsafe duration, and reason.

Acceptance criteria:

- When the chain enters the lower face/mouth area, the system detects it within a few frames.
- Normal correct necklace placement is not falsely marked unsafe.
- Detection is stable during small head movement.
- Debug data explains why unsafe state triggered.

Risks:

- Screen-space heuristics can vary by camera aspect, face size, and distance.
- Landmark-based boundaries may be unreliable during the same frames where tracking is bad.
- Overly strict guard can hide the necklace too often.

What NOT to change:

- Do not alter WebAR tracking inputs.
- Do not add MediaPipe/FaceMesh in this phase.
- Do not move pendant placement to satisfy the safety check.

### Phase 5: Unsafe Behavior And Recovery

Purpose:
Define what the app does after the guard detects unsafe necklace placement.

Files/functions likely affected:

- [recreate-necklace.js](D:/Coding/Necklace_VTO/recreate-necklace.js)
- chain/link material opacity handling
- `simulateChain()`
- `relaxSoftChainToRest()`
- `resetSoftChainVelocity()`
- `setPendantRendererVisibility()`
- UI status/debug helpers

Implementation notes:

- For the demo, prefer graceful visual suppression over aggressive repositioning.
- Candidate response:
  1. If unsafe for a short threshold, fade necklace and pendant down.
  2. Hold or restore last safe soft-chain state if available.
  3. Relax/reset soft-chain state toward rest.
  4. Show a small user guidance prompt such as "Face camera" or "Hold still".
  5. Recover only after safety has been good for a hysteresis window.
- Keep fade and recovery state shared across tube chain, linked chain, PNG pendant, and GLB pendant.
- Avoid sudden popping by using opacity transitions.

Acceptance criteria:

- The chain does not visibly stay in the mouth/lower-face area.
- Recovery happens automatically when tracking stabilizes.
- A brief single-frame spike does not cause distracting flicker.
- PNG and GLB modes follow the same safety behavior.

Risks:

- Holding last safe state can look detached if the head continues moving.
- Fading too quickly can make the product disappear during normal motion.
- User guidance text can clutter the demo if triggered too often.

What NOT to change:

- Do not solve unsafe state by changing WebAR settings.
- Do not permanently offset the whole necklace upward/downward as a recovery mechanism.
- Do not create separate safety behavior for PNG and GLB unless absolutely needed.

### Phase 6: Optional Future Face Tracking

Purpose:
Evaluate whether an additional face/mouth boundary detector is needed if the neck-landmark/screen-space guard is not reliable enough.

Files/functions likely affected:

- New optional integration files if selected later
- [index.html](D:/Coding/Necklace_VTO/index.html) script loading
- [recreate-necklace.js](D:/Coding/Necklace_VTO/recreate-necklace.js) safety-boundary logic

Implementation notes:

- Consider MediaPipe FaceMesh or another face-landmark source only after Phases 1-5 prove insufficient.
- Use it only to define a face/mouth safety boundary, not to drive necklace pose.
- Evaluate mobile performance, load time, licensing, camera pipeline conflicts, and synchronization with WebAR.Rocks.

Acceptance criteria:

- Additional face tracking materially reduces false negatives without harming FPS.
- It does not replace the WebAR.Rocks neck follower for this demo.

Risks:

- Higher CPU/GPU cost on mobile.
- More moving parts close to demo deadline.
- Multiple camera/ML pipelines can introduce sync and permission issues.

What NOT to change:

- Do not make this part of the first demo fix.
- Do not replace WebAR.Rocks tracking unless there is a separate migration plan.

## 4. Recommended Order

1. Phase 1 first: add enough debug metrics to identify the failure mode.
2. Phase 3 second: improve drift/rebalance because it directly addresses "starts correct, gets worse over time".
3. Phase 4 third: add the explicit safety guard once measurements are available.
4. Phase 5 fourth: add fade/hold/reset recovery behavior behind the guard.
5. Phase 2 can run in parallel only for small visual tuning, but avoid broad curve changes before the drift source is known.
6. Phase 6 is optional future work and should not be included in the initial demo scope.

For the current 4-day demo scope, the safest practical target is:

- Phase 1 debug metrics.
- Phase 3 drift/rebalance tightening.
- Phase 4 simple screen-space safety guard.
- Phase 5 conservative fade-and-recover behavior.

Keep Phase 2 limited to minor curve tuning only if the audit proves the rest shape contributes to the issue. Skip Phase 6.

## 5. Do Not Touch Yet

- WebAR init.
- `NN_NECKLACE_9.json` selection.
- solvePnP image points.
- solvePnP object points.
- `threeFaceFollowers[0]` follower setup.
- base static placement that currently looks correct.
- `pendantPivot` placement and pendant attachment logic.
- product loading and catalog normalization.
- PNG fallback behavior.
- GLB base transform and GLB calibration values.

