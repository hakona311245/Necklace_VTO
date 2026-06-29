# Mobile Pose Input A/B Plan

This plan is for controlled debugging of mobile sideways drift caused by contradictory neck landmark geometry. It is not a chain physics plan.

## 1. Current Diagnosis

The current suspect log is `mobile-log/29junlog.json`, captured on iPhone Safari from `https://necklace-vto.vercel.app/`. It used the current mobile stack:

- `cameraProfile: standardIdeal`
- `physicsProfile: calm`
- pose jump damping enabled
- pose quality enabled
- derived filter enabled
- chain settle enabled

The camera/layout data looks consistent:

- camera/source: `600x800`, aspect `0.75`
- layout CSS: `414x552`, aspect `0.75`
- DPR: `2`

The drift does not look like a canvas aspect mismatch. The stronger signal is contradictory landmark geometry:

| Metric | 29jun log summary | Meaning |
| --- | --- | --- |
| `centerOffsetPx` | mean about `+24px`, max about `+32px` | `CenterUp/CenterDown` are offset to one side of the `LeftUp/RightUp` midpoint. |
| `backMidOffsetPx` | mean about `-20px`, min about `-28px` | `BackUp/BackDown` are offset to the opposite side. |
| `centerOffsetNorm` | mean about `0.178` | Above current reject threshold `NECK_CENTER_REJECT_NORM: 0.1`. |
| `backOffsetNorm` | mean about `-0.151` | Back landmarks are also strongly biased, opposite center. |
| `neckCenterConfidence` | mean about `0.018` | Center gate almost fully rejects the real center landmarks. |
| `neckCenterCompX` | mean about `1.45`, max `1.5` | Visual X compensation is nearly saturated. |
| `yaw` | mean about `-0.227 rad` | Follower pose is pulled to one side while user appears forward. |
| preliminary `opposingBias` | `60/60` samples true with `8px` opposing thresholds | Center and back offsets disagree every sampled frame. |

Why chain/physics should not be modified first:

- The visible sideways pull appears before the chain simulation can solve it: `CenterUp/CenterDown` and `BackUp/BackDown` are part of the pose input itself.
- `ACTIVE_IMGPOINTS` currently equals `IMGPOINTS_6`, and includes both center and back labels:
  - `torsoNeckCenterUp`
  - `torsoNeckLeftUp`
  - `torsoNeckRightUp`
  - `torsoNeckBackUp`
  - `torsoNeckCenterDown`
  - `torsoNeckBackDown`
- These labels are passed into WebAR.Rocks solvePnP through `solvePnPImgPointsLabels: ACTIVE_IMGPOINTS`.
- If the center landmarks pull one way and the back landmarks pull the opposite way, solvePnP must fit an inconsistent 2D/3D correspondence set. The result can bias yaw and translation even if the soft chain is calm.
- Current mobile smoothing/physics can reduce jitter, but it cannot make a biased solvePnP input geometrically correct.

Current working hypothesis:

The mobile portrait/close framing case can make `CenterUp/CenterDown` and `BackUp/BackDown` disagree around the neck centerline. Because both pairs are active solvePnP image points, the follower pose is biased. Then `neckCenterCompX` tries to compensate after the pose has already been biased, reaches max value, and can either under-correct or worsen perceived sideways drift.

## 2. Phase 1: Add Pose-Input A/B Profiles

Goal:
Test whether solvePnP behaves better when `BackUp/BackDown` are removed or when the active pose input is reduced to more stable landmarks.

Add a query parameter:

```text
?pnpProfile=full
?pnpProfile=noBack
?pnpProfile=sideOnly
?pnpProfile=sideCenter
```

Suggested profiles:

| Profile | Landmarks | Purpose |
| --- | --- | --- |
| `full` | current `IMGPOINTS_6`: `CenterUp`, `LeftUp`, `RightUp`, `BackUp`, `CenterDown`, `BackDown` | Current baseline. Keep this as default until logs prove otherwise. |
| `noBack` | `CenterUp`, `LeftUp`, `RightUp`, `CenterDown` | Test solvePnP without `BackUp/BackDown` bias. |
| `sideOnly` | `LeftUp`, `RightUp`, plus available left/right lower or model-supported side anchors if compatible | Test whether side anchors alone are more stable. Only use if solvePnP remains valid with the chosen point count and geometry. |
| `sideCenter` | `LeftUp`, `RightUp`, `CenterUp`, `CenterDown` | Same as `noBack` if only these four labels are available; keep name if later synthetic center is tested. |

Implementation notes for this phase:

- Do not change default behavior at first. Default should remain `full`.
- The query param should select the labels passed to `solvePnPImgPointsLabels`.
- If WebAR helper supports runtime `update_solvePnP()`, profile switching can happen before tracking start or during a controlled debug reset. Prefer before tracking start for first pass.
- Each exported JSON should include `pnpProfile`.
- Do not change chain geometry, chain physics, pendant placement, GLB transforms, camera startup, or WebAR follower setup.

Expected result:

If `noBack` reduces yaw bias and sideways drift while the user faces forward, `BackUp/BackDown` are likely harming mobile portrait solvePnP in this scenario.

Implementation status:

Phase 1 implemented. `?pnpProfile=full/noBack/sideCenter/sideOnly` is now available as a mobile-only A/B switch. Desktop ignores the override and remains `full`. Mobile without the query param also remains `full`, so the current default mobile behavior is unchanged. The effective profile is exported in debug JSON under `pnpProfile` and `runtime.pnpProfile`. `sideOnly` is currently a safe alias to `sideCenter` because the active NN does not expose lower left/right side landmarks.

Report:

Phase 1 A/B logs were reviewed:

- `mobile-forward-full-pnpab-eyelevel.json`
- `mobile-forward-noback-pnpab-eyelevel.json`
- `mobile-forward-noback-pnpab-high.json`

Result: `noBack` reduces the measured center/back landmark conflict and greatly reduces `neckCenterCompX` saturation, but it makes solvePnP pose stability much worse. In the eye-level log, `full` stayed mostly `good` in pose quality, while `noBack` was almost entirely `suspect`/`bad`, with much larger yaw range, yaw step, poseParentY range, and chain rest deviation. The high-phone `noBack` log improved center confidence and compensation saturation, but pose quality was still mostly `suspect`/`bad` and chain rest deviation stayed high. This suggests `BackUp/BackDown` are biased in some mobile views, but they still provide important depth/yaw constraints. Do not make `noBack` the mobile default.

Current decision: keep `full` as the default for desktop and mobile. Continue to Phase 2 diagnostics and Phase 3 compensation toggles. The next question is whether `neckCenterCompX` is helping or worsening sideways drift under the `full` profile, not whether back landmarks should be removed outright.

## 3. Phase 2: Add Diagnostics Metrics

Goal:
Make contradictory landmark geometry explicit in JSON and the debug drawer so A/B runs can be compared without visual guessing.

Log these metrics per sample and in latest motion/debug state:

- `centerOffsetPx`
- `backMidOffsetPx`
- `centerOffsetNorm`
- `backOffsetNorm`
- `opposingBias`
- `yaw`
- `neckCenterConfidence`
- `neckCenterCompX`
- `pnpProfile`

Definition:

```text
opposingBias =
  sign(centerOffsetPx) !== sign(backMidOffsetPx)
  AND abs(centerOffsetPx) >= CENTER_OPPOSE_PX
  AND abs(backMidOffsetPx) >= BACK_OPPOSE_PX
```

Initial thresholds:

| Threshold | Initial value | Reason |
| --- | --- | --- |
| `CENTER_OPPOSE_PX` | `8px` | 29jun log center offset was usually far above this. |
| `BACK_OPPOSE_PX` | `8px` | 29jun log back offset was usually far above this. |
| `CENTER_OPPOSE_NORM` | `0.06` | Lower than current reject `0.1`, useful as early warning. |
| `BACK_OPPOSE_NORM` | `0.06` | Symmetric starting point for back bias. |
| `LOW_CENTER_CONFIDENCE` | `< 0.25` | Center gate is effectively rejecting center landmarks. |
| `SATURATED_COMP_X` | `abs(neckCenterCompX) >= 0.85 * maxComp` | Detect when compensation is pinned near max. |

These are starting thresholds only. Tune them using real mobile logs from forward idle, slow yaw, and distance-change scenarios.

Suggested debug drawer rows:

- `PnP Profile`
- `Opposing Bias`
- `Center Offset`
- `Back Offset`
- `Center Conf`
- `Comp X`

## 4. Phase 3: Add Compensation Toggles

Goal:
Determine whether `neckCenterCompX` helps or worsens sideways drift when pose input is contradictory.

Add query params for controlled tests:

```text
?disableNeckCenterComp=1
?neckCenterCompSign=1
?neckCenterCompSign=-1
?neckCenterCompMax=0.6
?neckCenterCompMax=1.0
?neckCenterCompMax=1.5
```

Test behavior:

| Param | Expected use |
| --- | --- |
| `disableNeckCenterComp=1` | Prove whether sideways drift comes mainly from solvePnP pose or from local X compensation. |
| `neckCenterCompSign=1/-1` | Verify whether current compensation direction matches mirrored mobile preview behavior. |
| `neckCenterCompMax=0.6/1.0/1.5` | Check whether max compensation saturation is causing visible over-pull. |

Important:

- These toggles should only affect visual local X compensation.
- They should not change `ACTIVE_IMGPOINTS`, solvePnP object points, chain geometry, chain physics, or pendant transforms.
- Export the effective values in debug JSON.

## 5. Phase 4: Mobile Fallback Rule

Goal:
Use A/B evidence to decide whether mobile should fall back to a safer pose input profile when landmark geometry is contradictory.

Candidate rule:

```text
if mobile runtime
  AND pnpProfile is auto/full
  AND (opposingBias is sustained OR neckCenterConfidence is very low)
then test fallback to noBack
```

First implementation should be diagnostic/manual:

- Use explicit `?pnpProfile=noBack` for A/B runs.
- Do not automatically switch profiles live until logs prove that it improves stability.

If `noBack` is clearly better:

- Consider making `noBack` the mobile default only.
- Keep desktop default as `full`.
- Keep `?pnpProfile=full` fallback.
- Record the decision in `mobile-improve-plan.md` and `docs/mobile-optimization-log.md`.

If center landmarks are also unreliable:

- Consider deriving a synthetic centerline from the `LeftUp/RightUp` midpoint.
- Possible synthetic center approach:
  - compute `sideMidX = (leftUp.x + rightUp.x) * 0.5`;
  - keep real center Y values if stable;
  - replace or lightly blend center X toward `sideMidX`;
  - use this only for a debug profile first, for example `?pnpProfile=syntheticCenter`.
- Do not introduce synthetic landmarks as default until A/B logs prove less yaw bias and less sideways drift.

## 6. Phase 5: Test Matrix

Each test should be captured as a separate 10 second mobile log after tapping Reset Peaks. Use the same phone, lighting, distance, and forward-facing pose where possible.

| Test | URL params | Observe |
| --- | --- | --- |
| Full + compensation on | `?pnpProfile=full` | Baseline sideways drift, yaw bias, `neckCenterCompX` saturation, mouth intersection. |
| Full + compensation off | `?pnpProfile=full&disableNeckCenterComp=1` | Whether drift remains when local X compensation is removed. |
| NoBack + compensation on | `?pnpProfile=noBack` | Whether yaw bias and sideways pull improve without back landmarks. |
| NoBack + compensation off | `?pnpProfile=noBack&disableNeckCenterComp=1` | Whether noBack is stable without visual X correction. |
| NoBack + flipped compensation sign | `?pnpProfile=noBack&neckCenterCompSign=-1` | Whether current comp sign is wrong for mobile mirrored preview. |
| NoBack + lower comp max | `?pnpProfile=noBack&neckCenterCompMax=0.6` | Whether smaller compensation avoids over-pull while keeping center correction useful. |
| SideCenter + compensation on | `?pnpProfile=sideCenter` | Compare with noBack naming/profile behavior; useful if sideCenter later diverges. |
| SideCenter + compensation off | `?pnpProfile=sideCenter&disableNeckCenterComp=1` | Isolate solvePnP behavior from compensation. |

For each run, record:

- visual sideways drift: none / slight / obvious
- yaw bias while facing forward
- `centerOffsetNorm` and `backOffsetNorm`
- `opposingBias` count and duration
- `neckCenterCompX` range and whether it saturates
- jitter level
- pendant drift/off-center behavior
- whether chain curve intersects mouth/lower face
- whether slow yaw still responds normally

Suggested log names:

- `mobile-forward-full-comp-on.json`
- `mobile-forward-full-comp-off.json`
- `mobile-forward-noback-comp-on.json`
- `mobile-forward-noback-comp-off.json`
- `mobile-forward-noback-sign-flip.json`
- `mobile-forward-sidecenter-comp-on.json`
- `mobile-forward-sidecenter-comp-off.json`

## 7. Acceptance Criteria

The pose-input fix is successful when:

- Necklace is not visibly pulled sideways on mobile portrait while user faces forward.
- `yaw` is not strongly biased when the user is facing forward.
- `neckCenterCompX` does not stay saturated near max continuously.
- `center/back opposing bias` is detected and either avoided or handled by fallback.
- The selected profile does not introduce more jitter than `full`.
- Pendant remains centered under the front chain point.
- Slow yaw remains responsive and does not feel frozen.
- Chain curve does not enter the mouth/lower-face area more often than before.
- Desktop behavior is unchanged unless explicitly tested with a query param.

## 8. Implementation Notes

- Keep changes small and easy to roll back.
- Avoid broad refactors.
- Do not modify chain physics until pose input is confirmed.
- Do not change camera startup, WebAR init, follower setup, pendant asset loading, chain geometry, material/link style, or occlusion/fade in this investigation.
- Prefer query params and debug flags so every change can be A/B tested.
- Keep `full` as default until logs prove a better profile.
- If a profile needs fewer solvePnP points, verify the WebAR helper accepts that profile before using it in mobile QA.
- Always export effective `pnpProfile` and compensation settings.
- Update `mobile-improve-plan.md` after implementation and after reviewing logs.
- Bump `index.html` script cache-bust after JS changes.

## Rollback Strategy

All first-pass changes should be reversible through URL params:

- `?pnpProfile=full`
- no `disableNeckCenterComp`
- `?neckCenterCompSign=1`
- `?neckCenterCompMax=1.5`

If any A/B profile worsens tracking, return to the current accepted mobile stack and keep the new metrics as diagnostics only.
