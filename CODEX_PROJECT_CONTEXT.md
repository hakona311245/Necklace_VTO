# Necklace VTO Project Context

This document describes the standalone WebAR necklace implementation in this root-level repo. It is intended for migrating this implementation into a clean repository while preserving the architecture, tuning decisions, and lessons learned.

## Current Status

This demo is a standalone browser page for necklace virtual try-on using:

- WebAR.Rocks face/neck tracking.
- Three.js r136 in classic global script mode.
- `NN_NECKLACE_9.json` neck landmarks.
- WebAR.Rocks solvePnP follower pose.
- A procedural necklace chain attached to `threeFaceFollowers[0]`.
- Optional linked-chain rendering.
- PNG pendant mode.
- Experimental GLB pendant mode.
- Product switching.
- Metal color switching.
- Capture.
- Debug drawer with tracking/motion metrics.

The main files are:

```text
index.html
recreate-necklace.js
necklace-catalog.json
custom/DN-0075-1-removebg.png
custom/DN-0105-1_removebg.png
custom/DN-0075-3D.glb
custom/DN-0105-3d.glb
```

## How To Run

From the repo root:

```bash
python -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765/
```

Use a normal localhost server, not direct `file://`, because camera and asset loading are more reliable over HTTP. On mobile, use HTTPS or a trusted LAN setup if camera permissions require it.

Static checks:

```bash
node --check recreate-necklace.js
node -e "JSON.parse(require('fs').readFileSync('necklace-catalog.json','utf8')); console.log('catalog ok')"
```

## Runtime Architecture

The page uses two stacked canvases:

```text
WebARRocksFaceCanvas  -> WebAR.Rocks camera/tracking frame
threeCanvas           -> Three.js AR overlay
```

Both canvases are mirrored with CSS for selfie view and sized together by `layoutCanvases(aspect)`.

Script loading in `index.html` is classic global script mode:

```text
Three.js r136
GLTFLoader
RGBELoader
postprocessing helpers
WebARRocksFace.js
WebARRocksFaceThreeHelper.js
OneEuroLMStabilizer.js
recreate-necklace.js
```

Do not convert this to Vite/modules unless you also refactor the WebAR.Rocks helper integration. The code intentionally depends on globals:

```js
THREE
WEBARROCKSFACE
WebARRocksFaceThreeHelper
```

The runtime flow is:

```text
index.html
  -> recreate-necklace.js
  -> WebARRocksFaceThreeHelper.init(...)
  -> NN_NECKLACE_9.json
  -> solvePnP using ACTIVE_IMGPOINTS + SOLVEPNP_OBJPOINTS
  -> sceneObjects.threeFaceFollowers[0]
  -> necklaceGroup
  -> chain + pendantPivot
  -> PNG plane or GLB pendant renderer
```

`pendantPivot` is the single attachment point for both PNG and GLB pendants. Do not create a second tracking or follower path for 3D pendants.

## Product Catalog

`necklace-catalog.json` currently contains:

```json
[
  {
    "id": "dn-0075-1",
    "name": "DN-0075-1",
    "image": "custom/DN-0075-1-removebg.png",
    "glb": "custom/DN-0075-3D.glb",
    "metal": "white"
  },
  {
    "id": "dn-0105-1",
    "name": "DN-0105-1",
    "image": "custom/DN-0105-1_removebg.png",
    "glb": "custom/DN-0105-3d.glb",
    "metal": "white"
  }
]
```

Important detail: `normalizeCatalog()` must preserve `glb`, `modelUrl`, `model`, or `glbUrl`. Earlier, `normalizeCatalog()` dropped the `glb` field, so clicking `3D` immediately fell back to PNG mode. This is fixed.

## Phase Summary

### Phase 1: Static Shell And Dependencies

Built `index.html` with:

- `WebARRocksFaceCanvas`
- `threeCanvas`
- classic script tags
- minimal controls
- dependency checks in JS

Important requirement: use Three.js r136 because WebAR.Rocks helper compatibility was built around this version.

### Phase 2: Canvas Layout And Asset Base

Added:

- `ASSET_BASE`
- `DEFAULT_VIDEO_ASPECT = 16 / 9`
- `layoutCanvases(aspect)`
- capped device pixel ratio
- front camera `videoSettings()`

The two canvases must always have the same CSS size and same backing buffer size.

### Phase 3: WebAR.Rocks Tracking Boot

Added:

- `NN_REGISTRY` with `NN_NECKLACE_9.json`
- `IMGPOINTS_6`
- `ACTIVE_IMGPOINTS`
- `NECK_RAW`
- `SOLVEPNP_OBJPOINTS`
- `startTracking()`
- `onReady(err, sceneObjects)`
- `onTrack(state)`

Critical tracking settings:

```js
scanSettings.threshold = 0.7
landmarksStabilizerSpec = { beta: 5, forceFilterNNInputPxRange: [8, 16] }
rotationContraints = {
  order: 'YXZ',
  rotXFactor: PARAMS.ROT_PITCH,
  rotYFactor: PARAMS.ROT_YAW,
  rotZFactor: PARAMS.ROT_ROLL
}
```

Do not change solvePnP points or WebAR init unless you are intentionally retuning tracking from scratch.

### Phase 4: Debug Follower Verification

Added temporary RGB tracker axes as a child of `threeFaceFollowers[0]`.

The debug drawer can toggle this object with "Show tracker axes on main view".

This verified that the necklace should attach to the follower, not directly to the scene.

### Phase 5: Static Chain And Debug Drawer

Added:

- `buildNeckModel()`
- `buildStaticChain()`
- `necklaceGroup`
- chain rest points
- `CatmullRomCurve3`
- `TubeGeometry`
- right debug drawer
- debug preview canvas with camera frame and 2D landmarks

The chain is built in neck-local coordinates and attached to:

```js
REFS.follower.add(necklaceGroup)
```

### Phase 6: PNG Pendant Plane

Added:

- `pendantPivot`
- transparent PNG pendant plane
- `layoutPendant(aspect)`
- `setProduct(item)`
- `necklace-catalog.json`

Important pendant placement:

```js
PENDANT_DROP: -12
PENDANT_VISIBLE_TOP_INSET: 17
PENDANT_FWD: 8
```

`PENDANT_VISIBLE_TOP_INSET` compensates for transparent padding at the top of removebg PNGs. `PENDANT_DROP` moves the pivot relative to the front chain point.

The separate connector/bail mesh was removed because it appeared as a dark dot with removebg assets. Do not reintroduce it unless there is a proper asset or geometry for it.

### Phase 7: Lighting, Materials, HDR Envmap

Added:

- renderer color/tone setup
- hemisphere/key/fill/rim lights
- HDR envmap through `RGBELoader`
- metal material tuning
- pendant texture brightness shader

Important current values:

```js
RENDER_EXPOSURE: 1.12
CHAIN_COLOR: 0xf4f4f0
CHAIN_ROUGHNESS: 0.16
CHAIN_METALNESS: 1.0
CHAIN_ENV_INTENSITY: 1.75
CHAIN_EMISSIVE: 0x1b1b18
CHAIN_EMISSIVE_INTENSITY: 0.08
```

PNG pendant image boost:

```js
PENDANT_BRIGHTNESS: 1.35
PENDANT_CONTRAST: 1.18
PENDANT_SATURATION: 1.03
PENDANT_LIFT: 0.015
PENDANT_ALPHA_GAIN: 1.35
PENDANT_ALPHA_TEST: 0.04
```

### Phase 8: Depth Occlusion

Added a custom depth-only neck occluder:

```js
OCCLUDER_ENABLED: true
OCCLUDER_RADIUS_X: 0.86
OCCLUDER_RADIUS_Z: 0.5
OCCLUDER_HEIGHT_SCALE: 2.4
OCCLUDER_BACK_PUSH: 0.32
OCCLUDER_Y_OFFSET: 0
```

Important lesson: occlusion/fade should not be used to fix chain shape. A previous attempt to tune occlusion to fix side arcs made the chain look more tucked into the neck. Geometry/path issues should be fixed in `buildStaticChain()`, not in occlusion.

### Phase 9: Yaw Shader Fade

Added `applyChainFade(mat, fadeFull, fadeGone)` with shader uniforms.

Current values:

```js
FADE_ENABLED: true
FADE_START_FRAC: 0.78
FADE_END_FRAC: 0.96
YAW_REST_ADAPT: 0.03
YAW_HIDE_SIGN: 1
```

The shader soft-fades the back/receding chain so side ends do not look like hard floating tips during head turns.

### Phase 10: Product UI, Metal Toggle, Capture

Added:

- product strip
- metal toggle
- PNG/3D pendant mode toggle
- capture button
- `captureComposite()`

UI controls in `index.html`:

```text
Product strip: DN-0075-1, DN-0105-1
Start tracking
Metal: White / Yellow
Pendant mode: PNG / 3D
Capture
Debug drawer
```

`setMetal(metal)` updates chain/link materials only.

Capture composites camera canvas and Three.js canvas in mirrored selfie orientation.

### Phase 11: Soft Chain Motion

The initial hand-rolled chain motion was not stable/natural enough. It was replaced with a Verlet-style soft-body technique:

- Verlet soft-body rope
- world-space inertia
- motion deadzone
- neighbor coupling
- pinned side/back nodes
- max deviation clamp
- reset/relax on tracking lost

Current soft params:

```js
SOFT_ENABLED: true
SOFT_NODES: 34
SOFT_TUBE_SEGMENTS: 150
SOFT_GRAVITY: 150
SOFT_STIFFNESS: 64
SOFT_NEIGHBOR: 60
SOFT_DAMPING: 0.76
SOFT_PIN_STRENGTH: 12
SOFT_MAX_DEV: 11
SOFT_MOTION_DEADZONE: 2.4
SOFT_FRONT_PIN: 0.3
SOFT_REST_BLEND: 0.018
SOFT_SPIKE_Y_THRESHOLD: 8
SOFT_SPIKE_VELOCITY_DAMPING: 0.7
```

Important fixes:

- `rawDt` is kept for stalled-frame detection.
- runtime `dt` is clamped to `0.04`.
- tracking lost calls `resetSoftChainVelocity()` and `relaxSoftChainToRest(0.25)`.
- per-frame `SOFT_REST_BLEND` prevents soft-chain deformation from drifting upward over time.
- pose spikes damp Verlet velocity so the chain does not keep old deformation.

### Phase 12: Pendant Pendulum Motion

Added spring-damper pendant swing:

```js
PHYS_ENABLED: true
PHYS_STIFFNESS: 120
PHYS_DAMPING: 6.0
GRAVITY_ROLL: 0.85
GRAVITY_PITCH: 0.55
YAW_SHAKE_KICK: 0.6
SWING_MAX: 0.55
```

The swing rotates `pendantPivot`, not the mesh center. This keeps the pendant visually hanging from the chain.

For GLB mode, the shared physics was too strong, so GLB-specific caps were added:

```js
GLB_SWING_ENABLED: true
GLB_SWING_STRENGTH: 0.35
GLB_SWING_MAX_ROTATION: 0.16
GLB_SWING_MAX_OFFSET: 2.5
GLB_SWING_DAMPING: 10.0
```

This keeps subtle 3D movement but prevents the model from over-tilting or visually detaching from the chain.

## Tracking And Pose Decisions

The tracking setup is intentionally conservative and should stay stable:

- `NN_NECKLACE_9.json`
- 6 solvePnP image points
- fixed object points
- fixed landmark stabilizer settings
- `scanSettings.threshold: 0.7`
- constrained Euler rotation order/factors

The key pose decision is that the necklace should follow the raw WebAR/solvePnP follower pose directly. `TRACKING_POSE_MODE` defaults to:

```js
TRACKING_POSE_MODE: 'sourceRaw'
```

This means:

- `necklaceGroup.position.y` stays near `0`.
- `necklaceGroup.rotation.x` stays near `0`.
- visual tracking follows the raw follower pose.
- smoothing/compensation is retained mostly for metrics/debug or optional modes.

Avoid changing this unless you intentionally want to reintroduce compensated pose behavior.

## Chain Geometry

Chain geometry is generated from neck-local loop points in `buildStaticChain()`.

Key shape params:

```js
CHAIN_GAP: 1.0
CHAIN_WIDTH_SCALE: 1.05
CHAIN_DEPTH_SCALE: 0.94
CHAIN_SIDE_INSET: 0.04
CHAIN_CURVE_TENSION: 0.4
SIDE_ARC_SMOOTHNESS: 0.82
CHAIN_Y_OFFSET: 0
FRONT_DROP_SCALE: 0.2
SIDE_RAISE: 0.7
BACK_RAISE: 0.82
NECK_LIFT: 30
```

We later made the chain slightly more V-shaped to avoid a too-round U shape:

```js
CHAIN_V_FRONT_START: 0.15
CHAIN_V_TAPER: 0.14
CHAIN_V_SHOULDER_LIFT: 5.0
CHAIN_V_POWER: 1.1
```

Important rule: fix chain shape in `buildStaticChain()` / rest loop points, not with occlusion/fade.

## Chain Rendering: Tube And Linked Style

The original chain was a smooth `TubeGeometry`, which looked too much like a plain tube.

We kept tube mode as fallback and added optional linked-chain rendering:

```js
CHAIN_STYLE: 'links'
```

Tube fallback still exists:

```js
CHAIN_STYLE: 'tube'
```

Current link params:

```js
LINK_COUNT: 82
LINK_RADIUS: 2.7
LINK_TUBE_RADIUS: 0.34
LINK_SCALE_X: 1.7
LINK_SCALE_Y: 1.0
LINK_RADIAL_SEGMENTS: 8
LINK_TUBULAR_SEGMENTS: 18
LINK_ALTERNATE_ROTATION: 1.5708
LINK_VISIBLE_FRONT_ONLY: false
```

Implementation:

- tube mesh is still created for fallback and shared curve logic.
- linked mode uses `InstancedMesh`.
- each link is a small `TorusGeometry`.
- instances are sampled along `REFS.chainCurve` with `getPointAt()` and `getTangentAt()`.
- instance matrices update every time soft chain geometry rebuilds.

If the links look too large for a women's necklace, tune:

```js
LINK_COUNT
LINK_RADIUS
LINK_TUBE_RADIUS
LINK_SCALE_X
LINK_SCALE_Y
```

Recommended smaller chain starting point:

```js
LINK_COUNT: 84,
LINK_RADIUS: 1.8,
LINK_TUBE_RADIUS: 0.22,
LINK_SCALE_X: 1.55,
LINK_SCALE_Y: 0.85
```

If links become too sparse, increase `LINK_COUNT`.

## PNG Pendant Mode

PNG mode is the stable default:

```js
PENDANT_MODE: 'png'
```

PNG flow:

```text
setProduct(item)
  -> TextureLoader loads item.image
  -> layoutPendant(aspect)
  -> pendantPivot visible
```

The PNG plane uses `MeshBasicMaterial` with a custom shader boost, so camera lighting does not make the image too dark.

Do not break PNG mode when changing GLB mode. PNG is the fallback for products without GLB assets or failed GLB loads.

## GLB Pendant Mode

GLB mode is experimental but working:

```js
PENDANT_MODE: 'glb'
```

Use the UI `3D` button or:

```js
RecreateNecklace.setPendantMode('glb')
RecreateNecklace.setPendantMode('png')
```

GLB architecture:

```text
pendantPivot
  -> PNG pendant plane
  -> ExperimentalGLBPendantGroup
       -> ExperimentalGLBPendantScene
```

Only one renderer is visible at a time.

Current base GLB transform:

```js
GLB_PENDANT_SCALE: 73.717
GLB_PENDANT_ROTATION_X: -8.552
GLB_PENDANT_ROTATION_Y: -1.571
GLB_PENDANT_ROTATION_Z: -2.182
GLB_PENDANT_OFFSET_X: 0
GLB_PENDANT_OFFSET_Y: -4
GLB_PENDANT_OFFSET_Z: 0
```

These values were manually calibrated using temporary keyboard controls. Do not change them unless the GLB model or coordinate convention changes.

GLB material tuning:

```js
GLB_ENV_INTENSITY: 2.2
GLB_BRIGHTNESS: 1.28
GLB_METALNESS: 0.9
GLB_ROUGHNESS: 0.2
```

`tuneGLBPendantMaterials(root)` traverses the loaded GLB and:

- stores the original material color in `material.userData.glbBaseColor`.
- blends material color slightly toward white.
- sets metalness/roughness/envMapIntensity where supported.
- avoids stacking brightness repeatedly.

## Temporary GLB Transform Keyboard Controls

These controls are intentionally temporary and only work when GLB mode is active and a GLB model has loaded.

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

Each edit logs current values:

```text
[recreate-shell] GLB pendant transform { ... }
```

Copy logged values back into `PARAMS` after calibration.

## Debug Drawer

The debug drawer shows:

- tracking status
- score
- landmark count
- active chain/pendant state
- follower Y
- pose parent Y
- pitch
- group Y
- compensation Y
- pitch compensation
- frame dt
- tracking mode
- chain simulation status
- peak motion recorder

This was used to diagnose:

- chain jumping upward
- pose compensation artifacts
- soft-chain drift
- pitch/Y spike behavior

Important interpretation:

- If `Tracking Mode = sourceRaw`, `Group Y = 0`, and `Comp Y = 0`, then visual tracking is not being offset by local compensation.
- If chain is still drifting, inspect soft-chain state, not WebAR tracking.

## Problems Fixed During Rebuild

### 1. Missing GLB Mode After Button Click

Cause:

`normalizeCatalog()` dropped the `glb` field from catalog items.

Fix:

Preserve:

```js
item.glb || item.modelUrl || item.model || item.glbUrl
```

### 2. Connector Dot Artifact

Cause:

A connector/bail mesh appeared as a dark dot with removebg pendant assets.

Fix:

Removed connector mesh. The PNG/GLB itself visually touches the chain.

### 3. Pendant Too Dark

Cause:

PNG cutouts and GLB materials looked too dark relative to camera and chain.

Fixes:

- PNG shader brightness/contrast/saturation/alpha boost.
- GLB material traversal with brightness/env/metalness tuning.
- chain/rim lighting improvements.

### 4. Chain Too Round/U-Shaped

Cause:

Initial loop looked like a circular U. It only looked correct with very precise tracking.

Fix:

Added V-shaping params that keep the front point fixed while tapering/lifting nearby shoulders.

### 5. Chain Side Arcs Invading Neck

Cause:

Attempting to fix side shape with occlusion/fade made it worse.

Fix:

Restored occlusion/fade values and tuned chain path geometry only.

### 6. Chain Jumping/Drifting Up After Motion

Cause:

Soft-chain deformation/velocity could survive motion spikes or tracking loss.

Fixes:

- `rawDt` stall detection.
- `dt` clamp.
- velocity reset on lost/stall.
- `relaxSoftChainToRest()`.
- `SOFT_REST_BLEND`.
- spike velocity damping.

### 7. Tracking Felt Worse Than Reference

Cause:

Local visual compensation was making the chain appear offset relative to the raw follower pose.

Fix:

Defaulted to:

```js
TRACKING_POSE_MODE: 'sourceRaw'
```

This keeps visual tracking close to the raw follower pose and avoids local compensation drift.

### 8. GLB Pendant Over-Swinging

Cause:

Shared pendant pendulum was tuned for flat PNG and could over-rotate 3D models.

Fix:

Added GLB-specific swing strength, max rotation, max offset, and damping.

## Important Functions

Core tracking:

```js
startTracking()
onReady(err, sceneObjects)
onTrack(state)
onBeforeRenderPose(state)
updateNecklaceMotionStabilizer(state, hookOrder)
```

Layout/assets:

```js
assetUrl(path)
layoutCanvases(aspect)
videoSettings()
```

Necklace:

```js
buildNeckModel()
buildStaticChain()
initializeSoftChain(points, freedom)
simulateChain(dt, stalledFrame)
rebuildChainGeometryFromNodes(nodes)
buildChainLinks(group)
buildNeckOccluder(group)
applyChainFade(mat, fadeFull, fadeGone)
```

Pendant:

```js
buildPendantObjects(group)
placePendantAtChainFront()
layoutPendant(aspect)
setProduct(item)
setPendantMode(mode)
setProductGLB(item, checksOk)
loadPendantGLB(url)
applyGLBPendantTransform(group, motionOffsetX, motionOffsetY, motionOffsetZ)
updatePendantPendulum(dt, pitch, roll, yaw, stalledFrame)
```

UI/debug:

```js
renderProducts()
setMetal(metal)
captureComposite()
setDebugDrawerOpen(isOpen)
setDebugAxesVisible(isVisible)
resetMotionPeaks()
```

## Migration Checklist

Copy the following into the clean repo:

```text
index.html
recreate-necklace.js
necklace-catalog.json
custom/*
assets/envmaps/venice_sunset_512.hdr
neuralNets/NN_NECKLACE_9.json
libs/three/v136/*
dist/WebARRocksFace.js
helpers/WebARRocksFaceThreeHelper.js
helpers/landmarksStabilizers/OneEuroLMStabilizer.js
```

Also ensure any modified helper behavior is preserved. This implementation uses `callbackBeforeRender` support in `WebARRocksFaceThreeHelper.js` so chain simulation and pendant swing update before render and avoid one-frame lag.

After migration:

1. Open `index.html` through a local server.
2. Check console dependency checks.
3. Start tracking.
4. Confirm camera prompt and `NN_NECKLACE_9.json` load.
5. Confirm chain follows neck.
6. Toggle PNG/3D.
7. Test both products.
8. Test capture.
9. Open debug drawer and verify `Tracking Mode = sourceRaw`.

## What Not To Change Casually

Avoid touching these unless you are deliberately retuning core behavior:

- `SOLVEPNP_OBJPOINTS`
- `ACTIVE_IMGPOINTS`
- `NN_NECKLACE_9.json` path
- `rotationContraints`
- `landmarksStabilizerSpec`
- `TRACKING_POSE_MODE: 'sourceRaw'`
- `CHAIN_Y_OFFSET`
- `FRONT_DROP_SCALE`
- base GLB transform values
- pendant attachment logic in `placePendantAtChainFront()`

For visual tuning, prefer:

- chain link size/count params
- material brightness params
- PNG pendant visual boost params
- GLB material params
- GLB swing caps

## Current Known Limits

- Depth occlusion is approximate; it is not true body segmentation.
- Hair/collars/shoulders can still break visual realism.
- Linked chain is procedural, not SKU-specific.
- GLB transform is manually calibrated and may need per-model overrides later.
- The same GLB transform params are currently global. If product-specific GLB transforms are needed, extend catalog fields and override per product.
- Temporary GLB keyboard controls are still in code. Remove or hide them before production if needed.

## Suggested Next Improvements

1. Add per-product GLB transform overrides in `necklace-catalog.json`.
2. Add a small development-only GLB transform panel instead of keyboard-only tuning.
3. Tune linked-chain params for a more delicate women's chain:

   ```js
   LINK_COUNT: 84,
   LINK_RADIUS: 1.8,
   LINK_TUBE_RADIUS: 0.22,
   LINK_SCALE_X: 1.55,
   LINK_SCALE_Y: 0.85
   ```

4. Add product-specific chain style/metal color if needed.
5. Improve occlusion with a better torso/neck occluder or segmentation when available.
6. Move debug code behind a `DEBUG_ENABLED` param for production.

## Quick Reference

Default modes:

```js
TRACKING_POSE_MODE: 'sourceRaw'
CHAIN_STYLE: 'links'
PENDANT_MODE: 'png'
```

Switch modes at runtime:

```js
RecreateNecklace.setPendantMode('png')
RecreateNecklace.setPendantMode('glb')
```

Inspect runtime state:

```js
RecreateNecklace.getState()
RecreateNecklace.getRefs()
```

Most important mental model:

```text
WebAR follower gives pose.
necklaceGroup follows that pose.
chain is generated/simulated in necklace local space.
pendantPivot attaches to the front chain node.
PNG plane or GLB wrapper is rendered under the same pendantPivot.
```
