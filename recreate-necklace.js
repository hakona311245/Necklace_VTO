// @ts-nocheck
/*
 * Recreate necklace shell.
 *
 * Phase 10 renders a static chain plus pendant with catalog controls,
 * metal switching, capture, depth occlusion, and yaw-aware chain fade.
 */
(function () {
  'use strict';

  const ASSET_BASE = (function () {
    const script = document.querySelector('script[src*="recreate-necklace.js"]');
    try {
      if (script) return new URL('.', script.src).href;
      return new URL('.', window.location.href).href;
    } catch (e) {
      return '';
    }
  })();

  const CATALOG_PATH = 'necklace-catalog.json';
  const DEFAULT_VIDEO_ASPECT = 16 / 9;
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const PARAMS = {
    TAA_LEVEL: 3,
    ENV_MAP_PATH: 'assets/envmaps/venice_sunset_512.hdr',
    RENDER_EXPOSURE: 1.12,
    HEMI_LIGHT_INTENSITY: 0.85,
    KEY_LIGHT_INTENSITY: 1.35,
    FILL_LIGHT_INTENSITY: 0.55,
    RIM_LIGHT_INTENSITY: 0.85,
    ROT_PITCH: 1.0,
    ROT_YAW: 0.7,
    ROT_ROLL: 1.0,
    // sourceRaw mirrors the reference demo: WebAR/solvePnP follower pose drives the necklace directly.
    // compensated keeps the old local Y/pitch correction for A/B debugging; hybrid applies it only on spikes.
    TRACKING_POSE_MODE: 'sourceRaw',
    HYBRID_SPIKE_Y: 10,
    HYBRID_STRENGTH: 0.35,
    // Runtime pose damping only. These do not change the static chain placement.
    POSE_SMOOTHING: 0.18,
    MAX_UPWARD_DELTA: 16,
    PITCH_RESPONSE_SCALE: 0.58,
    PITCH_SMOOTHING: 0.16,
    MOTION_STRENGTH: 0.82,
    MAX_PITCH_COMP: 0.2,
    // In this neck-local model positive Y lifts the chain, so negative compensation damps upward jumps.
    COMPENSATION_Y_SIGN: -1,
    // Very light correction for raw pose Y spikes that happen specifically during left/right yaw turns.
    YAW_Y_STABILIZER_ENABLED: true,
    YAW_Y_THRESHOLD: 3.0,
    YAW_Y_STRENGTH: 0.45,
    YAW_Y_MAX_COMP: 7.0,
    YAW_STEP_THRESHOLD: 0.008,
    YAW_Y_SMOOTHING: 0.22,
    YAW_Y_RELEASE: 0.12,
    DEBUG_MOTION_LOG: false,
    MOTION_LOG_INTERVAL: 0.35,
    PEAK_WINDOW_SEC: 2,
    SOFT_ENABLED: true,
    SOFT_NODES: 34,
    SOFT_TUBE_SEGMENTS: 150,
    SOFT_GRAVITY: 150,
    SOFT_STIFFNESS: 64,
    SOFT_NEIGHBOR: 60,
    SOFT_DAMPING: 0.76,
    SOFT_PIN_STRENGTH: 12,
    SOFT_MAX_DEV: 11,
    SOFT_MOTION_DEADZONE: 2.4,
    SOFT_FRONT_PIN: 0.3,
    // Tiny per-frame pull back to rest prevents soft-chain deformation from drifting upward over time.
    SOFT_REST_BLEND: 0.018,
    // Strong raw pose spikes should damp existing Verlet velocity instead of letting it accumulate.
    SOFT_SPIKE_Y_THRESHOLD: 8,
    SOFT_SPIKE_VELOCITY_DAMPING: 0.7,
    CHAIN_GAP: 1.0,
    // Geometry-only chain shaping. These keep the front point centered while making side arcs less inward.
    CHAIN_WIDTH_SCALE: 1.05,
    CHAIN_DEPTH_SCALE: 0.94,
    CHAIN_SIDE_INSET: 0.04,
    CHAIN_CURVE_TENSION: 0.4,
    SIDE_ARC_SMOOTHNESS: 0.82,
    // Geometry-only V shaping: keep the exact front point fixed, but taper/lift nearby shoulders.
    CHAIN_V_FRONT_START: 0.15,
    CHAIN_V_TAPER: 0.14,
    CHAIN_V_SHOULDER_LIFT: 5.0,
    CHAIN_V_POWER: 1.1,
    // Rear-only tuck: pulls the side/back arc closer to the neck without moving the accepted front point.
    REAR_ARC_START_COS: 0.22,
    REAR_WIDTH_SCALE: 0.72,
    REAR_DEPTH_SCALE: 0.96,
    CHAIN_THICK: 1.15,
    CHAIN_SEGMENTS: 320,
    CHAIN_RADIAL: 10,
    CHAIN_STYLE: 'links',
    LINK_COUNT: 92,
    LINK_RADIUS: 2.7,
    LINK_TUBE_RADIUS: 0.34,
    LINK_SCALE_X: 1.7,
    LINK_SCALE_Y: 1.0,
    LINK_RADIAL_SEGMENTS: 8,
    LINK_TUBULAR_SEGMENTS: 18,
    LINK_ALTERNATE_ROTATION: 1.5708,
    LINK_VISIBLE_FRONT_ONLY: false,
    LINK_BACK_FADE_ENABLED: true,
    LINK_BACK_FADE_START_COS: 0.2,
    LINK_BACK_FADE_END_COS: -0.75,
    LINK_BACK_MIN_ALPHA: 0.08,
    FRONT_DRAPE: 58,
    // Horizontal local offset for quick left/right visual calibration. Try small values like -3 or 3.
    CHAIN_X_OFFSET: 0,
    // Positive values lift the entire static chain loop in neck-local space.
    CHAIN_Y_OFFSET: 3.5,
    // Lower values reduce how far the front/bottom of the loop drops on the chest.
    FRONT_DROP_SCALE: 0.02,
    LOOP_SAMPLES: 170,
    SIDE_RAISE: 0.7,
    BACK_RAISE: 0.82,
    NECK_LIFT: 30,
    OCCLUDER_ENABLED: true,
    // Depth-only ellipsoid scale. It sits behind the front chain so it hides only the nape/back arc.
    OCCLUDER_RADIUS_X: 0.86,
    OCCLUDER_RADIUS_Z: 0.5,
    OCCLUDER_HEIGHT_SCALE: 2.4,
    OCCLUDER_BACK_PUSH: 0.32,
    OCCLUDER_Y_OFFSET: 0,
    FADE_ENABLED: true,
    // 0 = front depth, 1 = back/nape depth. The chain starts fading near the back.
    FADE_START_FRAC: 0.62,
    FADE_END_FRAC: 0.92,
    YAW_REST_ADAPT: 0.03,
    YAW_HIDE_SIGN: 1,
    // Pendant plane width in neck-local units. Height follows the PNG aspect ratio.
    PENDANT_WIDTH: 58,
    // Top edge / bail offset from the actual front/lowest chain point.
    // Keep near 0 so the PNG itself touches the rendered chain.
    PENDANT_DROP: -12,
    // Positive values lift the visible pendant art toward/over the chain when the PNG has top transparent padding.
    PENDANT_VISIBLE_TOP_INSET: 17,
    // Positive values push the pendant toward the camera to avoid z-fighting with the chain.
    PENDANT_FWD: 8,
    // Small forward lean so the flat PNG plane faces the camera more naturally.
    PENDANT_TILT: -0.12,
    // Experimental renderer switch. "png" is the stable textured-plane fallback; "glb" uses the same pendantPivot.
    PENDANT_MODE: 'png',
    // GLB orientation depends on the export tool. These align the model to our pendantPivot coordinate system.
    GLB_PENDANT_SCALE: 73.717,
    GLB_PENDANT_ROTATION_X: -8.552,
    GLB_PENDANT_ROTATION_Y: -1.571,
    GLB_PENDANT_ROTATION_Z: -2.182,
    GLB_PENDANT_OFFSET_X: 0,
    GLB_PENDANT_OFFSET_Y: -4,
    GLB_PENDANT_OFFSET_Z: 0,
    GLB_SWING_ENABLED: true,
    GLB_SWING_STRENGTH: 0.35,
    GLB_SWING_MAX_ROTATION: 0.16,
    GLB_SWING_MAX_OFFSET: 2.5,
    GLB_SWING_DAMPING: 10.0,
    PHYS_ENABLED: true,
    PHYS_STIFFNESS: 120,
    PHYS_DAMPING: 6.0,
    GRAVITY_ROLL: 0.85,
    GRAVITY_PITCH: 0.55,
    YAW_SHAKE_KICK: 0.6,
    SWING_MAX: 0.55,
    // Visual boost for cutout PNGs. This only affects the pendant image, not the camera or chain.
    PENDANT_BRIGHTNESS: 1.35,
    PENDANT_CONTRAST: 1.18,
    PENDANT_SATURATION: 1.03,
    PENDANT_LIFT: 0.015,
    // Removebg assets can be too transparent; alpha gain makes the pendant read more clearly.
    PENDANT_ALPHA_GAIN: 1.35,
    PENDANT_ALPHA_TEST: 0.04,
    CHAIN_COLOR: 0xf4f4f0,
    METAL_YELLOW: 0xf2cf7a,
    CHAIN_ROUGHNESS: 0.16,
    CHAIN_METALNESS: 1.0,
    CHAIN_ENV_INTENSITY: 1.75,
    CHAIN_EMISSIVE: 0x1b1b18,
    CHAIN_EMISSIVE_INTENSITY: 0.08,
    PENDANT_ENVINTENSITY: 0.3,
    GLB_ENV_INTENSITY: 2.2,
    GLB_BRIGHTNESS: 1.28,
    GLB_METALNESS: 0.9,
    GLB_ROUGHNESS: 0.2,
  };

  const NECK_RAW = {
    centerUp: [0.000006, -78.167770, 33.542694],
    centerDown: [0.000004, -112.370636, 44.173981],
    leftUp: [77.729225, -1.220459, -42.653336],
    leftDown: [130.661072, -11.937241, -44.706360],
    rightUp: [-77.898209, -1.191437, -42.648613],
    rightDown: [-130.661041, -11.937241, -44.706360],
    backUp: [-0.040026, -11.528961, -99.635696],
    backDown: [0.000007, -47.934677, -127.748184],
  };

  const SOLVEPNP_OBJPOINTS = {
    torsoNeckCenterUp: NECK_RAW.centerUp,
    torsoNeckCenterDown: NECK_RAW.centerDown,
    torsoNeckLeftUp: NECK_RAW.leftUp,
    torsoNeckLeftDown: NECK_RAW.leftDown,
    torsoNeckRightUp: NECK_RAW.rightUp,
    torsoNeckRightDown: NECK_RAW.rightDown,
    torsoNeckBackUp: NECK_RAW.backUp,
    torsoNeckBackDown: NECK_RAW.backDown,
  };

  const IMGPOINTS_6 = [
    'torsoNeckCenterUp',
    'torsoNeckLeftUp',
    'torsoNeckRightUp',
    'torsoNeckBackUp',
    'torsoNeckCenterDown',
    'torsoNeckBackDown',
  ];

  const NN_REGISTRY = {
    '9': {
      path: 'neuralNets/NN_NECKLACE_9.json',
      points: 6,
      filter: [8, 16],
      threshold: 0.7,
      label: 'NN_NECKLACE_9',
    },
  };

  const ACTIVE_NN_KEY = '9';
  const ACTIVE_IMGPOINTS = IMGPOINTS_6;

  const FALLBACK_PRODUCTS = [
    {
      id: 'dn-0075-1',
      name: 'DN-0075-1',
      image: 'custom/DN-0075-1-removebg.png',
      glb: 'custom/DN-0075-3D.glb',
      metal: 'white',
    },
    {
      id: 'dn-0105-1',
      name: 'DN-0105-1',
      image: 'custom/DN-0105-1_removebg.png',
      metal: 'white',
    },
  ];
  let PRODUCTS = FALLBACK_PRODUCTS.slice();

  const REFS = {
    helper: null,
    scene: null,
    renderer: null,
    follower: null,
    neck: null,
    necklaceGroup: null,
    chainMesh: null,
    chainMat: null,
    linkMesh: null,
    linkMat: null,
    linkGeometry: null,
    linkPoint: new THREE.Vector3(),
    linkTangent: new THREE.Vector3(),
    linkQuat: new THREE.Quaternion(),
    linkAltQuat: new THREE.Quaternion(),
    linkMatrix: new THREE.Matrix4(),
    linkScale: new THREE.Vector3(1, 1, 1),
    linkFadeAttr: null,
    chainShader: null,
    chainCurve: null,
    chainPoints: null,
    softRest: null,
    softCur: null,
    softPrev: null,
    softFreedom: null,
    softCurve: null,
    softDown: null,
    softMatCur: null,
    softMatInv: null,
    softMatPrev: null,
    softMatT: null,
    softProbe: null,
    softInit: false,
    occluderMesh: null,
    occluderMat: null,
    pendantPivot: null,
    pendantMesh: null,
    pendantMat: null,
    pendantShader: null,
    pendantPlaneHeight: 1,
    glbPendantGroup: null,
    glbPendantUrl: null,
    gltfLoader: null,
    textureLoader: null,
    hemiLight: null,
    keyLight: null,
    fillLight: null,
    rimLight: null,
    envMap: null,
    pmremGenerator: null,
    fadeMat: new THREE.Matrix4(),
    fadeQuat: new THREE.Quaternion(),
    fadePos: new THREE.Vector3(),
    fadeScale: new THREE.Vector3(),
    fadeFwd: new THREE.Vector3(),
    poseEuler: new THREE.Euler(),
    debugGroup: null,
    debugLight: null,
  };

  let _videoAspect = DEFAULT_VIDEO_ASPECT;
  let _resizeFrame = 0;

  const STATE = {
    layout: null,
    trackingStarted: false,
    trackingReady: false,
    trackingError: null,
    sourceSize: null,
    lastDetection: null,
    debugReady: false,
    chainReady: false,
    pendantReady: false,
    pendantError: null,
    pendantMode: PARAMS.PENDANT_MODE,
    catalogReady: false,
    catalogError: null,
    occlusionReady: false,
    yawFadeReady: false,
    yawRest: 0,
    yawPrev: 0,
    yawRestReady: false,
    yawLastT: 0,
    poseReady: false,
    poseSmoothY: 0,
    poseSmoothPitch: 0,
    posePrevPitch: 0,
    poseRestPitch: 0,
    posePrevYaw: null,
    posePrevLiveY: null,
    yawYOffset: 0,
    poseOffsetY: 0,
    posePitchComp: 0,
    poseLastT: 0,
    rendererReady: false,
    envMapReady: false,
    envMapError: null,
    product: PRODUCTS[0],
    productTextureUrl: null,
    productModelUrl: null,
    metal: 'white',
    captureError: null,
    debugDrawerOpen: false,
    mobileMenuCollapsed: false,
    showDebugAxes: false,
    lastLandmarks: null,
    pendantPhys: {
      init: false,
      yaw: 0,
      pitch: 0,
      roll: 0,
      sx: 0,
      vx: 0,
      sz: 0,
      vz: 0,
    },
    motionDebug: {
      detected: false,
      followerY: null,
      followerRotX: null,
      poseParentY: null,
      posePitch: null,
      yaw: null,
      yawStep: null,
      rawYDelta: null,
      yawYCompensation: null,
      groupY: null,
      compensationY: null,
      pitchCompensation: null,
      dt: null,
      hookOrder: '-',
      chainSim: 'none',
    },
    motionPeaks: {
      maxYJump: 0,
      maxPitchStep: 0,
      maxCompY: 0,
      maxGroupY: 0,
      last2sYJump: 0,
      last2sPitchStep: 0,
      last2sCompY: 0,
      samples: [],
    },
    motionLogLastT: 0,
    motionUpdatedBeforeTrack: false,
  };

  const CHECKS = [
    {
      key: 'three',
      label: 'THREE',
      test: function () {
        return typeof THREE !== 'undefined' && typeof THREE.Scene === 'function';
      },
    },
    {
      key: 'loaders',
      label: 'GLTFLoader and RGBELoader',
      test: function () {
        return (
          typeof THREE !== 'undefined' &&
          typeof THREE.GLTFLoader === 'function' &&
          typeof THREE.RGBELoader === 'function'
        );
      },
    },
    {
      key: 'postprocessing',
      label: 'EffectComposer and TAA passes',
      test: function () {
        return (
          typeof THREE !== 'undefined' &&
          typeof THREE.EffectComposer === 'function' &&
          typeof THREE.RenderPass === 'function' &&
          typeof THREE.ShaderPass === 'function' &&
          typeof THREE.SSAARenderPass === 'function' &&
          typeof THREE.TAARenderPass === 'function'
        );
      },
    },
    {
      key: 'webar',
      label: 'WEBARROCKSFACE',
      test: function () {
        return typeof WEBARROCKSFACE !== 'undefined';
      },
    },
    {
      key: 'helper',
      label: 'WebARRocksFaceThreeHelper',
      test: function () {
        return typeof WebARRocksFaceThreeHelper !== 'undefined';
      },
    },
    {
      key: 'stabilizer',
      label: 'WebARRocksLMStabilizer',
      test: function () {
        return typeof WebARRocksLMStabilizer !== 'undefined';
      },
    },
    {
      key: 'assetBase',
      label: 'ASSET_BASE',
      test: function () {
        return Boolean(ASSET_BASE);
      },
    },
    {
      key: 'layout',
      label: 'Canvas layout',
      test: function () {
        return validateCanvasLayout();
      },
    },
  ];

  function setStatus(text) {
    const status = document.getElementById('shellStatus');
    if (status) status.textContent = text;
  }

  function setCheckState(key, isOk) {
    const item = document.querySelector('[data-check="' + key + '"]');
    if (!item) return;

    item.classList.toggle('is-ok', isOk);
    item.classList.toggle('is-bad', !isOk);
  }

  function setStartButtonState(label, disabled) {
    const button = document.getElementById('startTracking');
    if (!button) return;

    button.textContent = label;
    button.disabled = disabled;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function formatDebugNumber(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits || 3) : '-';
  }

  function smoothstep01(value) {
    const x = THREE.MathUtils.clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function angleDelta(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  function resetMotionPeaks() {
    STATE.motionPeaks.maxYJump = 0;
    STATE.motionPeaks.maxPitchStep = 0;
    STATE.motionPeaks.maxCompY = 0;
    STATE.motionPeaks.maxGroupY = 0;
    STATE.motionPeaks.last2sYJump = 0;
    STATE.motionPeaks.last2sPitchStep = 0;
    STATE.motionPeaks.last2sCompY = 0;
    STATE.motionPeaks.samples = [];
    updateDebugStats();
  }

  function resetPendantPendulum(yaw, pitch, roll) {
    const phys = STATE.pendantPhys;
    phys.init = Boolean(Number.isFinite(yaw) && Number.isFinite(pitch) && Number.isFinite(roll));
    phys.yaw = phys.init ? yaw : 0;
    phys.pitch = phys.init ? pitch : 0;
    phys.roll = phys.init ? roll : 0;
    phys.sx = 0;
    phys.vx = 0;
    phys.sz = 0;
    phys.vz = 0;
    if (REFS.pendantPivot) {
      REFS.pendantPivot.rotation.set(PARAMS.PENDANT_TILT, 0, 0);
    }
    if (REFS.glbPendantGroup) {
      applyGLBPendantTransform(REFS.glbPendantGroup);
    }
  }

  function wrappedAngleDelta(next, prev) {
    let delta = next - prev;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function assetUrl(path) {
    try {
      return new URL(path, ASSET_BASE).href;
    } catch (e) {
      return ASSET_BASE + path;
    }
  }

  function normalizeCatalog(raw) {
    const items = Array.isArray(raw)
      ? raw
      : raw && Array.isArray(raw.items)
        ? raw.items
        : [];

    return items.map(function (item, index) {
      if (!item) return null;
      const image = item.image || item.texture || item.png || item.imageUrl;
      const modelUrl = item.glb || item.modelUrl || item.model || item.glbUrl;
      const name = item.name || item.label || item.id || 'Pendant ' + (index + 1);
      const id = item.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!image || !id) return null;

      const normalized = {
        id: id,
        name: name,
        image: image,
        metal: item.metal || 'white',
      };
      if (modelUrl) normalized.glb = modelUrl;
      return normalized;
    }).filter(Boolean);
  }

  function runDependencyChecks() {
    const results = CHECKS.map(function (check) {
      const ok = check.test();
      setCheckState(check.key, ok);
      console.log('[recreate-shell] ' + check.label + ':', ok ? 'ok' : 'missing');
      return ok;
    });

    const allOk = results.every(Boolean);
    updateStatus(allOk);

    return allOk;
  }

  function getCanvasPair() {
    return [
      document.getElementById('WebARRocksFaceCanvas'),
      document.getElementById('threeCanvas'),
    ];
  }

  function layoutCanvases(aspect) {
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_VIDEO_ASPECT;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const screenWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const screenHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const screenAspect = screenWidth / screenHeight;

    let cssWidth;
    let cssHeight;

    if (safeAspect > screenAspect) {
      cssWidth = screenWidth;
      cssHeight = Math.round(screenWidth / safeAspect);
    } else {
      cssHeight = screenHeight;
      cssWidth = Math.round(screenHeight * safeAspect);
    }

    const bufferWidth = Math.max(2, Math.round(cssWidth * dpr));
    const bufferHeight = Math.max(2, Math.round(cssHeight * dpr));

    getCanvasPair().forEach(function (canvas) {
      if (!canvas) return;
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = cssHeight + 'px';
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    });

    STATE.layout = {
      aspect: safeAspect,
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      bufferWidth: bufferWidth,
      bufferHeight: bufferHeight,
      dpr: dpr,
    };

    return STATE.layout;
  }

  function validateCanvasLayout() {
    const canvases = getCanvasPair();
    if (!STATE.layout || canvases.some(function (canvas) { return !canvas; })) return false;

    return canvases.every(function (canvas) {
      return (
        canvas.width === STATE.layout.bufferWidth &&
        canvas.height === STATE.layout.bufferHeight &&
        canvas.style.width === STATE.layout.cssWidth + 'px' &&
        canvas.style.height === STATE.layout.cssHeight + 'px'
      );
    });
  }

  function videoSettings() {
    return {
      facingMode: 'user',
      idealWidth: 1280,
      idealHeight: 720,
    };
  }

  function updateStatus(allChecksOk) {
    if (STATE.trackingError) {
      setStatus('Tracking failed: ' + STATE.trackingError);
      return;
    }

    if (!allChecksOk) {
      setStatus('Shell loaded, but one or more checks failed. Check the console.');
      return;
    }

    const layout = STATE.layout;
    if (!layout) {
      setStatus('Shell ready. Canvas layout has not run yet.');
      return;
    }

    if (STATE.trackingReady) {
      const source = STATE.sourceSize
        ? ' Source ' + STATE.sourceSize.width + 'x' + STATE.sourceSize.height + '.'
        : '';
      const debug = STATE.debugReady ? ' Debug follower object attached.' : '';
      const chain = STATE.chainReady ? ' Static chain attached.' : '';
      const occlusion = STATE.occlusionReady ? ' Depth occluder attached.' : '';
      const fade = STATE.yawFadeReady ? ' Yaw fade attached.' : '';
      const env = STATE.envMapReady
        ? ' HDR envmap loaded.'
        : STATE.envMapError
          ? ' HDR envmap fallback lights active.'
          : ' HDR envmap loading.';
      const pendant = STATE.pendantReady
        ? ' Pendant ' + STATE.product.name + ' attached.'
        : STATE.pendantError
          ? ' Pendant error: ' + STATE.pendantError
          : ' Pendant selected: ' + STATE.product.name + '.';
      const capture = STATE.captureError ? ' Capture error: ' + STATE.captureError : '';
      setStatus('Tracking ready. WebAR booted and neck follower exists.' + source + chain + occlusion + fade + pendant + env + debug + capture);
      return;
    }

    if (STATE.trackingStarted) {
      setStatus('Starting WebAR.Rocks: requesting camera and loading NN_NECKLACE_9...');
      return;
    }

    setStatus(
      'Canvas prepared. CSS ' +
        layout.cssWidth +
        'x' +
        layout.cssHeight +
        ', buffer ' +
        layout.bufferWidth +
        'x' +
        layout.bufferHeight +
        '. Product selected: ' +
        STATE.product.name +
        '. Press Start tracking to request camera.'
    );
  }

  function configureRenderer() {
    if (!REFS.renderer) return;

    REFS.renderer.outputEncoding = THREE.sRGBEncoding;
    REFS.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    REFS.renderer.toneMappingExposure = PARAMS.RENDER_EXPOSURE;
    STATE.rendererReady = true;
  }

  function ensureSceneLighting() {
    if (!REFS.scene || REFS.hemiLight) return;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x242432, PARAMS.HEMI_LIGHT_INTENSITY);
    hemi.name = 'Phase7HemisphereLight';
    REFS.scene.add(hemi);
    REFS.hemiLight = hemi;
    REFS.debugLight = hemi;

    const key = new THREE.PointLight(0xffffff, PARAMS.KEY_LIGHT_INTENSITY, 900, 2);
    key.name = 'Phase7KeyPointLight';
    key.position.set(85, 120, 180);
    REFS.scene.add(key);
    REFS.keyLight = key;

    const fill = new THREE.PointLight(0xdfe7ff, PARAMS.FILL_LIGHT_INTENSITY, 700, 2);
    fill.name = 'Phase7FillPointLight';
    fill.position.set(-160, 40, 120);
    REFS.scene.add(fill);
    REFS.fillLight = fill;

    const rim = new THREE.PointLight(0xffffff, PARAMS.RIM_LIGHT_INTENSITY, 520, 2);
    rim.name = 'Phase7ChainRimPointLight';
    rim.position.set(0, 145, 210);
    REFS.scene.add(rim);
    REFS.rimLight = rim;
  }

  function applyMaterialLightingTuning() {
    if (REFS.chainMat) {
      REFS.chainMat.color.setHex(STATE.metal === 'yellow' ? PARAMS.METAL_YELLOW : PARAMS.CHAIN_COLOR);
      REFS.chainMat.metalness = PARAMS.CHAIN_METALNESS;
      REFS.chainMat.roughness = PARAMS.CHAIN_ROUGHNESS;
      REFS.chainMat.envMapIntensity = PARAMS.CHAIN_ENV_INTENSITY;
      if (REFS.chainMat.emissive) {
        REFS.chainMat.emissive.setHex(PARAMS.CHAIN_EMISSIVE);
        REFS.chainMat.emissiveIntensity = PARAMS.CHAIN_EMISSIVE_INTENSITY;
      }
      REFS.chainMat.needsUpdate = true;
    }

    if (REFS.linkMat) {
      REFS.linkMat.color.setHex(STATE.metal === 'yellow' ? PARAMS.METAL_YELLOW : PARAMS.CHAIN_COLOR);
      REFS.linkMat.metalness = PARAMS.CHAIN_METALNESS;
      REFS.linkMat.roughness = PARAMS.CHAIN_ROUGHNESS;
      REFS.linkMat.envMapIntensity = PARAMS.CHAIN_ENV_INTENSITY;
      if (REFS.linkMat.emissive) {
        REFS.linkMat.emissive.setHex(PARAMS.CHAIN_EMISSIVE);
        REFS.linkMat.emissiveIntensity = PARAMS.CHAIN_EMISSIVE_INTENSITY;
      }
      REFS.linkMat.needsUpdate = true;
    }

    if (REFS.pendantMat && 'envMapIntensity' in REFS.pendantMat) {
      REFS.pendantMat.envMapIntensity = PARAMS.PENDANT_ENVINTENSITY;
      REFS.pendantMat.needsUpdate = true;
    }

    if (REFS.glbPendantGroup) {
      tuneGLBPendantMaterials(REFS.glbPendantGroup);
    }

    if (REFS.rimLight) {
      REFS.rimLight.intensity = PARAMS.RIM_LIGHT_INTENSITY;
    }
  }

  function createChainMetalMaterial() {
    return new THREE.MeshStandardMaterial({
      color: STATE.metal === 'yellow' ? PARAMS.METAL_YELLOW : PARAMS.CHAIN_COLOR,
      metalness: PARAMS.CHAIN_METALNESS,
      roughness: PARAMS.CHAIN_ROUGHNESS,
      envMapIntensity: PARAMS.CHAIN_ENV_INTENSITY,
      emissive: PARAMS.CHAIN_EMISSIVE,
      emissiveIntensity: PARAMS.CHAIN_EMISSIVE_INTENSITY,
    });
  }

  function loadEnvironmentMap() {
    if (!REFS.scene || !REFS.renderer || REFS.envMap || typeof THREE.RGBELoader !== 'function') {
      return;
    }

    STATE.envMapReady = false;
    STATE.envMapError = null;

    try {
      const pmrem = new THREE.PMREMGenerator(REFS.renderer);
      pmrem.compileEquirectangularShader();
      REFS.pmremGenerator = pmrem;

      new THREE.RGBELoader()
        .setDataType(THREE.HalfFloatType)
        .load(
          assetUrl(PARAMS.ENV_MAP_PATH),
          function (texture) {
            const envMap = pmrem.fromEquirectangular(texture).texture;
            texture.dispose();
            pmrem.dispose();

            REFS.envMap = envMap;
            REFS.pmremGenerator = null;
            REFS.scene.environment = envMap;
            STATE.envMapReady = true;
            STATE.envMapError = null;
            applyMaterialLightingTuning();
            updateStatus(true);
            console.log('[recreate-shell] HDR envmap loaded:', PARAMS.ENV_MAP_PATH);
          },
          undefined,
          function (err) {
            pmrem.dispose();
            REFS.pmremGenerator = null;
            STATE.envMapReady = false;
            STATE.envMapError = 'failed to load ' + PARAMS.ENV_MAP_PATH;
            applyMaterialLightingTuning();
            updateStatus(true);
            console.warn('[recreate-shell] HDR envmap load failed; using fallback lights:', err);
          }
        );
    } catch (e) {
      if (REFS.pmremGenerator) {
        REFS.pmremGenerator.dispose();
        REFS.pmremGenerator = null;
      }
      STATE.envMapReady = false;
      STATE.envMapError = String(e && e.message ? e.message : e);
      applyMaterialLightingTuning();
      updateStatus(true);
      console.warn('[recreate-shell] HDR envmap setup failed; using fallback lights:', e);
    }
  }

  function buildNeckModel() {
    const usedLabels = ACTIVE_IMGPOINTS;
    const mean = [0, 0, 0];

    usedLabels.forEach(function (label) {
      const point = SOLVEPNP_OBJPOINTS[label];
      mean[0] += point[0];
      mean[1] += point[1];
      mean[2] += point[2];
    });

    mean[0] /= usedLabels.length;
    mean[1] /= usedLabels.length;
    mean[2] /= usedLabels.length;

    function center(raw) {
      return {
        x: raw[0] - mean[0],
        y: raw[1] - mean[1],
        z: raw[2] - mean[2],
      };
    }

    const left = center(NECK_RAW.leftUp);
    const right = center(NECK_RAW.rightUp);
    const frontUp = center(NECK_RAW.centerUp);
    const frontDown = center(NECK_RAW.centerDown);
    const back = center(NECK_RAW.backUp);

    const radiusX = Math.abs(left.x - right.x) / 2 * PARAMS.CHAIN_GAP;
    const centerX = (left.x + right.x) / 2;
    const radiusZ = Math.abs(frontUp.z - back.z) / 2 * PARAMS.CHAIN_GAP;
    const centerZ = (frontUp.z + back.z) / 2;
    const chainLift = PARAMS.NECK_LIFT + PARAMS.CHAIN_Y_OFFSET;
    const frontDrop = PARAMS.FRONT_DRAPE * PARAMS.FRONT_DROP_SCALE;
    const yFront = (frontUp.y + frontDown.y) / 2 - frontDrop + chainLift;
    const ySideRaw = (left.y + right.y) / 2;
    const ySide = yFront + (ySideRaw + chainLift - yFront) * PARAMS.SIDE_RAISE;
    const yBack = yFront + (back.y + chainLift - yFront) * PARAMS.BACK_RAISE;
    const yb = (yFront - yBack) / 2;
    const yd = (yFront + yBack) / 2 - ySide;

    return {
      centerX: centerX,
      centerY: (yFront + Math.max(ySide, yBack)) / 2,
      centerZ: centerZ,
      radiusX: radiusX,
      radiusZ: radiusZ,
      yFront: yFront,
      ySide: ySide,
      yBack: yBack,
      yOf: function (cosT) {
        return ySide + yb * cosT + yd * cosT * cosT;
      },
    };
  }

  function disposeStaticChain() {
    if (REFS.necklaceGroup && REFS.necklaceGroup.parent) {
      REFS.necklaceGroup.parent.remove(REFS.necklaceGroup);
    }
    disposePendantObjects();
    if (REFS.occluderMesh) {
      if (REFS.occluderMesh.geometry) REFS.occluderMesh.geometry.dispose();
      REFS.occluderMesh = null;
    }
    if (REFS.occluderMat) {
      REFS.occluderMat.dispose();
      REFS.occluderMat = null;
    }
    if (REFS.chainMesh) {
      if (REFS.chainMesh.geometry) REFS.chainMesh.geometry.dispose();
      REFS.chainMesh = null;
    }
    if (REFS.linkMesh) {
      if (REFS.linkMesh.parent) REFS.linkMesh.parent.remove(REFS.linkMesh);
      REFS.linkMesh = null;
    }
    if (REFS.linkGeometry) {
      REFS.linkGeometry.dispose();
      REFS.linkGeometry = null;
    }
    REFS.linkFadeAttr = null;
    if (REFS.linkMat) {
      REFS.linkMat.dispose();
      REFS.linkMat = null;
    }
    if (REFS.chainMat) {
      REFS.chainMat.dispose();
      REFS.chainMat = null;
    }
    REFS.chainShader = null;
    REFS.necklaceGroup = null;
    REFS.chainCurve = null;
    REFS.chainPoints = null;
    REFS.softRest = null;
    REFS.softCur = null;
    REFS.softPrev = null;
    REFS.softFreedom = null;
    REFS.softCurve = null;
    REFS.softDown = null;
    REFS.softMatCur = null;
    REFS.softMatInv = null;
    REFS.softMatPrev = null;
    REFS.softMatT = null;
    REFS.softProbe = null;
    REFS.softInit = false;
    STATE.occlusionReady = false;
    STATE.yawFadeReady = false;
    STATE.yawRestReady = false;
    STATE.yawLastT = 0;
    STATE.poseReady = false;
    STATE.poseOffsetY = 0;
    STATE.posePitchComp = 0;
    STATE.poseLastT = 0;
    resetMotionPeaks();
    STATE.chainReady = false;
  }

  function disposePendantObjects() {
    if (REFS.pendantMesh && REFS.pendantMesh.geometry) {
      REFS.pendantMesh.geometry.dispose();
    }
    if (REFS.pendantMat) {
      if (REFS.pendantMat.map) REFS.pendantMat.map.dispose();
      REFS.pendantMat.dispose();
    }
    disposeGLBPendantGroup();

    REFS.pendantPivot = null;
    REFS.pendantMesh = null;
    REFS.pendantMat = null;
    REFS.pendantShader = null;
    REFS.pendantPlaneHeight = 1;
    STATE.pendantReady = false;
    STATE.pendantError = null;
    STATE.productTextureUrl = null;
    STATE.productModelUrl = null;
  }

  function getTextureLoader() {
    if (
      !REFS.textureLoader &&
      typeof THREE !== 'undefined' &&
      typeof THREE.TextureLoader === 'function'
    ) {
      REFS.textureLoader = new THREE.TextureLoader();
    }

    return REFS.textureLoader;
  }

  function getGLTFLoader() {
    if (
      !REFS.gltfLoader &&
      typeof THREE !== 'undefined' &&
      typeof THREE.GLTFLoader === 'function'
    ) {
      REFS.gltfLoader = new THREE.GLTFLoader();
    }

    return REFS.gltfLoader;
  }

  function highlightProduct(id) {
    document.querySelectorAll('.product-button').forEach(function (button) {
      const active = button.getAttribute('data-product-id') === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function highlightMetal(metal) {
    document.querySelectorAll('[data-metal]').forEach(function (button) {
      const active = button.getAttribute('data-metal') === metal;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function highlightPendantMode(mode) {
    const currentMode = mode === 'glb' ? 'glb' : 'png';
    document.querySelectorAll('[data-pendant-mode]').forEach(function (button) {
      const active = button.getAttribute('data-pendant-mode') === currentMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function updateInfo(item) {
    const current = item || STATE.product || PRODUCTS[0];
    setText('productInfoName', current ? current.name : '-');
    setText('productInfoMeta', 'Metal: ' + (STATE.metal || 'white') + ' / Mode: ' + (STATE.pendantMode || 'png').toUpperCase());
  }

  function renderProducts() {
    const strip = document.getElementById('productStrip');
    if (!strip) return;

    strip.innerHTML = '';
    PRODUCTS.forEach(function (item) {
      const button = document.createElement('button');
      button.className = 'product-button';
      button.type = 'button';
      button.setAttribute('data-product-id', item.id);
      button.setAttribute('aria-pressed', 'false');
      button.title = item.name;

      const img = document.createElement('img');
      img.src = assetUrl(item.image);
      img.alt = '';

      const label = document.createElement('span');
      label.textContent = item.name;

      button.appendChild(img);
      button.appendChild(label);
      button.addEventListener('click', function () {
        setProduct(item);
      });
      strip.appendChild(button);
    });

    highlightProduct(STATE.product.id);
    updateInfo(STATE.product);
  }

  function renderCatalog(items) {
    if (Array.isArray(items) && items.length) PRODUCTS = normalizeCatalog(items);
    renderProducts();
  }

  function highlightThumb(id) {
    highlightProduct(id);
  }

  function loadCatalog() {
    return fetch(assetUrl(CATALOG_PATH), { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' while loading ' + CATALOG_PATH);
        }
        return response.json();
      })
      .then(function (raw) {
        const items = normalizeCatalog(raw);
        if (!items.length) {
          throw new Error(CATALOG_PATH + ' did not contain any valid pendant items.');
        }

        PRODUCTS = items;
        STATE.catalogReady = true;
        STATE.catalogError = null;

        const currentId = STATE.product && STATE.product.id;
        const selected = PRODUCTS.find(function (item) { return item.id === currentId; }) || PRODUCTS[0];
        STATE.product = selected;
        renderProducts();
        setProduct(selected);
        console.log('[recreate-shell] catalog loaded:', PRODUCTS);
        return PRODUCTS;
      })
      .catch(function (err) {
        STATE.catalogReady = false;
        STATE.catalogError = String(err && err.message ? err.message : err);
        PRODUCTS = FALLBACK_PRODUCTS.slice();
        STATE.product = PRODUCTS[0];
        renderProducts();
        setProduct(STATE.product);
        console.warn('[recreate-shell] catalog load failed; using fallback products:', err);
        return PRODUCTS;
      });
  }

  function setMetal(metal) {
    const nextMetal = metal === 'yellow' ? 'yellow' : 'white';
    STATE.metal = nextMetal;
    highlightMetal(nextMetal);
    updateInfo(STATE.product);
    const color = nextMetal === 'yellow' ? PARAMS.METAL_YELLOW : PARAMS.CHAIN_COLOR;
    if (REFS.chainMat) {
      REFS.chainMat.color.setHex(color);
      REFS.chainMat.needsUpdate = true;
    }
    if (REFS.linkMat) {
      REFS.linkMat.color.setHex(color);
      REFS.linkMat.needsUpdate = true;
    }
  }

  function applyChainFade(mat, fadeFull, fadeGone) {
    if (!PARAMS.FADE_ENABLED || !mat) {
      STATE.yawFadeReady = false;
      return;
    }

    mat.transparent = true;
    mat.depthWrite = true;
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uYaw = { value: 0 };
      shader.uniforms.uFade = { value: new THREE.Vector2(fadeFull, fadeGone) };
      REFS.chainShader = shader;

      shader.vertexShader = 'varying float vChainX;\nvarying float vChainZ;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vChainX = position.x;\n  vChainZ = position.z;'
      );
      shader.fragmentShader =
        'uniform float uYaw;\nuniform vec2 uFade;\nvarying float vChainX;\nvarying float vChainZ;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n' +
            '  float facingDepth = vChainZ * cos(uYaw) - vChainX * sin(uYaw);\n' +
            '  gl_FragColor.a *= smoothstep(uFade.y, uFade.x, facingDepth);'
        );
    };
    mat.needsUpdate = true;
    STATE.yawFadeReady = true;
  }

  function placePendantAtChainFront() {
    const frontPoint = REFS.chainPoints && REFS.chainPoints[0];
    if (!frontPoint || !REFS.pendantPivot || !REFS.pendantMesh) return;

    // The pendant pivot is the top edge of the PNG plane, not its center.
    // The plane then hangs below the chain point by half its measured height.
    REFS.pendantPivot.position.set(
      frontPoint.x,
      frontPoint.y + PARAMS.PENDANT_DROP,
      frontPoint.z + PARAMS.PENDANT_FWD
    );
    if (!PARAMS.PHYS_ENABLED) {
      REFS.pendantPivot.rotation.set(PARAMS.PENDANT_TILT, 0, 0);
    }
    REFS.pendantMesh.position.set(0, -REFS.pendantPlaneHeight / 2 + PARAMS.PENDANT_VISIBLE_TOP_INSET, 0);
    REFS.pendantMesh.rotation.set(0, 0, 0);

  }

  function layoutPendant(aspect) {
    if (!REFS.pendantMesh) return;

    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const width = PARAMS.PENDANT_WIDTH;
    const height = width / safeAspect;
    REFS.pendantPlaneHeight = height;

    if (REFS.pendantMesh.geometry) REFS.pendantMesh.geometry.dispose();
    REFS.pendantMesh.geometry = new THREE.PlaneGeometry(width, height);
    REFS.pendantMesh.frustumCulled = false;

    placePendantAtChainFront();
  }

  function setPendantRendererVisibility() {
    const useGLB = STATE.pendantMode === 'glb' && Boolean(REFS.glbPendantGroup);
    if (REFS.pendantMesh) REFS.pendantMesh.visible = !useGLB;
    if (REFS.glbPendantGroup) REFS.glbPendantGroup.visible = useGLB;
  }

  function applyGLBPendantTransform(group, motionOffsetX, motionOffsetY, motionOffsetZ) {
    if (!group) return;

    // GLB local axes and pivot vary by exporter; calibrate the wrapper, not pendantPivot/tracking.
    const maxMotionOffset = Math.max(0, PARAMS.GLB_SWING_MAX_OFFSET);
    const mx = THREE.MathUtils.clamp(motionOffsetX || 0, -maxMotionOffset, maxMotionOffset);
    const my = THREE.MathUtils.clamp(motionOffsetY || 0, -maxMotionOffset, maxMotionOffset);
    const mz = THREE.MathUtils.clamp(motionOffsetZ || 0, -maxMotionOffset, maxMotionOffset);
    group.scale.setScalar(PARAMS.GLB_PENDANT_SCALE);
    group.rotation.set(
      PARAMS.GLB_PENDANT_ROTATION_X,
      PARAMS.GLB_PENDANT_ROTATION_Y,
      PARAMS.GLB_PENDANT_ROTATION_Z
    );
    group.position.set(
      PARAMS.GLB_PENDANT_OFFSET_X + mx,
      PARAMS.GLB_PENDANT_OFFSET_Y + my,
      PARAMS.GLB_PENDANT_OFFSET_Z + mz
    );
    group.traverse(function (node) {
      if (node.isMesh) {
        node.frustumCulled = false;
        node.renderOrder = 11;
      }
    });
  }

  function tuneGLBPendantMaterials(root) {
    if (!root) return;

    const white = new THREE.Color(0xffffff);
    const brighten = THREE.MathUtils.clamp(PARAMS.GLB_BRIGHTNESS - 1, 0, 0.45);
    root.traverse(function (node) {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(function (mat) {
        if (!mat) return;
        if (mat.color) {
          if (!mat.userData.glbBaseColor) mat.userData.glbBaseColor = mat.color.clone();
          mat.color.copy(mat.userData.glbBaseColor).lerp(white, brighten);
        }
        if ('metalness' in mat) mat.metalness = PARAMS.GLB_METALNESS;
        if ('roughness' in mat) mat.roughness = PARAMS.GLB_ROUGHNESS;
        if ('envMapIntensity' in mat) mat.envMapIntensity = PARAMS.GLB_ENV_INTENSITY;
        mat.needsUpdate = true;
      });
    });
  }

  function logGLBPendantTransform() {
    console.log('[recreate-shell] GLB pendant transform', {
      GLB_PENDANT_SCALE: Number(PARAMS.GLB_PENDANT_SCALE.toFixed(3)),
      GLB_PENDANT_ROTATION_X: Number(PARAMS.GLB_PENDANT_ROTATION_X.toFixed(3)),
      GLB_PENDANT_ROTATION_Y: Number(PARAMS.GLB_PENDANT_ROTATION_Y.toFixed(3)),
      GLB_PENDANT_ROTATION_Z: Number(PARAMS.GLB_PENDANT_ROTATION_Z.toFixed(3)),
      GLB_PENDANT_OFFSET_X: Number(PARAMS.GLB_PENDANT_OFFSET_X.toFixed(2)),
      GLB_PENDANT_OFFSET_Y: Number(PARAMS.GLB_PENDANT_OFFSET_Y.toFixed(2)),
      GLB_PENDANT_OFFSET_Z: Number(PARAMS.GLB_PENDANT_OFFSET_Z.toFixed(2)),
    });
  }

  function handleGLBTransformDebugKey(event) {
    if (STATE.pendantMode !== 'glb' || !REFS.glbPendantGroup) return;

    const rotStep = THREE.MathUtils.degToRad(5);
    const offsetStep = event.shiftKey ? 6 : 2;
    let handled = true;

    switch (event.key) {
      case 'q':
      case 'Q':
        PARAMS.GLB_PENDANT_ROTATION_X -= rotStep;
        break;
      case 'e':
      case 'E':
        PARAMS.GLB_PENDANT_ROTATION_X += rotStep;
        break;
      case 'a':
      case 'A':
        PARAMS.GLB_PENDANT_ROTATION_Y -= rotStep;
        break;
      case 'd':
      case 'D':
        PARAMS.GLB_PENDANT_ROTATION_Y += rotStep;
        break;
      case 'z':
      case 'Z':
        PARAMS.GLB_PENDANT_ROTATION_Z -= rotStep;
        break;
      case 'c':
      case 'C':
        PARAMS.GLB_PENDANT_ROTATION_Z += rotStep;
        break;
      case '+':
      case '=':
        PARAMS.GLB_PENDANT_SCALE *= 1.05;
        break;
      case '-':
      case '_':
        PARAMS.GLB_PENDANT_SCALE /= 1.05;
        break;
      case 'ArrowLeft':
        PARAMS.GLB_PENDANT_OFFSET_X -= offsetStep;
        break;
      case 'ArrowRight':
        PARAMS.GLB_PENDANT_OFFSET_X += offsetStep;
        break;
      case 'ArrowUp':
        PARAMS.GLB_PENDANT_OFFSET_Y += offsetStep;
        break;
      case 'ArrowDown':
        PARAMS.GLB_PENDANT_OFFSET_Y -= offsetStep;
        break;
      default:
        handled = false;
        break;
    }

    if (!handled) return;
    event.preventDefault();
    applyGLBPendantTransform(REFS.glbPendantGroup);
    logGLBPendantTransform();
  }

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse(function (node) {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach(function (mat) { if (mat && mat.dispose) mat.dispose(); });
        } else if (node.material.dispose) {
          node.material.dispose();
        }
      }
    });
  }

  function disposeGLBPendantGroup() {
    if (!REFS.glbPendantGroup) return;
    if (REFS.glbPendantGroup.parent) {
      REFS.glbPendantGroup.parent.remove(REFS.glbPendantGroup);
    }
    disposeObject3D(REFS.glbPendantGroup);
    REFS.glbPendantGroup = null;
    REFS.glbPendantUrl = null;
  }

  function loadPendantGLB(url) {
    return new Promise(function (resolve, reject) {
      const loader = getGLTFLoader();
      if (!loader) {
        reject(new Error('THREE.GLTFLoader unavailable'));
        return;
      }

      loader.load(
        url,
        function (gltf) {
          resolve(gltf.scene || (gltf.scenes && gltf.scenes[0]));
        },
        undefined,
        reject
      );
    });
  }

  function setPendantMode(mode) {
    const nextMode = mode === 'glb' ? 'glb' : 'png';
    STATE.pendantMode = nextMode;
    PARAMS.PENDANT_MODE = nextMode;
    highlightPendantMode(nextMode);
    updateInfo(STATE.product);
    setPendantRendererVisibility();
    if (STATE.product) {
      setProduct(STATE.product);
    } else {
      updateDebugStats();
      updateStatus(CHECKS.every(function (check) { return check.test(); }));
    }
  }

  function setProductGLB(item, checksOk) {
    const modelPath = item && (item.glb || item.modelUrl);
    if (!modelPath) {
      // Experimental GLB mode is per-product. Products without a model stay on the stable PNG renderer.
      STATE.pendantMode = 'png';
      PARAMS.PENDANT_MODE = 'png';
      highlightPendantMode('png');
      updateInfo(item);
      setPendantRendererVisibility();
      return false;
    }

    const url = assetUrl(modelPath);
    STATE.productModelUrl = url;
    STATE.productTextureUrl = null;
    REFS.pendantPivot.visible = false;
    if (REFS.pendantMesh) REFS.pendantMesh.visible = false;
    if (REFS.glbPendantGroup) REFS.glbPendantGroup.visible = false;

    loadPendantGLB(url)
      .then(function (group) {
        if (!group) throw new Error('GLB scene is empty');
        if (!STATE.product || STATE.product.id !== item.id || STATE.productModelUrl !== url) {
          disposeObject3D(group);
          return;
        }

        disposeGLBPendantGroup();
        const wrapper = new THREE.Object3D();
        wrapper.name = 'ExperimentalGLBPendantGroup';
        group.name = 'ExperimentalGLBPendantScene';
        wrapper.add(group);
        tuneGLBPendantMaterials(wrapper);
        applyGLBPendantTransform(wrapper);
        REFS.glbPendantGroup = wrapper;
        REFS.glbPendantUrl = url;
        REFS.pendantPivot.add(wrapper);
        STATE.pendantMode = 'glb';
        PARAMS.PENDANT_MODE = 'glb';
        highlightPendantMode('glb');
        updateInfo(item);
        setPendantRendererVisibility();
        REFS.pendantPivot.visible = true;
        STATE.pendantReady = true;
        STATE.pendantError = null;
        resetPendantPendulum();
        updateDebugStats();
        updateStatus(true);
      })
      .catch(function (err) {
        if (!STATE.product || STATE.product.id !== item.id || STATE.productModelUrl !== url) return;
        STATE.pendantError = 'failed to load ' + modelPath;
        console.error('[recreate-shell] pendant GLB load failed; falling back to PNG:', err);
        STATE.pendantMode = 'png';
        PARAMS.PENDANT_MODE = 'png';
        highlightPendantMode('png');
        updateInfo(item);
        setProduct(item);
      });

    updateStatus(checksOk);
    return true;
  }

  function initializeSoftChain(points, freedom) {
    if (!PARAMS.SOFT_ENABLED || !points || !points.length) {
      REFS.softRest = null;
      REFS.softCur = null;
      REFS.softPrev = null;
      REFS.softFreedom = null;
      REFS.softCurve = null;
      REFS.softInit = false;
      return;
    }

    REFS.softRest = points.map(function (point) { return point.clone(); });
    REFS.softCur = points.map(function (point) { return point.clone(); });
    REFS.softPrev = points.map(function (point) { return point.clone(); });
    REFS.softFreedom = freedom.slice();
    REFS.softCurve = new THREE.CatmullRomCurve3(
      REFS.softCur,
      true,
      'catmullrom',
      PARAMS.CHAIN_CURVE_TENSION
    );
    REFS.softDown = new THREE.Vector3();
    REFS.softMatCur = new THREE.Matrix4();
    REFS.softMatInv = new THREE.Matrix4();
    REFS.softMatPrev = new THREE.Matrix4();
    REFS.softMatT = new THREE.Matrix4();
    REFS.softProbe = new THREE.Vector3();
    REFS.softInit = false;
  }

  function rebuildChainGeometryFromNodes(nodes) {
    if (!REFS.chainMesh || !nodes || !nodes.length) return;

    REFS.chainPoints = nodes;
    REFS.chainCurve = REFS.softCurve || new THREE.CatmullRomCurve3(
      nodes,
      true,
      'catmullrom',
      PARAMS.CHAIN_CURVE_TENSION
    );
    if (typeof REFS.chainCurve.updateArcLengths === 'function') {
      REFS.chainCurve.updateArcLengths();
    }

    const nextGeometry = new THREE.TubeGeometry(
      REFS.chainCurve,
      PARAMS.SOFT_ENABLED ? PARAMS.SOFT_TUBE_SEGMENTS : PARAMS.CHAIN_SEGMENTS,
      PARAMS.CHAIN_THICK,
      PARAMS.CHAIN_RADIAL,
      true
    );
    const oldGeometry = REFS.chainMesh.geometry;
    REFS.chainMesh.geometry = nextGeometry;
    REFS.chainMesh.visible = PARAMS.CHAIN_STYLE !== 'links' || !REFS.linkMesh;
    if (oldGeometry) oldGeometry.dispose();

    updateChainLinkInstances();
    placePendantAtChainFront();
  }

  function updateChainLinkInstances() {
    if (!REFS.linkMesh || !REFS.chainCurve) return;

    const count = REFS.linkMesh.count;
    const frontOnly = PARAMS.LINK_VISIBLE_FRONT_ONLY;
    const denom = Math.max(1, count - 1);
    const fadeStart = PARAMS.LINK_BACK_FADE_START_COS;
    const fadeEnd = PARAMS.LINK_BACK_FADE_END_COS;
    const fadeSpan = Math.max(0.0001, fadeStart - fadeEnd);
    const minAlpha = THREE.MathUtils.clamp(PARAMS.LINK_BACK_MIN_ALPHA, 0, 1);
    for (let i = 0; i < count; i++) {
      let u = i / count;
      if (frontOnly) {
        u = 0.75 + (i / denom) * 0.5;
        if (u >= 1) u -= 1;
      }

      // The curve starts at the pendant/front point. cosT near -1 is the rear/nape arc.
      const cosT = Math.cos(u * Math.PI * 2);
      const rearFade = PARAMS.LINK_BACK_FADE_ENABLED
        ? smoothstep01((fadeStart - cosT) / fadeSpan)
        : 0;
      const linkAlpha = THREE.MathUtils.lerp(1, minAlpha, rearFade);

      REFS.chainCurve.getPointAt(u, REFS.linkPoint);
      REFS.chainCurve.getTangentAt(u, REFS.linkTangent).normalize();
      REFS.linkQuat.setFromUnitVectors(AXIS_X, REFS.linkTangent);
      if (PARAMS.LINK_ALTERNATE_ROTATION && i % 2 === 1) {
        REFS.linkAltQuat.setFromAxisAngle(REFS.linkTangent, PARAMS.LINK_ALTERNATE_ROTATION);
        REFS.linkQuat.multiply(REFS.linkAltQuat);
      }
      REFS.linkMatrix.compose(REFS.linkPoint, REFS.linkQuat, REFS.linkScale);
      REFS.linkMesh.setMatrixAt(i, REFS.linkMatrix);
      if (REFS.linkFadeAttr) {
        REFS.linkFadeAttr.setX(i, linkAlpha);
      }
    }
    REFS.linkMesh.instanceMatrix.needsUpdate = true;
    if (REFS.linkFadeAttr) {
      REFS.linkFadeAttr.needsUpdate = true;
    }
  }

  function applyLinkBackFade(mat) {
    if (!PARAMS.LINK_BACK_FADE_ENABLED || !mat) return;

    mat.transparent = true;
    mat.depthWrite = true;
    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = 'attribute float aLinkFade;\nvarying float vLinkFade;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vLinkFade = aLinkFade;'
      );
      shader.fragmentShader = 'varying float vLinkFade;\n' + shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  gl_FragColor.a *= vLinkFade;'
      );
    };
    mat.needsUpdate = true;
  }

  function buildChainLinks(group) {
    if (PARAMS.CHAIN_STYLE !== 'links' || !REFS.chainCurve) return;

    try {
      const count = Math.max(4, Math.floor(PARAMS.LINK_COUNT));
      REFS.linkGeometry = new THREE.TorusGeometry(
        PARAMS.LINK_RADIUS,
        PARAMS.LINK_TUBE_RADIUS,
        PARAMS.LINK_RADIAL_SEGMENTS,
        PARAMS.LINK_TUBULAR_SEGMENTS
      );
      REFS.linkGeometry.scale(PARAMS.LINK_SCALE_X, PARAMS.LINK_SCALE_Y, 1);
      REFS.linkFadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
      REFS.linkGeometry.setAttribute('aLinkFade', REFS.linkFadeAttr);
      REFS.linkMat = createChainMetalMaterial();
      applyLinkBackFade(REFS.linkMat);
      REFS.linkMesh = new THREE.InstancedMesh(REFS.linkGeometry, REFS.linkMat, count);
      REFS.linkMesh.name = 'Phase12LinkedChain';
      REFS.linkMesh.renderOrder = 10;
      REFS.linkMesh.frustumCulled = false;
      group.add(REFS.linkMesh);
      if (REFS.chainMesh) REFS.chainMesh.visible = false;
      updateChainLinkInstances();
    } catch (e) {
      if (REFS.chainMesh) REFS.chainMesh.visible = true;
      console.warn('[recreate-shell] linked chain build failed; falling back to tube:', e);
    }
  }

  function resetSoftChainVelocity() {
    if (!REFS.softCur || !REFS.softPrev) return;
    STATE.yawYOffset = 0;
    STATE.posePrevYaw = null;
    STATE.posePrevLiveY = null;
    for (let i = 0; i < REFS.softCur.length; i++) {
      REFS.softPrev[i].copy(REFS.softCur[i]);
    }
    if (REFS.necklaceGroup && REFS.softMatPrev) {
      REFS.necklaceGroup.updateWorldMatrix(true, false);
      REFS.softMatPrev.copy(REFS.necklaceGroup.matrixWorld);
    }
    REFS.softInit = false;
  }

  function dampSoftChainVelocity(amount) {
    if (!REFS.softCur || !REFS.softPrev) return;
    const alpha = THREE.MathUtils.clamp(amount, 0, 1);
    for (let i = 0; i < REFS.softCur.length; i++) {
      // Verlet velocity is encoded as current - previous; moving previous toward current damps it.
      REFS.softPrev[i].lerp(REFS.softCur[i], alpha);
    }
  }

  function relaxSoftChainToRest(amount) {
    if (!REFS.softCur || !REFS.softPrev || !REFS.softRest) return;
    const alpha = THREE.MathUtils.clamp(amount, 0, 1);
    for (let i = 0; i < REFS.softCur.length; i++) {
      REFS.softCur[i].lerp(REFS.softRest[i], alpha);
      REFS.softPrev[i].lerp(REFS.softRest[i], alpha);
    }
    // Prevent old deformation from surviving tracking lost/regain.
    rebuildChainGeometryFromNodes(REFS.softCur);
  }

  function simulateChain(dt, stalledFrame) {
    const cur = REFS.softCur;
    const prev = REFS.softPrev;
    const rest = REFS.softRest;
    const free = REFS.softFreedom;
    if (!PARAMS.SOFT_ENABLED || !cur || !prev || !rest || !free || !REFS.chainMesh || !REFS.necklaceGroup) {
      return 'off';
    }

    if (!Number.isFinite(dt) || dt <= 0) return 'idle';
    // Clamp physics dt like the reference so spring forces stay stable after frame jitter.
    const safeDt = THREE.MathUtils.clamp(dt, 1 / 120, 0.04);
    const n = cur.length;

    REFS.necklaceGroup.updateWorldMatrix(true, false);
    REFS.softMatCur.copy(REFS.necklaceGroup.matrixWorld);
    REFS.softMatInv.copy(REFS.softMatCur).invert();

    if (!REFS.softInit) {
      REFS.softInit = true;
      REFS.softMatPrev.copy(REFS.softMatCur);
      for (let i = 0; i < n; i++) prev[i].copy(cur[i]);
      return 'primed';
    }

    if (stalledFrame) {
      resetSoftChainVelocity();
      rebuildChainGeometryFromNodes(cur);
      return 'reset';
    }

    REFS.softMatT.multiplyMatrices(REFS.softMatInv, REFS.softMatPrev);
    const poseMove = REFS.softProbe.copy(rest[0]).applyMatrix4(REFS.softMatT).distanceTo(rest[0]);
    const poseMoved = poseMove >= PARAMS.SOFT_MOTION_DEADZONE;
    const down = REFS.softDown.set(0, -1, 0).transformDirection(REFS.softMatInv);

    const g = PARAMS.SOFT_GRAVITY;
    const ks = PARAMS.SOFT_STIFFNESS;
    const kn = PARAMS.SOFT_NEIGHBOR;
    const damp = PARAMS.SOFT_DAMPING;
    const pin = PARAMS.SOFT_PIN_STRENGTH;
    const dev = PARAMS.SOFT_MAX_DEV;
    const restBlend = PARAMS.SOFT_REST_BLEND;
    const h2 = safeDt * safeDt;
    let maxMove = 0;

    for (let i = 0; i < n; i++) {
      const f = free[i];
      const ci = cur[i];
      const pi = prev[i];
      const ri = rest[i];

      if (f <= 0.02) {
        ci.copy(ri);
        pi.copy(ri);
        continue;
      }

      if (poseMoved) pi.applyMatrix4(REFS.softMatT);

      const left = cur[(i - 1 + n) % n];
      const right = cur[(i + 1) % n];
      const kRest = ks * (1 + (1 - f) * pin);
      const ax = (ri.x - ci.x) * kRest + down.x * g * f + kn * ((left.x + right.x) * 0.5 - ci.x);
      const ay = (ri.y - ci.y) * kRest + down.y * g * f + kn * ((left.y + right.y) * 0.5 - ci.y);
      const az = (ri.z - ci.z) * kRest + down.z * g * f + kn * ((left.z + right.z) * 0.5 - ci.z);
      const vx = (ci.x - pi.x) * damp + ax * h2;
      const vy = (ci.y - pi.y) * damp + ay * h2;
      const vz = (ci.z - pi.z) * damp + az * h2;

      pi.copy(ci);
      ci.x += vx;
      ci.y += vy;
      ci.z += vz;
      maxMove = Math.max(maxMove, Math.sqrt(vx * vx + vy * vy + vz * vz));

      const dx = ci.x - ri.x;
      const dy = ci.y - ri.y;
      const dz = ci.z - ri.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > dev * dev) {
        const k = dev / Math.sqrt(d2);
        ci.x = ri.x + dx * k;
        ci.y = ri.y + dy * k;
        ci.z = ri.z + dz * k;
      }

      if (restBlend > 0) {
        // Blend both Verlet buffers so the chain rebalances without injecting fresh velocity.
        const rb = restBlend * (0.25 + f * 0.75);
        ci.lerp(ri, rb);
        pi.lerp(ri, rb);
      }
    }

    REFS.softMatPrev.copy(REFS.softMatCur);
    rebuildChainGeometryFromNodes(cur);
    return poseMoved || maxMove > 0.04 ? 'moving' : 'settled';
  }

  function updatePendantPendulum(dt, pitch, roll, yaw, stalledFrame) {
    if (!PARAMS.PHYS_ENABLED || !REFS.pendantPivot || !STATE.pendantReady) return;
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(pitch) || !Number.isFinite(roll) || !Number.isFinite(yaw)) {
      return;
    }

    const phys = STATE.pendantPhys;
    if (!phys.init || stalledFrame) {
      resetPendantPendulum(yaw, pitch, roll);
      return;
    }

    const safeDt = THREE.MathUtils.clamp(dt, 1 / 120, 0.04);
    const yawSpeed = wrappedAngleDelta(yaw, phys.yaw) / safeDt;
    const isGLBMode = STATE.pendantMode === 'glb';
    const glbSwingEnabled = !isGLBMode || PARAMS.GLB_SWING_ENABLED;
    const swingStrength = isGLBMode
      ? (glbSwingEnabled ? PARAMS.GLB_SWING_STRENGTH : 0)
      : 1;
    const restX = -PARAMS.GRAVITY_PITCH * pitch * swingStrength;
    const restZ = -PARAMS.GRAVITY_ROLL * roll * swingStrength;
    const stiffness = PARAMS.PHYS_STIFFNESS;
    const damping = isGLBMode ? PARAMS.GLB_SWING_DAMPING : PARAMS.PHYS_DAMPING;

    const ax = -stiffness * (phys.sx - restX) - damping * phys.vx;
    const az = -stiffness * (phys.sz - restZ) - damping * phys.vz - PARAMS.YAW_SHAKE_KICK * yawSpeed * swingStrength;
    phys.vx += ax * safeDt;
    phys.sx += phys.vx * safeDt;
    phys.vz += az * safeDt;
    phys.sz += phys.vz * safeDt;

    const maxSwing = isGLBMode
      ? (glbSwingEnabled ? PARAMS.GLB_SWING_MAX_ROTATION : 0)
      : PARAMS.SWING_MAX;
    if (phys.sx > maxSwing) {
      phys.sx = maxSwing;
      phys.vx = 0;
    } else if (phys.sx < -maxSwing) {
      phys.sx = -maxSwing;
      phys.vx = 0;
    }
    if (phys.sz > maxSwing) {
      phys.sz = maxSwing;
      phys.vz = 0;
    } else if (phys.sz < -maxSwing) {
      phys.sz = -maxSwing;
      phys.vz = 0;
    }

    REFS.pendantPivot.rotation.x = PARAMS.PENDANT_TILT + phys.sx;
    REFS.pendantPivot.rotation.z = phys.sz;
    if (isGLBMode && REFS.glbPendantGroup) {
      // Keep the 3D model anchored to pendantPivot: only allow a tiny clamped visual drift.
      const maxOffset = PARAMS.GLB_SWING_MAX_OFFSET;
      const motionX = THREE.MathUtils.clamp(-phys.sz * maxOffset, -maxOffset, maxOffset);
      const motionY = THREE.MathUtils.clamp(-Math.abs(phys.sx) * maxOffset * 0.35, -maxOffset, maxOffset);
      applyGLBPendantTransform(REFS.glbPendantGroup, motionX, motionY, 0);
    }
    phys.yaw = yaw;
    phys.pitch = pitch;
    phys.roll = roll;
  }

  function applyPendantImageBoost(mat) {
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uPendantBrightness = { value: PARAMS.PENDANT_BRIGHTNESS };
      shader.uniforms.uPendantContrast = { value: PARAMS.PENDANT_CONTRAST };
      shader.uniforms.uPendantSaturation = { value: PARAMS.PENDANT_SATURATION };
      shader.uniforms.uPendantLift = { value: PARAMS.PENDANT_LIFT };
      shader.uniforms.uPendantAlphaGain = { value: PARAMS.PENDANT_ALPHA_GAIN };
      REFS.pendantShader = shader;

      shader.fragmentShader =
        'uniform float uPendantBrightness;\n' +
        'uniform float uPendantContrast;\n' +
        'uniform float uPendantSaturation;\n' +
        'uniform float uPendantLift;\n' +
        'uniform float uPendantAlphaGain;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          '#include <map_fragment>\n' +
            '  diffuseColor.rgb = clamp((diffuseColor.rgb - vec3(0.5)) * uPendantContrast + vec3(0.5), 0.0, 1.0);\n' +
            '  float pendantLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n' +
            '  diffuseColor.rgb = mix(vec3(pendantLuma), diffuseColor.rgb, uPendantSaturation);\n' +
            '  diffuseColor.rgb = clamp(diffuseColor.rgb * uPendantBrightness + vec3(uPendantLift), 0.0, 1.0);\n' +
            '  diffuseColor.a = clamp(diffuseColor.a * uPendantAlphaGain, 0.0, 1.0);'
        );
    };
    mat.needsUpdate = true;
  }

  function buildPendantObjects(group) {
    REFS.pendantMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      alphaTest: PARAMS.PENDANT_ALPHA_TEST,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    applyPendantImageBoost(REFS.pendantMat);

    REFS.pendantPivot = new THREE.Object3D();
    REFS.pendantPivot.name = 'Phase7PendantPivot';
    REFS.pendantPivot.rotation.set(PARAMS.PENDANT_TILT, 0, 0);
    REFS.pendantPivot.visible = false;

    REFS.pendantMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), REFS.pendantMat);
    REFS.pendantMesh.name = 'Phase7PendantPlane';
    REFS.pendantMesh.renderOrder = 11;
    // PNG plane and experimental GLB model both attach here; tracking and chain placement stay shared.
    REFS.pendantPivot.add(REFS.pendantMesh);

    group.add(REFS.pendantPivot);
    placePendantAtChainFront();
  }

  function buildNeckOccluder(group) {
    if (!PARAMS.OCCLUDER_ENABLED || !REFS.neck || !group) {
      STATE.occlusionReady = false;
      return null;
    }

    const radiusX = Math.max(1, REFS.neck.radiusX * PARAMS.OCCLUDER_RADIUS_X);
    const radiusZ = Math.max(1, REFS.neck.radiusZ * PARAMS.OCCLUDER_RADIUS_Z);
    const height = Math.max(80, REFS.neck.radiusX * PARAMS.OCCLUDER_HEIGHT_SCALE);

    REFS.occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    REFS.occluderMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 48, 1, true),
      REFS.occluderMat
    );
    REFS.occluderMesh.name = 'Phase8NeckDepthOccluder';
    REFS.occluderMesh.position.set(
      REFS.neck.centerX,
      REFS.neck.centerY + PARAMS.OCCLUDER_Y_OFFSET,
      REFS.neck.centerZ - REFS.neck.radiusZ * PARAMS.OCCLUDER_BACK_PUSH
    );
    REFS.occluderMesh.scale.set(radiusX, height, radiusZ);
    REFS.occluderMesh.renderOrder = -10;
    REFS.occluderMesh.frustumCulled = false;

    group.add(REFS.occluderMesh);
    STATE.occlusionReady = true;
    return REFS.occluderMesh;
  }

  function setProduct(item) {
    const next = item || PRODUCTS[0];
    STATE.product = next;
    STATE.pendantReady = false;
    STATE.pendantError = null;
    if (!STATE.metal) STATE.metal = next.metal || 'white';
    setMetal(STATE.metal);
    highlightProduct(next.id);
    updateInfo(next);
    updateDebugStats();
    const checksOk = CHECKS.every(function (check) { return check.test(); });

    if (!REFS.pendantMat || !REFS.pendantPivot) {
      updateStatus(checksOk);
      return;
    }

    if (STATE.pendantMode === 'glb' && setProductGLB(next, checksOk)) {
      return;
    }

    const loader = getTextureLoader();
    if (!loader) {
      STATE.pendantError = 'THREE.TextureLoader unavailable';
      updateStatus(checksOk);
      return;
    }

    const url = assetUrl(next.image);
    STATE.productTextureUrl = url;
    STATE.productModelUrl = null;
    REFS.pendantPivot.visible = false;

    loader.load(
      url,
      function (texture) {
        if (!STATE.product || STATE.product.id !== next.id || STATE.productTextureUrl !== url) {
          texture.dispose();
          return;
        }

        texture.encoding = THREE.sRGBEncoding;
        if (REFS.renderer && REFS.renderer.capabilities && REFS.renderer.capabilities.getMaxAnisotropy) {
          texture.anisotropy = Math.min(4, REFS.renderer.capabilities.getMaxAnisotropy());
        } else {
          texture.anisotropy = 4;
        }

        const img = texture.image || {};
        const aspect = img.width && img.height ? img.width / img.height : 1;
        if (REFS.pendantMat.map && REFS.pendantMat.map !== texture) {
          REFS.pendantMat.map.dispose();
        }
        REFS.pendantMat.map = texture;
        REFS.pendantMat.needsUpdate = true;
        layoutPendant(aspect);
        setPendantRendererVisibility();
        REFS.pendantPivot.visible = true;
        STATE.pendantReady = true;
        STATE.pendantError = null;
        resetPendantPendulum();
        updateDebugStats();
        updateStatus(true);
      },
      undefined,
      function (err) {
        if (!STATE.product || STATE.product.id !== next.id) return;
        STATE.pendantReady = false;
        STATE.pendantError = 'failed to load ' + next.image;
        updateDebugStats();
        updateStatus(true);
        console.error('[recreate-shell] pendant texture load failed:', err);
      }
    );
  }

  function setCaptureButtonState(label, disabled) {
    const button = document.getElementById('captureButton');
    if (!button) return;

    button.textContent = label;
    button.disabled = Boolean(disabled);
  }

  function captureComposite() {
    const cameraCanvas = document.getElementById('WebARRocksFaceCanvas');
    const threeCanvas = document.getElementById('threeCanvas');
    if (!cameraCanvas || !threeCanvas || !cameraCanvas.width || !cameraCanvas.height) {
      STATE.captureError = 'Canvases are not ready.';
      updateStatus(CHECKS.every(function (check) { return check.test(); }));
      return;
    }

    const width = cameraCanvas.width;
    const height = cameraCanvas.height;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d');
    if (!ctx) {
      STATE.captureError = 'Capture canvas unavailable.';
      updateStatus(false);
      return;
    }

    setCaptureButtonState('Capturing...', true);

    try {
      // The live canvases are mirrored through CSS, so mirror the source bitmaps here too.
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(cameraCanvas, 0, 0, width, height);
      ctx.drawImage(threeCanvas, 0, 0, width, height);
      ctx.restore();

      const url = output.toDataURL('image/png');
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = 'necklace-tryon-' + stamp + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();

      STATE.captureError = null;
      updateStatus(CHECKS.every(function (check) { return check.test(); }));
      setCaptureButtonState('Captured', false);
      window.setTimeout(function () {
        setCaptureButtonState('Capture', false);
      }, 900);
    } catch (e) {
      STATE.captureError = String(e && e.message ? e.message : e);
      updateStatus(false);
      setCaptureButtonState('Capture failed', false);
      window.setTimeout(function () {
        setCaptureButtonState('Capture', false);
      }, 1200);
      console.error('[recreate-shell] capture failed:', e);
    }
  }

  function buildStaticChain() {
    if (!REFS.follower || !REFS.neck) return null;

    disposeStaticChain();

    const group = new THREE.Object3D();
    group.name = 'Phase8StaticNecklaceGroup';

    const nodeCount = PARAMS.SOFT_ENABLED ? PARAMS.SOFT_NODES : PARAMS.LOOP_SAMPLES;
    const chainRadiusX = REFS.neck.radiusX * PARAMS.CHAIN_WIDTH_SCALE;
    const chainRadiusZ = REFS.neck.radiusZ * PARAMS.CHAIN_DEPTH_SCALE;
    const points = [];
    const freedom = [];
    for (let i = 0; i < nodeCount; i++) {
      const t = (i / nodeCount) * Math.PI * 2;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      const absSin = Math.abs(sinT);
      const sinSign = sinT < 0 ? -1 : 1;
      const sideProfile = Math.pow(absSin, PARAMS.SIDE_ARC_SMOOTHNESS);
      // Push mid-side control points slightly outward, but keep front/back centered.
      const sideInset = PARAMS.CHAIN_SIDE_INSET * Math.sin(Math.PI * absSin);
      const frontBlend = smoothstep01((cosT - PARAMS.CHAIN_V_FRONT_START) / (1 - PARAMS.CHAIN_V_FRONT_START));
      const frontShoulder = frontBlend * Math.pow(absSin, PARAMS.CHAIN_V_POWER);
      const vTaper = 1 - PARAMS.CHAIN_V_TAPER * frontShoulder;
      const rearBlend = smoothstep01(
        (PARAMS.REAR_ARC_START_COS - cosT) / (PARAMS.REAR_ARC_START_COS + 1)
      );
      // Rear-only scaling tucks the nape/side arc into the neck occluder.
      // At cosT === 1 this is zero, so the pendant/front point stays fixed.
      const rearWidthScale = THREE.MathUtils.lerp(1, PARAMS.REAR_WIDTH_SCALE, rearBlend);
      const rearDepthScale = THREE.MathUtils.lerp(1, PARAMS.REAR_DEPTH_SCALE, rearBlend);
      const shapedX = sinSign * Math.min(1.18, sideProfile + sideInset) * vTaper * chainRadiusX * rearWidthScale;
      const point = new THREE.Vector3(
        REFS.neck.centerX + shapedX + PARAMS.CHAIN_X_OFFSET,
        REFS.neck.yOf(cosT) + PARAMS.CHAIN_V_SHOULDER_LIFT * frontShoulder,
        REFS.neck.centerZ + cosT * chainRadiusZ * rearDepthScale
      );
      points.push(point);
      freedom.push(smoothstep01((cosT - PARAMS.SOFT_FRONT_PIN) / (1 - PARAMS.SOFT_FRONT_PIN)));
    }

    initializeSoftChain(points, freedom);
    REFS.chainPoints = REFS.softCur || points;
    REFS.chainCurve = REFS.softCurve || new THREE.CatmullRomCurve3(
      points,
      true,
      'catmullrom',
      PARAMS.CHAIN_CURVE_TENSION
    );
    if (typeof REFS.chainCurve.updateArcLengths === 'function') {
      REFS.chainCurve.updateArcLengths();
    }
    REFS.chainMat = createChainMetalMaterial();
    const zValues = points.map(function (point) { return point.z; });
    const zMin = Math.min.apply(Math, zValues);
    const zMax = Math.max.apply(Math, zValues);
    const zSpan = Math.max(1, zMax - zMin);
    applyChainFade(
      REFS.chainMat,
      zMax - zSpan * PARAMS.FADE_START_FRAC,
      zMax - zSpan * PARAMS.FADE_END_FRAC
    );
    REFS.chainMesh = new THREE.Mesh(
      new THREE.TubeGeometry(
        REFS.chainCurve,
        PARAMS.SOFT_ENABLED ? PARAMS.SOFT_TUBE_SEGMENTS : PARAMS.CHAIN_SEGMENTS,
        PARAMS.CHAIN_THICK,
        PARAMS.CHAIN_RADIAL,
        true
      ),
      REFS.chainMat
    );
    REFS.chainMesh.name = 'Phase8StaticChain';
    REFS.chainMesh.renderOrder = 10;
    REFS.chainMesh.frustumCulled = false;
    REFS.chainMesh.visible = PARAMS.CHAIN_STYLE !== 'links';

    buildNeckOccluder(group);
    group.add(REFS.chainMesh);
    buildChainLinks(group);
    buildPendantObjects(group);
    applyMaterialLightingTuning();
    REFS.follower.add(group);
    REFS.necklaceGroup = group;
    STATE.chainReady = true;
    setProduct(STATE.product || PRODUCTS[0]);
    updateDebugStats();

    return group;
  }

  function makeAxisMesh(axis, length, color) {
    const material = new THREE.MeshBasicMaterial({
      color: color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, length, 12), material);

    if (axis === 'x') {
      mesh.rotation.z = Math.PI / 2;
      mesh.position.x = length / 2;
    } else if (axis === 'z') {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = length / 2;
    } else {
      mesh.position.y = length / 2;
    }

    mesh.renderOrder = 20;
    return mesh;
  }

  function buildDebugFollowerObject() {
    if (!REFS.follower) return null;

    if (REFS.debugGroup && REFS.debugGroup.parent) {
      REFS.debugGroup.parent.remove(REFS.debugGroup);
    }

    const group = new THREE.Group();
    group.name = 'Phase4DebugFollowerObject';

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9b35c,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.82,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(54, 1.4, 10, 96), ringMaterial);
    ring.name = 'DebugNeckRing';
    ring.position.y = -32;
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 20;
    group.add(ring);

    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(5, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false })
    );
    origin.name = 'DebugOrigin';
    origin.renderOrder = 21;
    group.add(origin);

    group.add(makeAxisMesh('x', 72, 0xff4d4d));
    group.add(makeAxisMesh('y', 72, 0x7bd88f));
    group.add(makeAxisMesh('z', 72, 0x52a8ff));

    REFS.follower.add(group);
    REFS.debugGroup = group;
    REFS.debugGroup.visible = STATE.showDebugAxes;
    STATE.debugReady = true;

    return group;
  }

  function normalizeLandmarks(landmarks) {
    if (!landmarks) return [];
    if (Array.isArray(landmarks) && landmarks.length && Array.isArray(landmarks[0])) {
      if (Array.isArray(landmarks[0][0])) return landmarks[0];
      return landmarks;
    }
    return [];
  }

  function drawDebugPreviewPlaceholder(ctx, width, height, text) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(244,244,246,0.72)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height / 2);
  }

  function drawDebugLandmarks(ctx, landmarks, width, height) {
    if (!landmarks.length) return;

    ctx.save();
    ctx.fillStyle = '#7bd88f';
    ctx.strokeStyle = 'rgba(5, 5, 7, 0.75)';
    ctx.lineWidth = 2;

    landmarks.forEach(function (point) {
      if (!point || point.length < 2) return;
      const xNorm = Number(point[0]);
      const yNorm = Number(point[1]);
      if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return;

      const x = (0.5 - xNorm * 0.5) * width;
      const y = (0.5 - yNorm * 0.5) * height;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    });

    ctx.restore();
  }

  function updateDebugStats() {
    const detection = STATE.lastDetection;
    const motion = STATE.motionDebug || {};
    const peaks = STATE.motionPeaks || {};
    const score = detection && typeof detection.detected === 'number'
      ? detection.detected.toFixed(3)
      : '-';
    setText('debugStatus', detection && detection.isDetected ? 'Detected' : (STATE.trackingStarted ? 'Searching' : 'Idle'));
    setText('debugScore', score);
    setText('debugLandmarks', String(detection && detection.landmarksCount ? detection.landmarksCount : 0));
    setText('debugChain', STATE.chainReady ? 'On' : 'Off');
    setText('debugPendant', STATE.pendantReady ? STATE.product.name : (STATE.pendantError ? 'Error' : 'Off'));
    setText('debugFollowerY', formatDebugNumber(motion.followerY, 2));
    setText('debugFollowerRotX', formatDebugNumber(motion.followerRotX, 3));
    setText('debugPoseParentY', formatDebugNumber(motion.poseParentY, 2));
    setText('debugPosePitch', formatDebugNumber(motion.posePitch, 3));
    setText('debugYaw', formatDebugNumber(motion.yaw, 3));
    setText('debugYawStep', formatDebugNumber(motion.yawStep, 3));
    setText('debugRawYDelta', formatDebugNumber(motion.rawYDelta, 2));
    setText('debugYawYComp', formatDebugNumber(motion.yawYCompensation, 2));
    setText('debugGroupY', formatDebugNumber(motion.groupY, 2));
    setText('debugCompY', formatDebugNumber(motion.compensationY, 2));
    setText('debugPitchComp', formatDebugNumber(motion.pitchCompensation, 3));
    setText('debugDt', formatDebugNumber(motion.dt, 3));
    setText('debugHookOrder', motion.hookOrder || '-');
    setText('debugTrackingMode', PARAMS.TRACKING_POSE_MODE || 'sourceRaw');
    setText('debugChainSim', motion.chainSim || 'none');
    setText('debugPeakYJump', formatDebugNumber(peaks.maxYJump, 2));
    setText('debugPeakPitchStep', formatDebugNumber(peaks.maxPitchStep, 3));
    setText('debugPeakCompY', formatDebugNumber(peaks.maxCompY, 2));
    setText('debugPeak2sYJump', formatDebugNumber(peaks.last2sYJump, 2));
    setText('debugPeak2sPitch', formatDebugNumber(peaks.last2sPitchStep, 3));
    setText('debugPeakSamples', String(peaks.samples ? peaks.samples.length : 0));
  }

  function updateDebugPreview() {
    updateDebugStats();
    if (!STATE.debugDrawerOpen) return;

    const preview = document.getElementById('debugPreviewCanvas');
    const cameraCanvas = document.getElementById('WebARRocksFaceCanvas');
    if (!preview) return;

    const ctx = preview.getContext('2d');
    if (!ctx) return;

    const width = preview.width;
    const height = preview.height;
    if (!STATE.trackingStarted || !cameraCanvas || !cameraCanvas.width || !cameraCanvas.height) {
      drawDebugPreviewPlaceholder(ctx, width, height, 'Camera preview');
      return;
    }

    try {
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(cameraCanvas, 0, 0, width, height);
      ctx.restore();
    } catch (e) {
      drawDebugPreviewPlaceholder(ctx, width, height, 'Preview unavailable');
      return;
    }

    drawDebugLandmarks(ctx, STATE.lastLandmarks || [], width, height);
  }

  function setMotionDebug(values) {
    Object.assign(STATE.motionDebug, values);

    if (!PARAMS.DEBUG_MOTION_LOG && !STATE.debugDrawerOpen) return;

    const now = performance.now() / 1000;
    if (now - STATE.motionLogLastT < PARAMS.MOTION_LOG_INTERVAL) return;

    STATE.motionLogLastT = now;
    console.log('[recreate-motion]', Object.assign({}, STATE.motionDebug));
  }

  function updateMotionPeaks(sample) {
    const peaks = STATE.motionPeaks;
    const now = sample.t;

    peaks.maxYJump = Math.max(peaks.maxYJump, sample.yJump);
    peaks.maxPitchStep = Math.max(peaks.maxPitchStep, sample.pitchStep);
    peaks.maxCompY = Math.max(peaks.maxCompY, Math.abs(sample.compY));
    peaks.maxGroupY = Math.max(peaks.maxGroupY, Math.abs(sample.groupY));

    peaks.samples.push(sample);
    const cutoff = now - PARAMS.PEAK_WINDOW_SEC;
    while (peaks.samples.length && peaks.samples[0].t < cutoff) {
      peaks.samples.shift();
    }

    peaks.last2sYJump = 0;
    peaks.last2sPitchStep = 0;
    peaks.last2sCompY = 0;
    peaks.samples.forEach(function (item) {
      peaks.last2sYJump = Math.max(peaks.last2sYJump, item.yJump);
      peaks.last2sPitchStep = Math.max(peaks.last2sPitchStep, item.pitchStep);
      peaks.last2sCompY = Math.max(peaks.last2sCompY, Math.abs(item.compY));
    });
  }

  function updateChainYawFade(state) {
    if (!PARAMS.FADE_ENABLED || !REFS.chainShader || !REFS.follower || !state || !state.isDetected) {
      return;
    }

    const parent = REFS.follower.parent;
    if (!parent || parent.visible === false) return;

    parent.updateMatrixWorld(true);
    REFS.fadeMat.copy(parent.matrixWorld || parent.matrix);
    REFS.fadeMat.decompose(REFS.fadePos, REFS.fadeQuat, REFS.fadeScale);
    const fwd = REFS.fadeFwd.set(0, 0, 1).applyQuaternion(REFS.fadeQuat);
    const yaw = Math.atan2(fwd.x, fwd.z);
    const now = performance.now() / 1000;

    if (!STATE.yawRestReady) {
      STATE.yawRest = yaw;
      STATE.yawPrev = yaw;
      STATE.yawLastT = now;
      STATE.yawRestReady = true;
      return;
    }

    let dt = now - STATE.yawLastT;
    STATE.yawLastT = now;
    if (dt <= 0) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;

    const yawSpeed = Math.abs(yaw - STATE.yawPrev) / dt;
    if (yawSpeed < 0.6) {
      STATE.yawRest += (yaw - STATE.yawRest) * PARAMS.YAW_REST_ADAPT;
    }

    REFS.chainShader.uniforms.uYaw.value = (yaw - STATE.yawRest) * PARAMS.YAW_HIDE_SIGN;
    STATE.yawPrev = yaw;
  }

  function relaxNecklaceMotionCompensation(hookOrder) {
    if (!REFS.necklaceGroup) return;

    STATE.poseOffsetY += (0 - STATE.poseOffsetY) * 0.18;
    STATE.posePitchComp += (0 - STATE.posePitchComp) * 0.18;
    STATE.yawYOffset = 0;
    STATE.posePrevYaw = null;
    STATE.posePrevLiveY = null;
    if (PARAMS.TRACKING_POSE_MODE === 'sourceRaw') {
      STATE.poseOffsetY = 0;
      STATE.posePitchComp = 0;
    }
    REFS.necklaceGroup.position.y = STATE.poseOffsetY;
    REFS.necklaceGroup.rotation.x = STATE.posePitchComp;
    resetSoftChainVelocity();
    relaxSoftChainToRest(0.25);
    resetPendantPendulum();
    setMotionDebug({
      detected: false,
      followerY: REFS.follower ? REFS.follower.position.y : null,
      followerRotX: REFS.follower ? REFS.follower.rotation.x : null,
      yaw: null,
      yawStep: null,
      rawYDelta: null,
      yawYCompensation: STATE.yawYOffset,
      groupY: REFS.necklaceGroup.position.y,
      compensationY: STATE.poseOffsetY,
      pitchCompensation: STATE.posePitchComp,
      dt: null,
      hookOrder: hookOrder || 'lost',
      chainSim: REFS.softCur ? 'lost/reset' : 'none',
    });
  }

  function resetYawYStabilizer(yaw, liveY) {
    STATE.yawYOffset = 0;
    STATE.posePrevYaw = Number.isFinite(yaw) ? yaw : null;
    STATE.posePrevLiveY = Number.isFinite(liveY) ? liveY : null;
  }

  function updateYawYStabilizer(yaw, liveY, dt, stalledFrame) {
    const result = {
      yawStep: 0,
      rawYDelta: 0,
      yawYCompensation: STATE.yawYOffset || 0,
    };

    if (
      !PARAMS.YAW_Y_STABILIZER_ENABLED ||
      stalledFrame ||
      !Number.isFinite(yaw) ||
      !Number.isFinite(liveY)
    ) {
      resetYawYStabilizer(yaw, liveY);
      result.yawYCompensation = STATE.yawYOffset;
      return result;
    }

    if (!Number.isFinite(STATE.posePrevYaw) || !Number.isFinite(STATE.posePrevLiveY)) {
      resetYawYStabilizer(yaw, liveY);
      result.yawYCompensation = STATE.yawYOffset;
      return result;
    }

    const yawStep = Math.abs(angleDelta(yaw, STATE.posePrevYaw));
    const rawYDelta = liveY - STATE.posePrevLiveY;
    const turnSpike = yawStep > PARAMS.YAW_STEP_THRESHOLD && rawYDelta > PARAMS.YAW_Y_THRESHOLD;
    const target = turnSpike
      ? -Math.min(
          PARAMS.YAW_Y_MAX_COMP,
          (rawYDelta - PARAMS.YAW_Y_THRESHOLD) * PARAMS.YAW_Y_STRENGTH
        )
      : 0;
    const smoothing = turnSpike ? PARAMS.YAW_Y_SMOOTHING : PARAMS.YAW_Y_RELEASE;
    const alpha = 1 - Math.pow(1 - THREE.MathUtils.clamp(smoothing, 0, 1), dt * 60);

    STATE.yawYOffset += (target - STATE.yawYOffset) * alpha;
    STATE.posePrevYaw = yaw;
    STATE.posePrevLiveY = liveY;

    result.yawStep = yawStep;
    result.rawYDelta = rawYDelta;
    result.yawYCompensation = STATE.yawYOffset;
    return result;
  }

  function applyTrackingPoseMode(upwardJump) {
    const applied = { y: 0, pitch: 0 };
    if (!REFS.necklaceGroup) return applied;

    const mode = PARAMS.TRACKING_POSE_MODE || 'sourceRaw';
    const yawY = PARAMS.YAW_Y_STABILIZER_ENABLED ? STATE.yawYOffset : 0;

    if (mode === 'compensated') {
      applied.y = STATE.poseOffsetY;
      applied.pitch = STATE.posePitchComp;
    } else if (mode === 'hybrid') {
      const spike = Math.max(0, upwardJump - PARAMS.HYBRID_SPIKE_Y);
      const spikeScale = PARAMS.MAX_UPWARD_DELTA > 0
        ? THREE.MathUtils.clamp(spike / PARAMS.MAX_UPWARD_DELTA, 0, 1)
        : 0;
      const strength = THREE.MathUtils.clamp(PARAMS.HYBRID_STRENGTH, 0, 1) * spikeScale;
      applied.y = STATE.poseOffsetY * strength;
      applied.pitch = STATE.posePitchComp * strength;
    }

    applied.y += yawY;
    REFS.necklaceGroup.position.y = applied.y;
    REFS.necklaceGroup.rotation.x = applied.pitch;
    return applied;
  }

  function updateNecklaceMotionStabilizer(state, hookOrder) {
    if (!REFS.necklaceGroup || !REFS.follower || !state || !state.isDetected) {
      relaxNecklaceMotionCompensation(hookOrder);
      return;
    }

    const parent = REFS.follower.parent;
    if (!parent || parent.visible === false) {
      relaxNecklaceMotionCompensation(hookOrder);
      return;
    }

    parent.updateMatrixWorld(true);
    REFS.fadeMat.copy(parent.matrixWorld || parent.matrix);
    REFS.fadeMat.decompose(REFS.fadePos, REFS.fadeQuat, REFS.fadeScale);
    REFS.poseEuler.setFromQuaternion(REFS.fadeQuat, 'YXZ');

    const liveY = REFS.fadePos.y;
    const pitch = REFS.poseEuler.x;
    const roll = REFS.poseEuler.z;
    const forward = REFS.fadeFwd.set(0, 0, 1).applyQuaternion(REFS.fadeQuat);
    const yaw = Math.atan2(forward.x, forward.z);
    const now = performance.now() / 1000;
    const followerY = REFS.follower.position.y;
    const followerRotX = REFS.follower.rotation.x;

    if (!STATE.poseReady) {
      STATE.poseReady = true;
      STATE.poseSmoothY = liveY;
      STATE.poseSmoothPitch = pitch;
      STATE.posePrevPitch = pitch;
      STATE.poseRestPitch = pitch;
      STATE.poseOffsetY = 0;
      STATE.posePitchComp = 0;
      STATE.poseLastT = now;
      REFS.necklaceGroup.position.y = 0;
      REFS.necklaceGroup.rotation.x = 0;
      resetMotionPeaks();
      resetSoftChainVelocity();
      resetYawYStabilizer(yaw, liveY);
      resetPendantPendulum(yaw, pitch, roll);
      setMotionDebug({
        detected: true,
        followerY: followerY,
        followerRotX: followerRotX,
        poseParentY: liveY,
        posePitch: pitch,
        yaw: yaw,
        yawStep: 0,
        rawYDelta: 0,
        yawYCompensation: STATE.yawYOffset,
        groupY: 0,
        compensationY: 0,
        pitchCompensation: 0,
        dt: 0,
        hookOrder: (hookOrder || 'motion') + '/init',
        chainSim: REFS.softCur ? 'primed' : 'none',
      });
      return;
    }

    // rawDt is kept separate so stalled frames can reset velocity even after dt is clamped.
    const rawDt = now - STATE.poseLastT;
    let dt = rawDt;
    STATE.poseLastT = now;
    if (dt <= 0) dt = 1 / 60;
    // Clamp runtime dt for stable spring physics, matching the reference implementation.
    if (dt > 0.04) dt = 0.04;
    const stalledFrame = rawDt > 0.12;

    const alpha = 1 - Math.pow(1 - PARAMS.POSE_SMOOTHING, dt * 60);
    const pitchAlpha = 1 - Math.pow(1 - PARAMS.PITCH_SMOOTHING, dt * 60);
    const upwardJump = Math.max(0, liveY - STATE.poseSmoothY);
    const pitchStep = Math.abs(pitch - STATE.posePrevPitch);
    STATE.poseSmoothY += (liveY - STATE.poseSmoothY) * alpha;
    STATE.poseSmoothPitch += (pitch - STATE.poseSmoothPitch) * pitchAlpha;

    const targetOffsetY =
      PARAMS.COMPENSATION_Y_SIGN *
      Math.min(PARAMS.MAX_UPWARD_DELTA, upwardJump) *
      PARAMS.MOTION_STRENGTH;
    STATE.poseOffsetY += (targetOffsetY - STATE.poseOffsetY) * Math.min(1, alpha * 1.35);

    const pitchSpeed = Math.abs(pitch - STATE.posePrevPitch) / dt;
    if (pitchSpeed < 0.75) {
      STATE.poseRestPitch += (STATE.poseSmoothPitch - STATE.poseRestPitch) * PARAMS.POSE_SMOOTHING * 0.18;
    }

    const pitchDelta = STATE.poseSmoothPitch - STATE.poseRestPitch;
    const pitchComp = THREE.MathUtils.clamp(
      -pitchDelta * (1 - PARAMS.PITCH_RESPONSE_SCALE) * PARAMS.MOTION_STRENGTH,
      -PARAMS.MAX_PITCH_COMP,
      PARAMS.MAX_PITCH_COMP
    );
    STATE.posePitchComp += (pitchComp - STATE.posePitchComp) * Math.min(1, alpha * 1.1);

    const yawMotion = updateYawYStabilizer(yaw, liveY, dt, stalledFrame);
    const appliedPose = applyTrackingPoseMode(upwardJump);
    if (upwardJump > PARAMS.SOFT_SPIKE_Y_THRESHOLD) {
      dampSoftChainVelocity(PARAMS.SOFT_SPIKE_VELOCITY_DAMPING);
    }
    const chainSimStatus = simulateChain(dt, stalledFrame);
    updatePendantPendulum(dt, pitch, roll, yaw, stalledFrame);
    STATE.posePrevPitch = pitch;
    updateMotionPeaks({
      t: now,
      yJump: upwardJump,
      pitchStep: pitchStep,
      compY: appliedPose.y,
      groupY: REFS.necklaceGroup.position.y,
    });
    setMotionDebug({
      detected: true,
      followerY: followerY,
      followerRotX: followerRotX,
      poseParentY: liveY,
      posePitch: pitch,
      yaw: yaw,
      yawStep: yawMotion.yawStep,
      rawYDelta: yawMotion.rawYDelta,
      yawYCompensation: yawMotion.yawYCompensation,
      groupY: REFS.necklaceGroup.position.y,
      compensationY: appliedPose.y,
      pitchCompensation: appliedPose.pitch,
      dt: dt,
      hookOrder: hookOrder || 'motion',
      chainSim: chainSimStatus,
    });
  }

  function setDebugDrawerOpen(isOpen) {
    STATE.debugDrawerOpen = Boolean(isOpen);
    const drawer = document.getElementById('debugDrawer');
    const toggle = document.getElementById('debugToggle');
    if (drawer) drawer.classList.toggle('is-open', STATE.debugDrawerOpen);
    if (toggle) {
      toggle.setAttribute('aria-expanded', STATE.debugDrawerOpen ? 'true' : 'false');
      toggle.title = STATE.debugDrawerOpen ? 'Close debug preview' : 'Open debug preview';
    }
    updateDebugPreview();
  }

  function setDebugAxesVisible(isVisible) {
    STATE.showDebugAxes = Boolean(isVisible);
    if (REFS.debugGroup) REFS.debugGroup.visible = STATE.showDebugAxes;
  }

  function setMobileMenuCollapsed(isCollapsed) {
    STATE.mobileMenuCollapsed = Boolean(isCollapsed);
    const menu = document.getElementById('vtoMenu');
    const toggle = document.getElementById('mobileMenuToggle');
    if (menu) menu.classList.toggle('vto-menu--collapsed', STATE.mobileMenuCollapsed);
    if (toggle) {
      toggle.setAttribute('aria-expanded', STATE.mobileMenuCollapsed ? 'false' : 'true');
      toggle.textContent = STATE.mobileMenuCollapsed ? 'Controls' : 'Hide Controls';
      toggle.title = STATE.mobileMenuCollapsed ? 'Show controls' : 'Hide controls';
    }
  }

  function resizeTrackingHelperIfReady() {
    if (!STATE.trackingStarted) return;
    if (
      typeof WebARRocksFaceThreeHelper === 'undefined' ||
      typeof WebARRocksFaceThreeHelper.resize !== 'function'
    ) {
      return;
    }

    try {
      const layout = STATE.layout || layoutCanvases(_videoAspect);
      WebARRocksFaceThreeHelper.resize(layout.bufferWidth, layout.bufferHeight);
    } catch (e) {
      console.warn('[recreate-shell] helper resize failed:', e);
    }
  }

  function handleResize() {
    if (_resizeFrame) window.cancelAnimationFrame(_resizeFrame);

    _resizeFrame = window.requestAnimationFrame(function () {
      _resizeFrame = 0;
      layoutCanvases(_videoAspect);
      setCheckState('layout', validateCanvasLayout());
      updateStatus(CHECKS.every(function (check) { return check.test(); }));
      resizeTrackingHelperIfReady();
    });
  }

  function onReady(err, sceneObjects) {
    if (err) {
      STATE.trackingStarted = false;
      STATE.trackingReady = false;
      STATE.debugReady = false;
      STATE.trackingError = String(err);
      setStartButtonState('Retry tracking', false);
      updateStatus(false);
      console.error('[recreate-shell] WebAR.Rocks failed:', err);
      return;
    }

    REFS.scene = sceneObjects && sceneObjects.threeScene;
    REFS.renderer = sceneObjects && sceneObjects.threeRenderer;
    REFS.follower = sceneObjects && sceneObjects.threeFaceFollowers && sceneObjects.threeFaceFollowers[0];

    if (!REFS.scene || !REFS.renderer || !REFS.follower) {
      STATE.trackingStarted = false;
      STATE.trackingReady = false;
      STATE.debugReady = false;
      STATE.trackingError = 'WebAR ready callback did not provide a neck follower.';
      setStartButtonState('Retry tracking', false);
      updateStatus(false);
      console.error('[recreate-shell] incomplete scene objects:', sceneObjects);
      return;
    }

    const sourceWidth = REFS.helper.get_sourceWidth ? REFS.helper.get_sourceWidth() : 0;
    const sourceHeight = REFS.helper.get_sourceHeight ? REFS.helper.get_sourceHeight() : 0;
    if (sourceWidth && sourceHeight) {
      _videoAspect = sourceWidth / sourceHeight;
      STATE.sourceSize = { width: sourceWidth, height: sourceHeight };
      const layout = layoutCanvases(_videoAspect);
      REFS.helper.resize(layout.bufferWidth, layout.bufferHeight);
    }

    configureRenderer();
    ensureSceneLighting();
    loadEnvironmentMap();
    buildDebugFollowerObject();
    REFS.neck = buildNeckModel();
    buildStaticChain();

    STATE.trackingReady = true;
    STATE.trackingError = null;
    setStartButtonState('Tracking started', true);
    updateStatus(true);
    console.log('[recreate-shell] WebAR ready. Follower:', REFS.follower);
  }

  function onBeforeRenderPose(detectStates) {
    const state = Array.isArray(detectStates) ? detectStates[0] : detectStates;
    STATE.motionUpdatedBeforeTrack = true;
    updateChainYawFade(state);
    updateNecklaceMotionStabilizer(state, 'pre-render');
  }

  function onTrack(detectStates, landmarksStabilized) {
    const state = Array.isArray(detectStates) ? detectStates[0] : detectStates;
    const landmarks = normalizeLandmarks(landmarksStabilized);
    STATE.lastDetection = {
      isDetected: Boolean(state && state.isDetected),
      detected: state && typeof state.detected === 'number' ? state.detected : null,
      landmarksCount: landmarks.length,
    };
    STATE.lastLandmarks = landmarks;
    if (!STATE.motionUpdatedBeforeTrack) {
      updateChainYawFade(state);
      updateNecklaceMotionStabilizer(state, 'post-render fallback');
    }
    STATE.motionUpdatedBeforeTrack = false;
    updateDebugPreview();
  }

  function startTracking() {
    if (STATE.trackingStarted || STATE.trackingReady) return;

    const allChecksOk = runDependencyChecks();
    if (!allChecksOk) return;

    const nn = NN_REGISTRY[ACTIVE_NN_KEY];
    STATE.trackingStarted = true;
    STATE.trackingReady = false;
    STATE.trackingError = null;
    setStartButtonState('Starting...', true);
    updateStatus(true);

    REFS.helper = WebARRocksFaceThreeHelper;
    const layout = layoutCanvases(_videoAspect);

    console.log(
      '[recreate-shell] starting tracking with',
      ASSET_BASE + nn.path,
      '(' + nn.points + ' points)'
    );

    try {
      REFS.helper.init({
        spec: {
          NNCPath: ASSET_BASE + nn.path,
          scanSettings: { threshold: nn.threshold },
          videoSettings: videoSettings(),
        },
        canvas: document.getElementById('WebARRocksFaceCanvas'),
        canvasThree: document.getElementById('threeCanvas'),
        solvePnPObjPointsPositions: SOLVEPNP_OBJPOINTS,
        solvePnPImgPointsLabels: ACTIVE_IMGPOINTS,
        landmarksStabilizerSpec: { beta: 5, forceFilterNNInputPxRange: nn.filter },
        rotationContraints: {
          order: 'YXZ',
          rotXFactor: PARAMS.ROT_PITCH,
          rotYFactor: PARAMS.ROT_YAW,
          rotZFactor: PARAMS.ROT_ROLL,
        },
        taaLevel: PARAMS.TAA_LEVEL,
        callbackReady: onReady,
        callbackBeforeRender: onBeforeRenderPose,
        callbackTrack: onTrack,
      });
    } catch (e) {
      STATE.trackingStarted = false;
      STATE.trackingReady = false;
      STATE.debugReady = false;
      STATE.trackingError = String(e && e.message ? e.message : e);
      setStartButtonState('Retry tracking', false);
      updateStatus(false);
      console.error('[recreate-shell] tracking init threw:', e);
    }

    return layout;
  }

  function bindControls() {
    const button = document.getElementById('startTracking');
    const debugToggle = document.getElementById('debugToggle');
    const debugClose = document.getElementById('debugClose');
    const axesToggle = document.getElementById('debugAxesToggle');
    const resetPeaks = document.getElementById('debugResetPeaks');
    const captureButton = document.getElementById('captureButton');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');

    if (button) button.addEventListener('click', startTracking);
    document.querySelectorAll('[data-metal]').forEach(function (metalButton) {
      metalButton.addEventListener('click', function () {
        setMetal(metalButton.getAttribute('data-metal'));
      });
    });
    document.querySelectorAll('[data-pendant-mode]').forEach(function (modeButton) {
      modeButton.addEventListener('click', function () {
        setPendantMode(modeButton.getAttribute('data-pendant-mode'));
      });
    });
    if (captureButton) captureButton.addEventListener('click', captureComposite);
    if (debugToggle) {
      debugToggle.addEventListener('click', function () {
        setDebugDrawerOpen(!STATE.debugDrawerOpen);
      });
    }
    if (debugClose) {
      debugClose.addEventListener('click', function () {
        setDebugDrawerOpen(false);
      });
    }
    if (axesToggle) {
      axesToggle.checked = STATE.showDebugAxes;
      axesToggle.addEventListener('change', function () {
        setDebugAxesVisible(axesToggle.checked);
      });
    }
    if (resetPeaks) {
      resetPeaks.addEventListener('click', resetMotionPeaks);
    }
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', function () {
        setMobileMenuCollapsed(!STATE.mobileMenuCollapsed);
      });
      setMobileMenuCollapsed(STATE.mobileMenuCollapsed);
    }
    window.addEventListener('keydown', handleGLBTransformDebugKey);

    renderProducts();
    highlightMetal(STATE.metal);
    highlightPendantMode(STATE.pendantMode);
    updateInfo(STATE.product);
    updateDebugPreview();
  }

  window.addEventListener('load', function () {
    console.log('[recreate-shell] page loaded');
    console.log('[recreate-shell] asset base:', ASSET_BASE);
    console.log('[recreate-shell] video settings:', videoSettings());

    layoutCanvases(_videoAspect);
    runDependencyChecks();
    bindControls();
    loadCatalog();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  });

  window.RecreateNecklace = {
    ASSET_BASE: ASSET_BASE,
    DEFAULT_VIDEO_ASPECT: DEFAULT_VIDEO_ASPECT,
    get videoAspect() {
      return _videoAspect;
    },
    layoutCanvases: layoutCanvases,
    videoSettings: videoSettings,
    startTracking: startTracking,
    loadCatalog: loadCatalog,
    setProduct: setProduct,
    setPendantMode: setPendantMode,
    setMetal: setMetal,
    captureComposite: captureComposite,
    renderCatalog: renderCatalog,
    updateInfo: updateInfo,
    highlightThumb: highlightThumb,
    get products() {
      return PRODUCTS.slice();
    },
    setDebugDrawerOpen: setDebugDrawerOpen,
    setDebugAxesVisible: setDebugAxesVisible,
    resetMotionPeaks: resetMotionPeaks,
    getState: function () {
      return Object.assign({ activeNN: NN_REGISTRY[ACTIVE_NN_KEY] }, STATE);
    },
    getRefs: function () {
      return Object.assign({}, REFS);
    },
  };
})();
