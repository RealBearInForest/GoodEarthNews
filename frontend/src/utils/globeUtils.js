import * as THREE from 'three';

export const GLOBE_RADIUS = 2;
export const AIRPLANE_ALTITUDE = 2.18;

// Convert lat/lng to 3D position on sphere
export function latLngToVec3(lat, lng, radius = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Get north tangent vector at (lat, lng)
export function getNorthVector(lat, lng) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -Math.cos(phi) * Math.cos(theta),
    -Math.sin(phi),
    -Math.cos(phi) * Math.sin(theta)
  ).normalize();
}

// Get east tangent vector at (lat, lng)
export function getEastVector(lat, lng) {
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    Math.sin(theta),
    0,
    -Math.cos(theta)
  ).normalize();
}

// Get forward direction based on heading (0=north, 90=east)
export function getForwardVector(lat, lng, heading) {
  const h = heading * (Math.PI / 180);
  const north = getNorthVector(lat, lng);
  const east = getEastVector(lat, lng);
  return north.clone().multiplyScalar(Math.cos(h))
    .add(east.clone().multiplyScalar(Math.sin(h)));
}

// Angular distance between two lat/lng points (radians)
export function angularDistance(lat1, lng1, lat2, lng2) {
  const p1 = latLngToVec3(lat1, lng1, 1);
  const p2 = latLngToVec3(lat2, lng2, 1);
  return Math.acos(Math.min(1, Math.max(-1, p1.dot(p2))));
}

// Get quaternion to orient object on sphere surface facing heading
export function getSurfaceQuaternion(lat, lng, heading = 0) {
  const position = latLngToVec3(lat, lng, 1);
  const up = position.clone().normalize();
  const forward = getForwardVector(lat, lng, heading);
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  // Re-orthogonalize forward
  const correctedForward = new THREE.Vector3().crossVectors(right, up).normalize();

  const matrix = new THREE.Matrix4();
  matrix.makeBasis(right, up, correctedForward.negate());
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}
