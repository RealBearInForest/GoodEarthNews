import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Low-poly cartoon airplane. Fuselage along local Y (nose = +Y, tail = -Y).
// Propeller at the nose tip, spinning around Y. Wings horizontal along X.
export default function Airplane({ speed = 0 }) {
  const propRef = useRef();
  const bodyRef = useRef();

  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.y += delta * (18 + speed * 14);
    }
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(Date.now() * 0.0015) * 0.04;
    }
  });

  return (
    <group scale={0.07}>
      <group ref={bodyRef}>

        {/* ── Fuselage ── 6-sided low-poly */}
        <mesh>
          <cylinderGeometry args={[0.18, 0.26, 1.6, 6]} />
          <meshToonMaterial color="#FFE566" flatShading />
        </mesh>

        {/* ── Nose cone ── 6-sided */}
        <mesh position={[0, 0.95, 0]}>
          <coneGeometry args={[0.18, 0.52, 6]} />
          <meshToonMaterial color="#FFE566" flatShading />
        </mesh>

        {/* ── Cockpit glass ── */}
        <mesh position={[0, 0.42, 0.14]}>
          <sphereGeometry args={[0.14, 5, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial color="#89D4F5" transparent opacity={0.85} flatShading />
        </mesh>

        {/* ── Main wings ── */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.11, 1.9, 0.52]} />
          <meshToonMaterial color="#FF6B6B" flatShading />
        </mesh>

        {/* ── Wing tips (angled) ── */}
        <mesh position={[ 0.95, 0.05, 0]} rotation={[0, 0,  Math.PI / 8]}>
          <boxGeometry args={[0.08, 0.34, 0.3]} />
          <meshToonMaterial color="#FF8E53" flatShading />
        </mesh>
        <mesh position={[-0.95, 0.05, 0]} rotation={[0, 0, -Math.PI / 8]}>
          <boxGeometry args={[0.08, 0.34, 0.3]} />
          <meshToonMaterial color="#FF8E53" flatShading />
        </mesh>

        {/* ── Tail fin (vertical) ── */}
        <mesh position={[0, -0.6, -0.16]} rotation={[Math.PI / 10, 0, 0]}>
          <boxGeometry args={[0.08, 0.55, 0.42]} />
          <meshToonMaterial color="#FF6B6B" flatShading />
        </mesh>

        {/* ── Horizontal stabilizer ── */}
        <mesh position={[0, -0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.08, 0.88, 0.28]} />
          <meshToonMaterial color="#FF6B6B" flatShading />
        </mesh>

        {/* ── Propeller hub (at nose tip) ── */}
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.07, 5, 4]} />
          <meshToonMaterial color="#333" flatShading />
        </mesh>

        {/* ── Propeller (spins around Y = nose axis) ── */}
        <group ref={propRef} position={[0, 1.22, 0]}>
          <mesh position={[0.27, 0, 0]}>
            <boxGeometry args={[0.54, 0.07, 0.04]} />
            <meshToonMaterial color="#444" flatShading />
          </mesh>
          <mesh position={[0, 0, 0.27]}>
            <boxGeometry args={[0.04, 0.07, 0.54]} />
            <meshToonMaterial color="#444" flatShading />
          </mesh>
        </group>

        {/* ── Exhaust puffs ── */}
        {[0, -0.14, -0.28].map((offset, i) => (
          <mesh key={i} position={[0, -0.9 - offset * 0.28, 0]}>
            <sphereGeometry args={[0.06 - i * 0.014, 4, 3]} />
            <meshToonMaterial
              color="white"
              transparent
              opacity={0.6 - i * 0.18}
              flatShading
            />
          </mesh>
        ))}

      </group>
    </group>
  );
}
