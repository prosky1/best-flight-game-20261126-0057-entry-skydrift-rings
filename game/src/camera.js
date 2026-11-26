// The chase camera and the perspective projection. The camera trails behind
// and above the aircraft, smoothed so it never fights the pilot, with the
// horizon tilted a little by the bank. Polygons are clipped against the near
// plane in camera space before projection, so terrain never smears across
// the screen when the pilot flies low.
import { aircraftBasis } from './flight-model.js';

const NEAR = 0.8;
const FOV = (64 * Math.PI) / 180;

/** A camera that starts parked behind the start pose. */
export function createCamera(flight) {
  const basis = aircraftBasis(flight);
  return {
    x: flight.x - basis.forward.x * 10.5 + basis.up.x * 4.4,
    y: flight.y - basis.forward.y * 10.5 + basis.up.y * 4.4,
    z: flight.z - basis.forward.z * 10.5 + basis.up.z * 4.4,
    lookX: flight.x + basis.forward.x * 30,
    lookY: flight.y + basis.forward.y * 30,
    lookZ: flight.z + basis.forward.z * 30,
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    focal: 1,
    cx: 0,
    cy: 0,
  };
}

function normalise(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Trail the aircraft: desired position behind/above, look point ahead,
 * both exponentially smoothed. The up hint blends world-up with the
 * aircraft's own up so banking tilts the horizon without rolling the world.
 */
export function updateCamera(camera, flight, terrain, dt) {
  const basis = aircraftBasis(flight);
  const back = 10.5;
  const rise = 4.4;
  const side = 1.5; // a touch off-axis, so the fuselage and tail read in profile
  const wantX = flight.x - basis.forward.x * back + basis.up.x * rise + basis.right.x * side;
  const wantY = flight.y - basis.forward.y * back + basis.up.y * rise + basis.right.y * side;
  const wantZ = flight.z - basis.forward.z * back + basis.up.z * rise + basis.right.z * side;
  const k = 1 - Math.exp(-dt * 4.2);
  camera.x += (wantX - camera.x) * k;
  camera.y += (wantY - camera.y) * k;
  camera.z += (wantZ - camera.z) * k;
  // Never let the camera sink into a hillside.
  const floor = terrain.heightAt(camera.x, camera.z) + 2.5;
  if (camera.y < floor) camera.y = floor;
  if (camera.y < 2.5) camera.y = 2.5;
  const lookK = 1 - Math.exp(-dt * 6);
  camera.lookX += (flight.x + basis.forward.x * 30 - camera.lookX) * lookK;
  camera.lookY += (flight.y + basis.forward.y * 30 - camera.lookY) * lookK;
  camera.lookZ += (flight.z + basis.forward.z * 30 - camera.lookZ) * lookK;
  const forward = normalise({ x: camera.lookX - camera.x, y: camera.lookY - camera.y, z: camera.lookZ - camera.z });
  const upHint = normalise({
    x: basis.up.x * 0.35,
    y: 1 + basis.up.y * 0.35 - 0.35,
    z: basis.up.z * 0.35,
  });
  const right = normalise({
    x: forward.y * upHint.z - forward.z * upHint.y,
    y: forward.z * upHint.x - forward.x * upHint.z,
    z: forward.x * upHint.y - forward.y * upHint.x,
  });
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  camera.forward = forward;
  camera.right = right;
  camera.up = up;
}

/** Set the projection for a canvas of the given pixel size. */
export function setViewport(camera, width, height) {
  camera.cx = width / 2;
  camera.cy = height / 2;
  camera.focal = (height / 2) / Math.tan(FOV / 2);
}

/** World point to camera space: x right, y up, z forward (visible when z > NEAR). */
export function toCamera(camera, x, y, z) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const dz = z - camera.z;
  return {
    x: dx * camera.right.x + dy * camera.right.y + dz * camera.right.z,
    y: dx * camera.up.x + dy * camera.up.y + dz * camera.up.z,
    z: dx * camera.forward.x + dy * camera.forward.y + dz * camera.forward.z,
  };
}

/** Camera-space point to screen pixels. Caller ensures z > NEAR. */
export function project(camera, point) {
  return {
    x: camera.cx + (point.x * camera.focal) / point.z,
    y: camera.cy - (point.y * camera.focal) / point.z,
    depth: point.z,
  };
}

/** Project a world point, or null when it is behind the near plane. */
export function projectWorld(camera, x, y, z) {
  const point = toCamera(camera, x, y, z);
  if (point.z <= NEAR) return null;
  return project(camera, point);
}

/**
 * Clip a camera-space polygon against the near plane (Sutherland–Hodgman,
 * one plane). Returns the clipped polygon, possibly empty.
 */
export function clipNear(polygon) {
  const out = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentIn = current.z > NEAR;
    const nextIn = next.z > NEAR;
    if (currentIn) out.push(current);
    if (currentIn !== nextIn) {
      const t = (NEAR - current.z) / (next.z - current.z);
      out.push({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
        z: NEAR,
      });
    }
  }
  return out;
}
