import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { latLngToVec3, GLOBE_RADIUS } from '../../utils/globeUtils.js';
import { IS_TOUCH } from '../../utils/quality.js';

export const CATEGORY_COLORS = {
  animals:      '#7EE8A2',
  ocean:        '#4ECDC4',
  forest:       '#2ecc71',
  climate:      '#FFE066',
  conservation: '#FF6B6B',
  discovery:    '#a78bfa',
  environment:  '#60a5fa',
};

export const CATEGORY_ICONS = {
  animals:      '🦁',
  ocean:        '🐳',
  forest:       '🌳',
  climate:      '☀️',
  conservation: '🌿',
  discovery:    '🔭',
  environment:  '🌍',
};

// You must fly the ship almost directly onto a marker before its prompt appears.
// Kept below half the 14° inter-marker spacing so only one prompt is active at once.
const SHOW_ANGLE = 0.11;

// `cluster` is an array of one or more articles sharing roughly the same spot.
// The marker is anchored on the first (newest) article; opening hands the whole
// cluster to the modal so the reader can page through co-located stories.
//
// Flying onto a marker shows a small "Open story?" prompt — the reader chooses
// to open it (click/tap or press E). Nothing auto-opens, so closing the modal
// while parked on a marker never re-opens it.
export default function NewsMarker({ cluster, shipDirRef, onOpen, hasOpenCard }) {
  const primary = cluster[0];
  const count   = cluster.length;

  const dotRef     = useRef();
  const glow1Ref   = useRef();
  const glow2Ref   = useRef();
  const facingRef  = useRef(0);      // read by the tap handler (front hemisphere only)
  const isNearRef  = useRef(false);  // read by the key handler
  const openRef    = useRef(hasOpenCard);
  openRef.current  = hasOpenCard;
  const [isNear, setIsNear] = useState(false);

  // Raised above the highest possible terrain so markers never sink into mountains.
  const localPos = latLngToVec3(primary.latitude, primary.longitude, GLOBE_RADIUS + 0.30);
  // The Earth is fixed in world space, so the marker's direction is constant.
  const markerDir = useMemo(() => localPos.clone().normalize(), [localPos]);
  const color    = CATEGORY_COLORS[primary.category] || '#7EE8A2';

  // Press E while parked on this marker to open it (desktop). Reads refs so the
  // listener never needs re-subscribing per frame.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'e' || e.key === 'E') && isNearRef.current && !openRef.current) {
        onOpen(cluster);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cluster, onOpen]);

  useFrame(() => {
    if (!dotRef.current || !shipDirRef?.current) return;

    const shipDir = shipDirRef.current;
    const facing  = markerDir.dot(shipDir);     // 1 = ship directly above, <0 = far side
    facingRef.current = facing;

    const show = markerDir.angleTo(shipDir) < SHOW_ANGLE;
    isNearRef.current = show;
    // Only push state when it actually changes — avoids a re-render every frame.
    if (show !== isNear) setIsNear(show);

    const t = Date.now();
    const pulse = 1 + Math.sin(t * 0.003) * 0.18;

    dotRef.current.scale.setScalar(pulse);

    // Visible only on the hemisphere facing the ship/camera (hide the far side).
    const visible = !hasOpenCard && facing > 0;
    dotRef.current.material.opacity = visible ? 1 : 0;

    if (glow1Ref.current) {
      glow1Ref.current.scale.setScalar(1 + Math.sin(t * 0.002) * 0.22);
      glow1Ref.current.material.opacity = visible ? 0.28 + Math.sin(t * 0.002) * 0.08 : 0;
    }
    if (glow2Ref.current) {
      glow2Ref.current.scale.setScalar(1 + Math.sin(t * 0.0015 + 1) * 0.3);
      glow2Ref.current.material.opacity = visible ? 0.10 + Math.sin(t * 0.0015) * 0.04 : 0;
    }
  });

  return (
    <group position={localPos}>
      {/* Invisible, generous hit target — tap/click any marker on the facing
          hemisphere to open it directly (no need to fly onto it first).
          e.delta filters out drags so flying never accidentally opens cards. */}
      <mesh
        onClick={(e) => {
          if (e.delta < 8 && facingRef.current > 0.1 && !hasOpenCard) {
            e.stopPropagation();
            onOpen(cluster);
          }
        }}
      >
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Dot */}
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.020, 8, 8]} />
        <meshBasicMaterial color={color} transparent />
      </mesh>

      {/* Inner glow halo */}
      <mesh ref={glow1Ref}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>

      {/* Outer glow halo */}
      <mesh ref={glow2Ref}>
        <sphereGeometry args={[0.095, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.10} depthWrite={false} />
      </mesh>

      {/* Point light to illuminate the globe surface around the marker */}
      {!hasOpenCard && (
        <pointLight color={color} intensity={0.55} distance={0.75} decay={2} />
      )}

      {/* Glow ring — hidden when card is open */}
      {!hasOpenCard && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.032, 0.005, 8, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      )}

      {/* Small "Open story?" prompt — shown when parked on the marker. The full
          card only opens when the reader asks for it. */}
      {isNear && !hasOpenCard && (
        <Html
          position={[0, 0.06, 0]}
          center
          distanceFactor={4}
          style={{ pointerEvents: 'auto' }}
        >
          <button
            className="news-mini-card"
            onClick={() => onOpen(cluster)}
            style={{ borderColor: `${color}80` }}
          >
            <span className="news-mini-icon">{CATEGORY_ICONS[primary.category] || '🌍'}</span>
            <span className="news-mini-label">
              Open {count > 1 ? `${count} stories` : 'story'}?
            </span>
            {!IS_TOUCH && <kbd className="news-mini-kbd">E</kbd>}
          </button>
        </Html>
      )}

      {/* Count badge for clusters */}
      {count > 1 && !hasOpenCard && (
        <Html position={[0.05, 0.05, 0]} center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div className="news-cluster-badge" style={{ background: color }}>{count}</div>
        </Html>
      )}
    </group>
  );
}
