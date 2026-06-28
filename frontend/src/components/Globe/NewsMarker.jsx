import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { latLngToVec3, GLOBE_RADIUS } from '../../utils/globeUtils.js';

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

// You must fly the ship almost directly onto a marker before its card appears.
// Kept below half the 14° inter-marker spacing so only one card is active at once.
const SHOW_ANGLE = 0.11;
const DWELL_MS   = 1600;

// `cluster` is an array of one or more articles sharing roughly the same spot.
// The marker is anchored on the first (newest) article; opening hands the whole
// cluster to the modal so the reader can page through co-located stories.
export default function NewsMarker({ cluster, shipDirRef, onOpen, hasOpenCard }) {
  const primary = cluster[0];
  const count   = cluster.length;

  const dotRef     = useRef();
  const glow1Ref   = useRef();
  const glow2Ref   = useRef();
  const dwellStart = useRef(null);

  const dwellBarRef   = useRef(null);
  const dwellLabelRef = useRef(null);
  const [isNear, setIsNear] = useState(false);

  // Raised above the highest possible terrain so markers never sink into mountains.
  const localPos = latLngToVec3(primary.latitude, primary.longitude, GLOBE_RADIUS + 0.30);
  // The Earth is fixed in world space now, so the marker's direction is constant.
  const markerDir = useMemo(() => localPos.clone().normalize(), [localPos]);
  const color    = CATEGORY_COLORS[primary.category] || '#7EE8A2';

  useFrame(() => {
    if (!dotRef.current || !shipDirRef?.current) return;

    const shipDir = shipDirRef.current;
    const facing  = markerDir.dot(shipDir);     // 1 = ship directly above, <0 = far side

    const show = markerDir.angleTo(shipDir) < SHOW_ANGLE;
    // Only push state when it actually changes — avoids a re-render every frame.
    if (show !== isNear) setIsNear(show);

    // Dwell — update DOM directly so the bar fills reliably at 60fps
    if (show && !hasOpenCard) {
      if (!dwellStart.current) dwellStart.current = Date.now();
      const progress = Math.min(1, (Date.now() - dwellStart.current) / DWELL_MS);
      if (dwellBarRef.current)   dwellBarRef.current.style.width = `${progress * 100}%`;
      if (dwellLabelRef.current) dwellLabelRef.current.textContent = progress > 0.02 ? 'Opening…' : 'Tap, or hold still to open';
      if (progress >= 1) {
        dwellStart.current = null;
        if (dwellBarRef.current) dwellBarRef.current.style.width = '0%';
        onOpen(cluster);
      }
    } else if (dwellStart.current) {
      dwellStart.current = null;
      if (dwellBarRef.current)   dwellBarRef.current.style.width = '0%';
      if (dwellLabelRef.current) dwellLabelRef.current.textContent = 'Tap, or hold still to open';
    }

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

      {/* HTML card — only when near and no card is open */}
      {isNear && !hasOpenCard && (
        <Html
          position={[0, 0.06, 0]}
          center
          distanceFactor={4}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            className="news-card-popup"
            onClick={() => onOpen(cluster)}
            style={{ borderTop: `3px solid ${color}` }}
          >
            {primary.image_url && (
              <div
                className="news-card-image"
                style={{ backgroundImage: `url("${primary.image_url}")` }}
              />
            )}
            <div className="news-card-source">
              {CATEGORY_ICONS[primary.category] || '🌍'} {primary.source}
            </div>
            <div className="news-card-title">
              {primary.title.length > 75
                ? primary.title.slice(0, 75) + '…'
                : primary.title}
            </div>
            <div className="news-card-footer">
              <span
                className="news-card-category"
                style={{ background: `${color}22`, color }}
              >
                {primary.category}
              </span>
              {count > 1 && (
                <span className="news-card-more">+{count - 1} more here</span>
              )}
            </div>

            <div className="news-card-dwell">
              <div
                ref={dwellBarRef}
                className="news-card-dwell-bar"
                style={{ width: '0%', transition: 'none' }}
              />
            </div>
            <div
              ref={dwellLabelRef}
              style={{ fontSize: 10, color: '#aaa', marginTop: 4, fontStyle: 'italic' }}
            >
              Tap, or hold still to open
            </div>
          </div>
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
