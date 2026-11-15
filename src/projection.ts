// Screen <-> sphere projection helpers shared by the gesture handlers.
//
// Angles use the player's convention: yaw and pitch in degrees, where the
// view direction is (cos(pitch) cos(yaw), sin(pitch), cos(pitch) sin(yaw)),
// yaw grows to the right and pitch grows upwards. The camera never rolls, so
// its right vector is always horizontal. Screen points are CSS pixels
// relative to the top-left corner of the player and hfov spans the width,
// matching how the player feeds Three.js its vertical FOV.
//
// This module has no Three.js dependency so the math can be unit tested on
// its own.

export type Direction = [number, number, number];

export interface ViewAngles {
  yaw: number;
  pitch: number;
  hfov: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

// 'continuous' is for gestures that move a little between pointer events
// (drags, pinches, inertia). 'jump' is for one-off moves that may turn the
// camera far in a single step, such as zooming toward the cursor.
export type AnchorMotion = 'continuous' | 'jump';

export interface AnchoredView {
  yaw: number;
  pitch: number;
  // True when the exact answer needed a pitch beyond maxPitch (or a camera
  // roll), so the anchor could only be followed horizontally.
  limited: boolean;
}

const DEG = Math.PI / 180;

// Largest change of the camera's forward plus up vectors (chord lengths) that
// still counts as following the pointer. Jumping to the pose mirrored across
// a pole moves the up vector by ~2 on its own, while even a fast flick moves
// both vectors by well under 0.5 between two pointer events.
const MAX_CONTINUOUS_POSE_STEP = 1;

function wrapDegrees(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function forwardVector(yaw: number, pitch: number): Direction {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return [Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)];
}

function upVector(yaw: number, pitch: number): Direction {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return [-Math.sin(p) * Math.cos(y), Math.cos(p), -Math.sin(p) * Math.sin(y)];
}

function distance(a: Direction, b: Direction): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function dot(a: Direction, b: Direction): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Ray through a screen point in camera space: [right, up, forward], normalized.
function cameraRay(point: ScreenPoint, size: ScreenSize, hfov: number): Direction {
  const scale = Math.tan((hfov * DEG) / 2) / (size.width / 2);
  const right = (point.x - size.width / 2) * scale;
  const up = (size.height / 2 - point.y) * scale;
  const length = Math.hypot(right, up, 1);
  return [right / length, up / length, 1 / length];
}

export function directionFromYawPitch(yaw: number, pitch: number): Direction {
  return forwardVector(yaw, pitch);
}

export function yawPitchFromDirection(direction: Direction): { yaw: number; pitch: number } {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z);
  return {
    yaw: Math.atan2(z, x) / DEG,
    pitch: Math.asin(Math.max(-1, Math.min(1, y / length))) / DEG,
  };
}

export function directionAtScreenPoint(view: ViewAngles, point: ScreenPoint, size: ScreenSize): Direction {
  const [a, b, d] = cameraRay(point, size, view.hfov);
  const y = view.yaw * DEG;
  const forward = forwardVector(view.yaw, view.pitch);
  const up = upVector(view.yaw, view.pitch);
  const right: Direction = [-Math.sin(y), 0, Math.cos(y)];
  return [
    a * right[0] + b * up[0] + d * forward[0],
    a * right[1] + b * up[1] + d * forward[1],
    a * right[2] + b * up[2] + d * forward[2],
  ];
}

// Finds the yaw and pitch that put `target` under `point`, so a grabbed patch
// of the panorama stays under the finger instead of drifting with a fixed
// degrees-per-pixel factor.
//
// Pitch is solved in closed form: only pitch changes the height of the ray,
// so b*cos(p) + d*sin(p) = target.y, i.e. R*cos(p - delta) = target.y.
// Yaw then turns the ray until its azimuth matches the target's.
//
// That equation has two roots. Near a pole one of them looks past the pole
// (beyond +-90 degrees) and the other is the same view spun 180 degrees in
// yaw. Picking a root by pitch alone flips the panorama, so every root is
// clamped to maxPitch first, then:
// - 'continuous': an exact root wins when it continues the current pose;
//   otherwise the pose closest to the current one does, which at the limit
//   means following the pointer horizontally.
// - 'jump': any exact root that keeps the camera upright relative to the
//   current pose wins, however far it turns. Turning over the pole reverses
//   the camera's up vector, so such a pose is never used: when nothing
//   else anchors the point, the view stays where it is.
export function solveViewForAnchor(
  view: ViewAngles,
  point: ScreenPoint,
  size: ScreenSize,
  target: Direction,
  maxPitch: number,
  motion: AnchorMotion = 'continuous',
): AnchoredView {
  const [a, b, d] = cameraRay(point, size, view.hfov);
  const targetLength = Math.hypot(target[0], target[1], target[2]);
  const targetY = target[1] / targetLength;
  const targetAzimuth = Math.atan2(target[2], target[0]);
  const radius = Math.hypot(b, d);
  const k = targetY / radius;
  // |k| > 1: no pitch can raise or lower the ray to the target's height
  // without rolling the camera. Keep the pitch and follow horizontally.
  const unreachable = Math.abs(k) > 1;
  const delta = Math.atan2(d, b);
  const spread = unreachable ? 0 : Math.acos(k);
  const roots = unreachable ? [view.pitch * DEG] : [delta + spread, delta - spread];

  const currentForward = forwardVector(view.yaw, view.pitch);
  const currentUp = upVector(view.yaw, view.pitch);
  const candidates: (AnchoredView & { cost: number })[] = [];

  for (const root of roots) {
    let pitch = wrapDegrees(root / DEG);
    let limited = unreachable;
    if (pitch > maxPitch) {
      pitch = maxPitch;
      limited = true;
    } else if (pitch < -maxPitch) {
      pitch = -maxPitch;
      limited = true;
    }

    const p = pitch * DEG;
    const rayAzimuth = Math.atan2(a, d * Math.cos(p) - b * Math.sin(p));
    const yawOffset = wrapDegrees((targetAzimuth - rayAzimuth) / DEG - view.yaw);
    // Keep yaw continuous so inertia and getYaw() normalization keep working.
    const yaw = view.yaw + yawOffset;

    const cost = distance(forwardVector(yaw, pitch), currentForward)
      + distance(upVector(yaw, pitch), currentUp);
    candidates.push({ yaw, pitch, limited, cost });
  }

  const byCost = (left: { cost: number }, right: { cost: number }) => left.cost - right.cost;
  // A clamped root can sit exactly on the current pose, so comparing costs
  // alone would keep the view pinned at the limit after the drag reverses.
  const exact = candidates.filter(candidate => !candidate.limited).sort(byCost);
  const closest = [...candidates].sort(byCost)[0];
  let best = closest;
  if (motion === 'continuous') {
    if (exact[0] && exact[0].cost <= MAX_CONTINUOUS_POSE_STEP) best = exact[0];
  } else {
    // Zooming toward a point near the screen edge can legitimately turn
    // the camera further than any single pointer move, so the continuity
    // threshold would reject the right answer here.
    const isUpright = (candidate: AnchoredView) => dot(upVector(candidate.yaw, candidate.pitch), currentUp) > 0;
    // If every way of anchoring turns the camera over, zoom in place.
    best = exact.find(isUpright)
      ?? [...candidates].sort(byCost).find(isUpright)
      ?? { yaw: view.yaw, pitch: view.pitch, limited: true, cost: 0 };
  }
  return { yaw: best.yaw, pitch: best.pitch, limited: best.limited };
}
