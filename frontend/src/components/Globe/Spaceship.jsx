import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Low-poly spaceship (converted from the Sketchfab .blend). The GLB was
// pre-oriented to the same convention the flight rig expects:
//   nose → +Y, top → +Z (toward camera), wings → X, centred on the origin.
// So GlobeScene's yaw/bank/pitch and the exhaust trail all work unchanged.
useGLTF.preload('/models/spaceship.glb');

// Overall size on the globe (the exported model is ~2 units long).
const SHIP_SCALE = 0.075;

export default function Spaceship() {
  const bobRef = useRef();
  const { scene } = useGLTF('/models/spaceship.glb');

  const model = useMemo(() => {
    const clone = scene.clone(true);
    // Clean low-poly sci-fi material with a faint cyan glow to match the palette.
    const mat = new THREE.MeshStandardMaterial({
      color: '#b9c6d6', metalness: 0.45, roughness: 0.45, flatShading: true,
      emissive: '#1d3b3a', emissiveIntensity: 0.5,
    });
    clone.traverse((c) => {
      if (c.isMesh) {
        c.material = mat;
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Gentle idle hover + sway so it feels alive while flying.
  useFrame(() => {
    if (!bobRef.current) return;
    const t = Date.now() * 0.0015;
    bobRef.current.position.z = Math.sin(t) * 0.012;        // hover off the surface
    bobRef.current.rotation.y = Math.sin(t * 0.7) * 0.035;  // subtle roll sway
  });

  return (
    <group ref={bobRef} scale={SHIP_SCALE}>
      <primitive object={model} />
    </group>
  );
}
