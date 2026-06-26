# Neck Center Confidence Gate

## Problem

`NN_NECKLACE_9.json` predicts six neck landmarks:

- `torsoNeckCenterUp`
- `torsoNeckCenterDown`
- `torsoNeckLeftUp`
- `torsoNeckRightUp`
- `torsoNeckBackUp`
- `torsoNeckBackDown`

Live debug logs showed that the two center landmarks can be correct in one head pose and biased in another. Example readings:

```text
Straight/front:
centerOffsetPx: 31.9
centerOffsetNorm: 0.157

Turn left:
centerOffsetPx: 3.9
centerOffsetNorm: 0.019

Turn right:
centerOffsetPx: 16.3
centerOffsetNorm: 0.085
```

This means the center-neck landmarks should not receive a constant correction. The error is pose-dependent. A fixed X shift would improve one pose and break another.

## Fix

The implemented fix keeps WebAR.Rocks solvePnP untouched and adds a visual confidence gate:

1. Compute the raw center line from `CenterUp` and `CenterDown`.
2. Compute a side-derived center from the midpoint of `LeftUp` and `RightUp`.
3. Measure the raw center offset as a fraction of visible neck width.
4. Trust raw center when the offset is small.
5. Blend toward the side-derived center when the offset grows.
6. Apply only a small local visual X compensation to `necklaceGroup`.

This is intentionally conservative. It does not edit neural-net output, solvePnP object points, image-point labels, WebAR init settings, or pendant attachment.

## Main Parameters

In `recreate-necklace.js`:

```js
NECK_CENTER_GATE_ENABLED
NECK_CENTER_TRUST_NORM
NECK_CENTER_REJECT_NORM
NECK_CENTER_VISUAL_X_COMP_ENABLED
NECK_CENTER_VISUAL_X_MAX_COMP
NECK_CENTER_VISUAL_X_SMOOTHING
NECK_CENTER_VISUAL_X_SIGN
```

Important behavior:

- Below `NECK_CENTER_TRUST_NORM`, the app trusts the raw center landmarks.
- Above `NECK_CENTER_REJECT_NORM`, it mostly trusts the side-derived center.
- `NECK_CENTER_VISUAL_X_MAX_COMP` caps how far the visual necklace can move.
- `NECK_CENTER_VISUAL_X_SIGN` is the emergency direction flip if the visual correction moves the wrong way.

## Debug Logs

Existing landmark bias logs remain:

```text
[neck-landmark-bias]
```

The log now also includes:

```text
centerConfidence
centerBlendToSide
visualCompX
```

Readings:

- `centerConfidence` near `1`: raw center landmarks are trusted.
- `centerConfidence` near `0`: raw center is treated as biased.
- `centerBlendToSide` near `1`: side midpoint is dominant.
- `visualCompX`: local visual X offset being applied to the necklace group.

## How To Test

1. Open the app through a local server.
2. Open browser DevTools Console.
3. Start tracking.
4. Face camera straight for 5-10 seconds.
5. Turn left for 5-10 seconds.
6. Turn right for 5-10 seconds.
7. Watch `[neck-landmark-bias]`.

Expected:

- Good center readings should have `centerOffsetNorm < 0.04`.
- Moderate bias should blend gradually.
- Large bias should produce a capped `visualCompX`, not a sudden jump.
- The necklace should not visibly chase every landmark frame.

## How To Revert

Fast runtime revert:

```js
NECK_CENTER_GATE_ENABLED: false
```

Or keep debug metrics but disable visual movement:

```js
NECK_CENTER_VISUAL_X_COMP_ENABLED: false
```

If the correction moves in the wrong horizontal direction, do not remove the whole feature first. Flip:

```js
NECK_CENTER_VISUAL_X_SIGN: -1
```

Full code revert:

1. Remove the neck-center gate params from `PARAMS`.
2. Remove `STATE.neckCenter`.
3. Remove `updateNeckCenterGate()`, `releaseNeckCenterGate()`, and related metric fields.
4. Remove the `applied.x` assignment in `applyTrackingPoseMode()`.
5. Remove `logLandmarkBias()` calls only if the debug logger is no longer needed.

## What Not To Revert Accidentally

Do not revert these unrelated systems while backing out this gate:

- WebAR.Rocks helper `callbackBeforeRender` support.
- Existing motion guard and soft-chain recovery.
- Pendant PNG/GLB shared `pendantPivot`.
- Chain endpoint fade and front-only link rendering unless you are intentionally undoing the chain curve change.
