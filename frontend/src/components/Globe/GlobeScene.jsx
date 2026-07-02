import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import Earth from './Earth.jsx';
import Spaceship from './Spaceship.jsx';
import NewsMarker from './NewsMarker.jsx';
import { GLOBE_RADIUS, angularDistance, latLngToVec3 } from '../../utils/globeUtils.js';
import { QUALITY, IS_TOUCH } from '../../utils/quality.js';

// Minimum angular separation between markers (~14°)
const MIN_MARKER_ANGLE = 14 * Math.PI / 180;

// Fly speed (radians/sec the rig sweeps around the planet)
const SPIN_SPEED = 0.6;
const SHIP_ALT   = 0.20;      // base altitude above the surface
const MAX_TERRAIN = 0.35;     // ignore terrain spikes above this when hovering

// Autopilot ("fly to story"): steers with the same controls as the player.
const FLY_MAX_SPEED = 1.15;   // top angular speed (rad/s)
const FLY_GAIN      = 1.6;    // how aggressively it closes remaining distance
const FLY_ARRIVE    = 0.03;   // arrival threshold (rad)

// Camera zoom limits (multiplier on the default camera distance)
const ZOOM_MIN = 0.6, ZOOM_MAX = 1.8;

// Ship "facing" feel — it yaws to point where it's travelling and banks into turns.
const TURN_RATE = 4.5;        // how fast the nose swings toward travel dir (rad/s)
const BANK_K    = 1.3;        // bank per radian of remaining turn
const BANK_MAX  = 0.6;        // max bank angle (rad)
const PITCH_MAX = 0.14;       // slight nose-down lean at speed (rad)

// ── Chase-camera rig ──────────────────────────────────────────────────────────
// The Earth, stars and markers are FIXED in world space. Instead of spinning the
// globe, we orbit a rig (camera + ship) around it. The rig is advanced about its
// OWN axes, so W/A/S/D are always screen-relative and never invert — even when
// you've flown to the far side and the planet is "upside down".
//
// CAM_LOCAL_* is just the old fixed camera, expressed in the rig's local frame:
// camera out along +Z looking at the globe centre, +Y up. At rest the view is
// identical to before; flying rotates the whole rig.
const CAM_LOCAL_POS  = new THREE.Vector3(0, 0.3, 5.4);
const CAM_LOCAL_QUAT = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(CAM_LOCAL_POS, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
);

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ─── Exhaust trail (world space — particles drop behind the moving ship) ───────
function ExhaustTrail({ shipPosRef, velRef }) {
  const MAX = 24;
  const particlesRef = useRef([]);
  const lastAddRef   = useRef(0);
  const dummy        = useMemo(() => new THREE.Object3D(), []);

  const instancedMesh = useMemo(() => {
    const geo  = new THREE.SphereGeometry(1, 4, 3);
    const mat  = new THREE.MeshBasicMaterial({
      color: '#cccccc', transparent: true, opacity: 0.6, depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    dummy.scale.setScalar(0); dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, dummy.matrix);
    return mesh;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const speed = Math.hypot(velRef.current.x, velRef.current.y);
    const now   = Date.now();

    // Drop a puff at the ship's world position while moving — it stays put as the
    // ship flies on, leaving a trail behind.
    if (speed > 0.03 && now - lastAddRef.current > 45) {
      particlesRef.current.push({ pos: shipPosRef.current.clone(), age: 0 });
      lastAddRef.current = now;
    }

    particlesRef.current = particlesRef.current
      .map(p => ({ pos: p.pos, age: p.age + delta }))
      .filter(p => p.age < 0.6)
      .slice(-MAX);

    for (let i = 0; i < MAX; i++) {
      if (i < particlesRef.current.length) {
        const p = particlesRef.current[i];
        const t = 1 - p.age / 0.6;
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(0.05 * t);
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={instancedMesh} />;
}

// ─── Flight controller ─────────────────────────────────────────────────────────
function GlobeController({ articles, onOpenArticle, hasOpenCard, flyTo, onFlyEnd }) {
  // Group nearby stories into clusters so none silently overlap/disappear.
  const clusters = useMemo(() => {
    const result = [];
    for (const art of articles) {
      if (art.latitude == null || art.longitude == null) continue;
      const home = result.find(c =>
        angularDistance(art.latitude, art.longitude, c[0].latitude, c[0].longitude) < MIN_MARKER_ANGLE
      );
      if (home) home.push(art);
      else result.push([art]);
    }
    return result;
  }, [articles]);

  const { camera, gl, scene } = useThree();

  const shipWrapperRef = useRef();
  const shipAnimRef    = useRef();
  const keysRef        = useRef({});
  const velRef         = useRef({ x: 0, y: 0 });   // angular fly velocity (about local X / Y)
  const dragRef        = useRef({ active: false, lastX: 0, lastY: 0, velX: 0, velY: 0 });
  const pinchRef       = useRef(null);             // distance between two touch points
  const pointersRef    = useRef(new Map());
  const zoomRef        = useRef(1);                // smoothed camera-distance multiplier
  const zoomTargetRef  = useRef(1);
  const earthMeshRef   = useRef(null);             // found lazily; used for terrain height
  const terrainRay     = useMemo(() => { const r = new THREE.Raycaster(); r.firstHitOnly = true; return r; }, []);
  const _rayOrigin     = useMemo(() => new THREE.Vector3(), []);
  const _rayDir        = useMemo(() => new THREE.Vector3(), []);
  const _axisWorld     = useMemo(() => new THREE.Vector3(), []);
  const _invQuat       = useMemo(() => new THREE.Quaternion(), []);

  // Autopilot target — {dir, article}. Set from the story panel via `flyTo`.
  const flyRef = useRef(null);
  useEffect(() => {
    if (flyTo && flyTo.latitude != null && flyTo.longitude != null) {
      flyRef.current = {
        dir: latLngToVec3(flyTo.latitude, flyTo.longitude, 1).normalize(),
        article: flyTo,
      };
    } else {
      flyRef.current = null;
    }
  }, [flyTo]);

  // Rig orientation (ship) and a slightly-lagging camera orientation (chase feel).
  const orbitQuat  = useMemo(() => new THREE.Quaternion(), []);
  const camQuat    = useMemo(() => new THREE.Quaternion(), []);
  const shipDirRef = useRef(new THREE.Vector3(0, 0, 1));
  const shipPosRef = useRef(new THREE.Vector3(0, 0, GLOBE_RADIUS + SHIP_ALT));
  const shipRRef   = useRef(GLOBE_RADIUS + SHIP_ALT);
  const headingRef = useRef(0);
  const bankRef    = useRef(0);
  const pitchRef   = useRef(0);
  const _q = useMemo(() => ({
    x: new THREE.Quaternion(), y: new THREE.Quaternion(),
    yaw: new THREE.Quaternion(), pitch: new THREE.Quaternion(), bank: new THREE.Quaternion(),
  }), []);

  useEffect(() => {
    const down = (e) => { keysRef.current[e.key] = true; };
    const up   = (e) => { keysRef.current[e.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, []);

  // Pointer drag / touch flight + pinch and wheel zoom. Listeners live on the
  // canvas so gestures starting on a news card (a DOM overlay) don't move the ship.
  useEffect(() => {
    const el = gl.domElement;
    const CAP = SPIN_SPEED * 2.5;
    const pointers = pointersRef.current;

    const pinchDist = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // Second finger down → switch from drag to pinch.
        dragRef.current.active = false;
        pinchRef.current = pinchDist();
        return;
      }
      dragRef.current.active = true;
      dragRef.current.lastX  = e.clientX;
      dragRef.current.lastY  = e.clientY;
      dragRef.current.velX = dragRef.current.velY = 0;
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2 && pinchRef.current) {
        const d = pinchDist();
        if (d > 0) {
          zoomTargetRef.current = THREE.MathUtils.clamp(
            zoomTargetRef.current * (pinchRef.current / d), ZOOM_MIN, ZOOM_MAX,
          );
          pinchRef.current = d;
        }
        return;
      }
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      // Drag the planet: dragging right flies the ship left, dragging down flies up.
      dragRef.current.velY = THREE.MathUtils.clamp(dx / window.innerWidth  * 14, -CAP, CAP);
      dragRef.current.velX = THREE.MathUtils.clamp(dy / window.innerHeight * 14, -CAP, CAP);
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchRef.current = null;
      if (pointers.size === 1) {
        // Pinch ended with one finger still down — hand it back to drag-to-fly.
        const [rest] = pointers.values();
        dragRef.current.active = true;
        dragRef.current.lastX  = rest.x;
        dragRef.current.lastY  = rest.y;
        dragRef.current.velX = dragRef.current.velY = 0;
      }
      if (pointers.size === 0) dragRef.current.active = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e) => {
      zoomTargetRef.current = THREE.MathUtils.clamp(
        zoomTargetRef.current * Math.exp(e.deltaY * 0.001), ZOOM_MIN, ZOOM_MAX,
      );
    };

    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const k     = keysRef.current;
    const fwd   = k['w'] || k['W'] || k['ArrowUp'];
    const back  = k['s'] || k['S'] || k['ArrowDown'];
    const left  = k['a'] || k['A'] || k['ArrowLeft'];
    const right = k['d'] || k['D'] || k['ArrowRight'];

    // Target fly velocity. X spins the rig about its screen-horizontal axis (N/S),
    // Y about its screen-vertical axis (E/W). Flip a sign here if W/S or A/D feels
    // reversed — the no-inversion property holds either way.
    let tgtX = fwd  ? -SPIN_SPEED : back  ? SPIN_SPEED : 0;
    let tgtY = left ? -SPIN_SPEED : right ? SPIN_SPEED : 0;

    if (dragRef.current.active) {
      tgtX = dragRef.current.velX;
      tgtY = dragRef.current.velY;
      dragRef.current.velX *= 0.85;
      dragRef.current.velY *= 0.85;
    }

    // ── Autopilot: steer toward the requested story using the same controls the
    // player has, so banking/trail/heading all behave naturally. Any manual
    // input cancels it.
    if (flyRef.current) {
      const userInput = fwd || back || left || right || dragRef.current.active;
      if (userInput) {
        flyRef.current = null;
        onFlyEnd?.(null);                                  // cancelled — player took over
      } else {
        const t = flyRef.current;
        const cur = shipDirRef.current;
        const angle = cur.angleTo(t.dir);
        if (angle < FLY_ARRIVE) {
          flyRef.current = null;
          onFlyEnd?.(t.article);                           // arrived — open the story
        } else {
          _axisWorld.crossVectors(cur, t.dir);
          if (_axisWorld.lengthSq() > 1e-10) {
            _axisWorld.normalize();
            _invQuat.copy(orbitQuat).invert();
            _axisWorld.applyQuaternion(_invQuat);         // rig-local rotation axis (z ≈ 0)
            const speed = Math.min(FLY_MAX_SPEED, FLY_GAIN * angle);
            tgtX = _axisWorld.x * speed;
            tgtY = _axisWorld.y * speed;
          } else {
            tgtX = FLY_MAX_SPEED;                          // antipodal target — pitch away
          }
        }
      }
    }

    const smooth = 1 - Math.pow(0.008, delta);
    velRef.current.x = THREE.MathUtils.lerp(velRef.current.x, tgtX, smooth);
    velRef.current.y = THREE.MathUtils.lerp(velRef.current.y, tgtY, smooth);

    // Advance the rig about its OWN axes (post-multiply = local frame). This is the
    // key fix: controls are always relative to the current view, never the world.
    _q.x.setFromAxisAngle(X_AXIS, velRef.current.x * delta);
    _q.y.setFromAxisAngle(Y_AXIS, velRef.current.y * delta);
    orbitQuat.multiply(_q.x).multiply(_q.y).normalize();

    // Camera trails the ship slightly for a chase feel.
    camQuat.slerp(orbitQuat, 1 - Math.pow(0.0006, delta));

    // ── Ship position, terrain-aware altitude ──
    // Raycast the actual Earth mesh below the ship (BVH-accelerated) so the
    // hover height follows the real rendered terrain, not an approximate map.
    shipDirRef.current.set(0, 0, 1).applyQuaternion(orbitQuat);
    if (!earthMeshRef.current) {
      earthMeshRef.current = scene.getObjectByName('earth-surface') || null;
    }
    let surfaceR = GLOBE_RADIUS;
    if (earthMeshRef.current) {
      _rayOrigin.copy(shipDirRef.current).multiplyScalar(GLOBE_RADIUS * 1.6);
      _rayDir.copy(shipDirRef.current).negate();
      terrainRay.set(_rayOrigin, _rayDir);
      const hit = terrainRay.intersectObject(earthMeshRef.current, false)[0];
      if (hit) {
        surfaceR = THREE.MathUtils.clamp(hit.point.length(), GLOBE_RADIUS, GLOBE_RADIUS + MAX_TERRAIN);
      }
    }
    const targetR = surfaceR + SHIP_ALT;
    shipRRef.current = THREE.MathUtils.lerp(shipRRef.current, targetR, 1 - Math.pow(0.0008, delta));
    shipPosRef.current.copy(shipDirRef.current).multiplyScalar(shipRRef.current);
    if (shipWrapperRef.current) {
      shipWrapperRef.current.position.copy(shipPosRef.current);
      shipWrapperRef.current.quaternion.copy(orbitQuat);
    }

    // ── Ship visual: yaw nose toward travel, bank into turns, slight pitch ──
    if (shipAnimRef.current) {
      const vx = velRef.current.x, vy = velRef.current.y;
      const speed = Math.hypot(vx, vy);
      // Travel direction in the ship's tangent plane (nose = +Y at heading 0).
      const target = speed > 0.02 ? Math.atan2(-vy, -vx) : headingRef.current;
      const d = Math.atan2(Math.sin(target - headingRef.current), Math.cos(target - headingRef.current));
      headingRef.current += THREE.MathUtils.clamp(d, -TURN_RATE * delta, TURN_RATE * delta);

      const s = 1 - Math.pow(0.0001, delta);
      const bankTarget  = THREE.MathUtils.clamp(-d * BANK_K, -BANK_MAX, BANK_MAX);
      const pitchTarget = -Math.min(speed / SPIN_SPEED, 1) * PITCH_MAX;
      bankRef.current  = THREE.MathUtils.lerp(bankRef.current, bankTarget, s);
      pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, pitchTarget, s);

      _q.yaw.setFromAxisAngle(Z_AXIS, headingRef.current);
      _q.pitch.setFromAxisAngle(X_AXIS, pitchRef.current);
      _q.bank.setFromAxisAngle(Y_AXIS, bankRef.current);
      shipAnimRef.current.quaternion.copy(_q.yaw).multiply(_q.pitch).multiply(_q.bank);
    }

    // ── Drive the camera from the (lagged) rig, with smoothed zoom ──
    zoomRef.current = THREE.MathUtils.lerp(zoomRef.current, zoomTargetRef.current, 1 - Math.pow(0.002, delta));
    camera.position.copy(CAM_LOCAL_POS).multiplyScalar(zoomRef.current).applyQuaternion(camQuat);
    camera.quaternion.copy(camQuat).multiply(CAM_LOCAL_QUAT);
  });

  return (
    <>
      {/* ── Fixed world: Earth, space, markers ─────────────────────────────── */}
      <Earth />

      <Stars radius={90} depth={55} count={QUALITY.stars} factor={4} saturation={0.3} fade={false} />

      {/* Sun visual — near the horizon behind/beside Earth */}
      <group position={[5, 2.5, -12]}>
        <mesh>
          <sphereGeometry args={[1.6, 10, 10]} />
          <meshBasicMaterial color="#FFF5A0" />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.2, 10, 10]} />
          <meshBasicMaterial color="#FFE566" transparent opacity={0.22} side={THREE.BackSide} depthWrite={false} />
        </mesh>
        {[2.8, 3.6, 4.6].map((r, i) => (
          <mesh key={i} rotation={[Math.PI / 2 + i * 0.35, 0, i * 0.6]}>
            <torusGeometry args={[r, 0.09, 4, 18]} />
            <meshBasicMaterial color="#FFE066" transparent opacity={0.18 - i * 0.05} depthWrite={false} />
          </mesh>
        ))}
        {[0, 30, 60, 90, 120, 150, 15, 45, 75, 105, 135, 165].map((deg, i) => (
          <mesh key={`ray-${i}`} rotation={[0, 0, deg * Math.PI / 180]}>
            <planeGeometry args={[0.12, 28]} />
            <meshBasicMaterial color="#FFF4B0" transparent opacity={i < 6 ? 0.07 : 0.04} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* Decorative distant planets */}
      <group position={[-55, 18, -30]}>
        <mesh>
          <sphereGeometry args={[4.5, 10, 10]} />
          <meshBasicMaterial color="#7B5EA7" />
        </mesh>
        <mesh rotation={[Math.PI * 0.18, 0, 0]}>
          <torusGeometry args={[7.0, 0.55, 5, 22]} />
          <meshBasicMaterial color="#9B7FC7" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
      <mesh position={[48, -22, -55]}>
        <sphereGeometry args={[2.8, 10, 10]} />
        <meshBasicMaterial color="#C1653A" />
      </mesh>
      <mesh position={[-35, -30, 60]}>
        <sphereGeometry args={[1.8, 8, 8]} />
        <meshBasicMaterial color="#7EC8E3" />
      </mesh>

      {clusters.map(cluster => (
        <NewsMarker
          key={cluster[0].id}
          cluster={cluster}
          shipDirRef={shipDirRef}
          onOpen={onOpenArticle}
          hasOpenCard={hasOpenCard}
        />
      ))}

      {/* ── Moving ship + its world-space trail ────────────────────────────── */}
      <group ref={shipWrapperRef}>
        <group ref={shipAnimRef}>
          <Spaceship />
        </group>
      </group>
      <ExhaustTrail shipPosRef={shipPosRef} velRef={velRef} />
    </>
  );
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.35} color="#b8d4ff" />
      <directionalLight position={[5, 3, 5]}  intensity={0.9} color="#fff8e8" castShadow />
      <directionalLight position={[-3, -2, -5]} intensity={0.2} color="#4466ff" />
      <pointLight position={[5, 2.5, -12]} color="#fff8e8" intensity={1.6} distance={120} decay={0.8} />
    </>
  );
}

// Progress overlay while the 3D models (~1.6 MB) stream in, so slow connections
// see a loading bar instead of an empty half-built planet.
function AssetLoader() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active && progress >= 100) setDone(true);
    // Safety valve: never hold the overlay hostage if a loader misreports.
    const t = setTimeout(() => setDone(true), 8000);
    return () => clearTimeout(t);
  }, [active, progress]);

  if (done) return null;
  return (
    <div className="asset-loader">
      <div className="asset-loader-globe">🌍</div>
      <div className="asset-loader-track">
        <div className="asset-loader-bar" style={{ width: `${Math.max(6, progress)}%` }} />
      </div>
      <div className="asset-loader-label">Preparing the planet… {Math.round(progress)}%</div>
    </div>
  );
}

export default function GlobeScene({ articles, onOpenArticle, activeArticle, flyTo, onFlyEnd }) {
  return (
    <div className="globe-page">
      <Canvas
        camera={{ position: [0, 0.3, 5.4], fov: 52, near: 0.1, far: 200 }}
        dpr={QUALITY.dpr}
        gl={{ antialias: QUALITY.antialias, alpha: false, powerPreference: 'high-performance' }}
        style={{ background: '#000510' }}
        shadows={QUALITY.shadows}
      >
        <Suspense fallback={null}>
          <Lighting />
          <GlobeController
            articles={articles}
            onOpenArticle={onOpenArticle}
            hasOpenCard={!!activeArticle}
            flyTo={flyTo}
            onFlyEnd={onFlyEnd}
          />
        </Suspense>
      </Canvas>

      <AssetLoader />

      <div className="controls-hint">
        <span className="controls-hint-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span>
        <span>{IS_TOUCH ? 'drag to fly · pinch to zoom' : 'or drag to fly · scroll to zoom'}</span>
        <span>·</span>
        <span>Tap a story to read it</span>
      </div>
    </div>
  );
}
