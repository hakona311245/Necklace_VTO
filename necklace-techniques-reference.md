# Necklace Try-On Techniques Reference

This file records reusable technical patterns from the necklace try-on rebuild. It is intentionally independent of repository history and folder names. Use it as a future reference when migrating, debugging, or rebuilding similar virtual try-on features.

## Core Principle

The necklace pipeline should have one tracking source and one attachment hierarchy:

```text
WebAR/solvePnP tracking
  -> threeFaceFollowers[0]
  -> necklaceGroup
  -> procedural chain
  -> pendantPivot
  -> PNG plane or GLB model
```

Avoid creating separate tracking flows for different pendant types. PNG and GLB pendants should both attach to the same `pendantPivot`.

## WebAR And Three.js Integration

Use classic global scripts when working with WebAR.Rocks helpers:

```text
THREE
WEBARROCKSFACE
WebARRocksFaceThreeHelper
```

The safest dependency order is:

```text
Three.js core
Three.js loaders
Three.js postprocessing helpers
WebAR.Rocks engine
WebAR.Rocks Three helper
landmark stabilizer
application code
```

Use two stacked canvases:

```text
camera/tracking canvas
Three.js overlay canvas
```

Keep their CSS size and drawing buffer size identical. Mirror both canvases for selfie view.

## Tracking Pose Strategy

Use the WebAR/solvePnP follower as the visual source of truth.

Recommended default:

```js
TRACKING_POSE_MODE: 'sourceRaw'
```

This means:

- do not continuously offset `necklaceGroup.position.y`;
- do not continuously rotate `necklaceGroup.rotation.x`;
- use raw follower pose for visual attachment;
- use smoothing mainly for physics, metrics, and optional fallback modes.

If the chain appears offset while debug shows:

```text
Group Y = 0
Comp Y = 0
Tracking Mode = sourceRaw
```

then the problem is usually chain geometry, occlusion, or physics rather than tracking compensation.

## Neck Model And Chain Rest Path

Build a neck-local model from the same object points used for solvePnP. This keeps geometry and tracking in the same coordinate system.

Typical model output:

```js
{
  centerX,
  centerY,
  centerZ,
  radiusX,
  radiusZ,
  yFront,
  ySide,
  yBack,
  yOf(cosT)
}
```

Generate loop points around the neck using `t` from `0..2PI`:

```js
const cosT = Math.cos(t);
const sinT = Math.sin(t);
```

Use:

- `cosT` for front/back depth;
- `sinT` for left/right width;
- `yOf(cosT)` for vertical drape.

Keep the front node stable because pendant attachment depends on it.

## Chain Shape Tuning

Tune chain shape in rest-loop geometry, not with occlusion or shader fade.

Useful geometry controls:

```js
CHAIN_WIDTH_SCALE
CHAIN_DEPTH_SCALE
CHAIN_SIDE_INSET
CHAIN_CURVE_TENSION
SIDE_ARC_SMOOTHNESS
CHAIN_Y_OFFSET
FRONT_DROP_SCALE
SIDE_RAISE
BACK_RAISE
NECK_LIFT
```

To avoid an overly round U-shaped necklace, add a soft V profile near the front:

```js
CHAIN_V_FRONT_START
CHAIN_V_TAPER
CHAIN_V_SHOULDER_LIFT
CHAIN_V_POWER
```

The V profile should keep the exact lowest/front point fixed and only shape nearby shoulders. This prevents pendant reattachment bugs.

## Tube Chain Rendering

Use `CatmullRomCurve3` and `TubeGeometry` as the stable fallback chain renderer:

```js
const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', tension);
const geometry = new THREE.TubeGeometry(curve, segments, tubeRadius, radialSegments, true);
```

Tube mode is useful for:

- debugging chain path;
- low performance devices;
- fallback if instanced links fail;
- preserving chain simulation with a simple visual.

## Linked Chain Rendering

For a more jewelry-like chain, keep the same curve and place repeated oval links along it.

Implementation pattern:

```js
const linkGeometry = new THREE.TorusGeometry(radius, tubeRadius, radialSegments, tubularSegments);
const linkMesh = new THREE.InstancedMesh(linkGeometry, material, count);
```

For each link:

```js
curve.getPointAt(u, point);
curve.getTangentAt(u, tangent).normalize();
quat.setFromUnitVectors(AXIS_X, tangent);
matrix.compose(point, quat, scale);
linkMesh.setMatrixAt(i, matrix);
```

Alternate link orientation to avoid repeated flat rings:

```js
if (i % 2 === 1) {
  altQuat.setFromAxisAngle(tangent, Math.PI / 2);
  quat.multiply(altQuat);
}
```

When using soft-body chain motion, update instance matrices every time the chain curve rebuilds.

For a smaller women’s necklace chain, reduce individual link size and increase count:

```js
LINK_COUNT: 84
LINK_RADIUS: 1.8
LINK_TUBE_RADIUS: 0.22
LINK_SCALE_X: 1.55
LINK_SCALE_Y: 0.85
```

## Chain Material

Use `MeshStandardMaterial` for metal:

```js
metalness: 1.0
roughness: 0.16
envMapIntensity: 1.75
```

Useful chain controls:

```js
CHAIN_COLOR
CHAIN_METALNESS
CHAIN_ROUGHNESS
CHAIN_ENV_INTENSITY
CHAIN_EMISSIVE
CHAIN_EMISSIVE_INTENSITY
```

Do not overuse emissive. A small value prevents the chain from disappearing in dark camera frames, but too much makes it look plastic.

## Soft-Body Chain Motion

A stable necklace chain benefits from a Verlet-style rope model.

State arrays:

```js
softRest
softCur
softPrev
softFreedom
```

Key behavior:

- front arc has more freedom;
- side/back nodes are mostly pinned;
- current and previous positions encode velocity;
- rest spring pulls nodes back to the original chain path;
- neighbor coupling spreads ripple along the chain;
- max deviation prevents explosion;
- deadzone prevents camera jitter from driving motion.

Important details:

```js
safeDt = clamp(dt, 1 / 120, 0.04)
poseMove >= SOFT_MOTION_DEADZONE
```

Use raw `dt` separately for stalled-frame detection. Use clamped `dt` for physics.

On tracking lost or stalled frames:

```js
resetSoftChainVelocity();
relaxSoftChainToRest(0.25);
```

To avoid gradual deformation drift:

```js
SOFT_REST_BLEND
```

Blend both `softCur` and `softPrev` toward rest so the chain rebalances without injecting new velocity.

When pose Y spikes:

```js
dampSoftChainVelocity(SOFT_SPIKE_VELOCITY_DAMPING);
```

In Verlet, velocity is `cur - prev`; moving `prev` toward `cur` damps velocity.

## Depth Occlusion

A custom neck occluder can hide the back/nape part of the chain.

Use a depth-only material:

```js
new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: true,
  depthTest: true,
  side: THREE.DoubleSide
});
```

Important rules:

- occluder should be a child of `necklaceGroup`;
- render before the visible chain;
- do not use occluder radius to fix chain shape;
- do not hide front chain or pendant.

## Yaw Fade

Shader fade can hide hard floating tips during head turns.

Pattern:

- inject local chain coordinates into shader;
- pass yaw uniform;
- compute facing depth;
- fade alpha by `smoothstep`.

Yaw fade is visual polish only. It should not be used to solve geometry or tracking errors.

## Pendant Attachment

Use one `pendantPivot` as the attachment point.

The pivot should represent the pendant top/bail, not the pendant center.

PNG layout pattern:

```js
pendantPivot.position = frontChainPoint + offset;
pendantMesh.position.y = -planeHeight / 2 + visibleTopInset;
```

This makes the top edge or visual bail touch the chain.

If PNGs have transparent top padding, adjust:

```js
PENDANT_VISIBLE_TOP_INSET
```

If the whole pendant needs to move relative to the chain point, adjust:

```js
PENDANT_DROP
PENDANT_FWD
```

## PNG Pendant Rendering

Use `MeshBasicMaterial` for PNG pendant images so lighting does not make product images too dark.

Useful image boost controls:

```js
PENDANT_BRIGHTNESS
PENDANT_CONTRAST
PENDANT_SATURATION
PENDANT_LIFT
PENDANT_ALPHA_GAIN
PENDANT_ALPHA_TEST
```

Avoid over-brightening. If details disappear, lower brightness/lift and slightly increase contrast.

## GLB Pendant Rendering

GLB mode should use the same `pendantPivot` as PNG mode:

```text
pendantPivot
  -> pngPendantPlane
  -> glbPendantGroup
       -> loaded GLB scene
```

Wrap the loaded GLB in a calibration group. Apply transform to the wrapper, not to `pendantPivot`.

Reason:

- GLB model axes depend on export tools;
- GLB pivots are often not at the bail/top;
- pendantPivot must remain the chain attachment point;
- per-model calibration should not affect tracking or chain.

Useful GLB transform controls:

```js
GLB_PENDANT_SCALE
GLB_PENDANT_ROTATION_X
GLB_PENDANT_ROTATION_Y
GLB_PENDANT_ROTATION_Z
GLB_PENDANT_OFFSET_X
GLB_PENDANT_OFFSET_Y
GLB_PENDANT_OFFSET_Z
```

If models need different transforms, add per-product overrides in the catalog later.

## GLB Material Brightness

GLB materials can render too dark depending on exported material settings.

Traverse loaded GLB:

```js
root.traverse(node => {
  if (!node.isMesh || !node.material) return;
});
```

For each material:

- store base color once;
- brighten by blending toward white;
- set metalness if supported;
- set roughness if supported;
- set envMapIntensity if supported.

Avoid repeatedly multiplying colors, because every retune would compound brightness.

## Pendant Pendulum Motion

Use a spring-damper state:

```js
sx, vx
sz, vz
```

Suggested interpretation:

- `sx`: forward/back swing around X;
- `sz`: left/right swing around Z;
- pitch and roll drive rest angles;
- yaw speed adds a side impulse.

Basic equations:

```js
restX = -GRAVITY_PITCH * pitch
restZ = -GRAVITY_ROLL * roll
ax = -stiffness * (sx - restX) - damping * vx
az = -stiffness * (sz - restZ) - damping * vz - yawKick * yawSpeed
```

Clamp swing:

```js
sx = clamp(sx, -maxSwing, maxSwing)
sz = clamp(sz, -maxSwing, maxSwing)
```

For GLB mode, use smaller caps than PNG mode. 3D models visually detach more easily when over-rotated.

## GLB Motion Caps

GLB mode should keep subtle motion but stay anchored.

Useful params:

```js
GLB_SWING_ENABLED
GLB_SWING_STRENGTH
GLB_SWING_MAX_ROTATION
GLB_SWING_MAX_OFFSET
GLB_SWING_DAMPING
```

The model wrapper can receive a very small clamped visual offset, but `pendantPivot` must remain fixed to the chain front point.

## Debugging Motion

Useful debug metrics:

```text
Follower Y
Follower Rot X
Pose Parent Y
Pose Pitch
Group Y
Comp Y
Pitch Comp
Frame dt
Chain Sim
Peak Y Jump
Last 2s Y Jump
Peak Pitch Step
```

Interpretation:

- `Group Y = 0` and `Comp Y = 0` means visual pose compensation is not moving the necklace.
- high `Peak Y Jump` means raw pose had a spike.
- `Chain Sim = moving` while user is still can indicate soft-chain velocity or deformation has not settled.

## Temporary GLB Keyboard Tuning

Useful for calibration:

```text
Q / E       rotation X -/+
A / D       rotation Y -/+
Z / C       rotation Z -/+
+ / -       scale +/-
Arrow Left  offset X -
Arrow Right offset X +
Arrow Up    offset Y +
Arrow Down  offset Y -
Shift+Arrow larger offset step
```

Every edit should log transform values. Copy those values back into params once a model looks correct.

Remove or guard this for production.

## Common Failure Modes

### 3D Button Falls Back To PNG

Likely causes:

- catalog item lost its `glb` field during normalization;
- GLB file path case does not match actual file name;
- `THREE.GLTFLoader` did not load;
- GLB request failed.

### Pendant Detaches During Motion

Likely causes:

- shared pendulum swing too strong for GLB mode;
- GLB wrapper offset too large;
- GLB pivot/export origin far from visual bail.

Fix with GLB-specific caps first. Do not move `pendantPivot`.

### Chain Drifts Up Over Time

Likely causes:

- soft-chain velocity accumulation;
- no rest blend;
- pose spike not damped;
- tracking lost did not reset velocity.

Fix in soft-chain physics, not tracking.

### Chain Shape Looks Wrong

Likely causes:

- rest path geometry;
- width/depth scale;
- side inset;
- V taper/lift;
- curve tension.

Do not solve chain shape with occlusion/fade.

