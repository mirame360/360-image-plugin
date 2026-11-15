import { describe, it, expect } from 'vitest';
import {
  directionAtScreenPoint,
  directionFromYawPitch,
  solveViewForAnchor,
  yawPitchFromDirection,
  type Direction,
  type ScreenPoint,
  type ViewAngles,
} from './projection';

const SIZE = { width: 800, height: 600 };
const PORTRAIT = { width: 390, height: 844 };
const MAX_PITCH = 85;

function angleBetween(a: Direction, b: Direction): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length = Math.hypot(...a) * Math.hypot(...b);
  return Math.acos(Math.max(-1, Math.min(1, dot / length))) * 180 / Math.PI;
}

// Small deterministic generator so sweeps are reproducible.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

describe('projection', () => {
  it('maps the screen center to the view direction', () => {
    const view = { yaw: 37, pitch: -22, hfov: 90 };
    const center = directionAtScreenPoint(view, { x: 400, y: 300 }, SIZE);

    expect(angleBetween(center, directionFromYawPitch(37, -22))).toBeLessThan(1e-9);
  });

  it('spans hfov across the width and grows yaw to the right and pitch upwards', () => {
    const view = { yaw: 10, pitch: 0, hfov: 90 };

    const right = yawPitchFromDirection(directionAtScreenPoint(view, { x: 800, y: 300 }, SIZE));
    expect(right.yaw).toBeCloseTo(55);
    expect(right.pitch).toBeCloseTo(0);

    const top = yawPitchFromDirection(directionAtScreenPoint(view, { x: 400, y: 0 }, SIZE));
    expect(top.yaw).toBeCloseTo(10);
    expect(top.pitch).toBeCloseTo(Math.atan(300 / 400) * 180 / Math.PI);
  });

  it('round-trips yaw and pitch through a direction', () => {
    const { yaw, pitch } = yawPitchFromDirection(directionFromYawPitch(-123, 41));

    expect(yaw).toBeCloseTo(-123);
    expect(pitch).toBeCloseTo(41);
  });

  it('leaves the view unchanged when the anchor has not moved', () => {
    const view = { yaw: 400, pitch: 30, hfov: 75 };
    const point = { x: 120, y: 480 };
    const target = directionAtScreenPoint(view, point, SIZE);

    const solved = solveViewForAnchor(view, point, SIZE, target, MAX_PITCH);

    expect(solved.yaw).toBeCloseTo(400);
    expect(solved.pitch).toBeCloseTo(30);
    expect(solved.limited).toBe(false);
  });

  it('keeps the grabbed direction under the pointer across views and drags', () => {
    const next = random(7);
    let checked = 0;

    for (let i = 0; i < 2000; i += 1) {
      const size = i % 2 ? SIZE : PORTRAIT;
      let view: ViewAngles = {
        yaw: next() * 720 - 360,
        pitch: next() * 160 - 80,
        hfov: 30 + next() * 90,
      };
      let point: ScreenPoint = { x: next() * size.width, y: next() * size.height };
      const target = directionAtScreenPoint(view, point, size);

      for (let step = 0; step < 10; step += 1) {
        point = { x: point.x + (next() - 0.5) * 40, y: point.y + (next() - 0.5) * 40 };
        const solved = solveViewForAnchor(view, point, size, target, MAX_PITCH);
        view = { ...view, yaw: solved.yaw, pitch: solved.pitch };
        if (solved.limited) break;

        expect(angleBetween(directionAtScreenPoint(view, point, size), target)).toBeLessThan(1e-4);
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThan(10000);
  });

  it('stops at the pitch limit instead of inverting the view', () => {
    const view = { yaw: 0, pitch: 80, hfov: 90 };
    const target = directionAtScreenPoint(view, { x: 400, y: 300 }, SIZE);

    // Dragging the view center far down asks for a pitch beyond 90 degrees.
    const solved = solveViewForAnchor(view, { x: 400, y: 590 }, SIZE, target, MAX_PITCH);

    expect(solved.pitch).toBe(MAX_PITCH);
    expect(solved.limited).toBe(true);
  });

  it('leaves the pitch limit as soon as the drag reverses', () => {
    const view = { yaw: 180, pitch: MAX_PITCH, hfov: 90 };
    // Grabbed at the bottom of the screen right after hitting the limit.
    const target = directionAtScreenPoint(view, { x: 400, y: 590 }, SIZE);

    // Moving it 20px back up must lower the view, even though the clamped
    // root would keep the camera exactly where it is.
    const solved = solveViewForAnchor(view, { x: 400, y: 570 }, SIZE, target, MAX_PITCH);

    expect(solved.limited).toBe(false);
    expect(solved.pitch).toBeLessThan(MAX_PITCH);
    expect(angleBetween(directionAtScreenPoint({ ...view, ...solved }, { x: 400, y: 570 }, SIZE), target))
      .toBeLessThan(1e-4);
  });

  it('follows only horizontally when no pitch can reach the anchor height', () => {
    const view = { yaw: 0, pitch: -60, hfov: 100 };
    const target = directionFromYawPitch(30, -89.9);

    // Near the screen edge the ray cannot get within 0.1 degrees of the nadir.
    const solved = solveViewForAnchor(view, { x: 790, y: 300 }, SIZE, target, MAX_PITCH);

    expect(solved.pitch).toBe(-60);
    expect(solved.limited).toBe(true);
    expect(Number.isFinite(solved.yaw)).toBe(true);
  });

  it('anchors one-off zoom jumps that turn the camera far without flipping it', () => {
    // Zooming from 90 to 40 degrees toward a point near the screen edge
    // turns the camera further than a single pointer move ever does. The
    // continuous rule rejects that answer; the jump rule must take it.
    const view = { yaw: 0, pitch: -55, hfov: 90 };
    const point = { x: 790, y: 590 };
    const target = directionAtScreenPoint(view, point, SIZE);
    const zoomed = { ...view, hfov: 40 };

    const continuous = solveViewForAnchor(zoomed, point, SIZE, target, MAX_PITCH);
    const jump = solveViewForAnchor(zoomed, point, SIZE, target, MAX_PITCH, 'jump');

    expect(continuous.limited).toBe(true);
    expect(jump.limited).toBe(false);
    expect(angleBetween(directionAtScreenPoint({ ...zoomed, ...jump }, point, SIZE), target)).toBeLessThan(1e-4);
  });

  it('never turns the camera over the pole when zooming', () => {
    const next = random(5);
    const upVector = (yaw: number, pitch: number): Direction => {
      const y = yaw * Math.PI / 180;
      const p = pitch * Math.PI / 180;
      return [-Math.sin(p) * Math.cos(y), Math.cos(p), -Math.sin(p) * Math.sin(y)];
    };
    let anchored = 0;

    for (let i = 0; i < 4000; i += 1) {
      const size = i % 2 ? SIZE : PORTRAIT;
      const [from, to] = [[90, 40], [40, 90], [120, 30], [30, 120]][i % 4];
      const view = { yaw: next() * 360, pitch: next() * 170 - 85, hfov: from };
      const point = { x: next() * size.width, y: next() * size.height };
      const target = directionAtScreenPoint(view, point, size);

      const solved = solveViewForAnchor({ ...view, hfov: to }, point, size, target, MAX_PITCH, 'jump');

      const before = upVector(view.yaw, view.pitch);
      const after = upVector(solved.yaw, solved.pitch);
      expect(before[0] * after[0] + before[1] * after[1] + before[2] * after[2]).toBeGreaterThan(0);
      if (!solved.limited) anchored += 1;
    }

    expect(anchored).toBeGreaterThan(3000);
  });

  it('does not flip yaw when dragging a point from below the center up past the nadir', () => {
    // Choosing between the two pitch roots by pitch alone picks the pose
    // mirrored across the pole here, spinning the panorama by up to 180
    // degrees in a single pointer move. The player's 85 degree limit
    // usually stops the drag before that, so use a limit close to the pole
    // to exercise the root choice itself.
    const nearPoleLimit = 89.5;
    let worstYawStep = 0;

    for (const x of [150, 180, 195, 210, 250]) {
      for (const pitch of [-70, -75, -80, -84]) {
        for (const yaw of [0, 77]) {
          let view: ViewAngles = { yaw, pitch, hfov: 90 };
          let point = { x, y: 650 };
          let target = directionAtScreenPoint(view, point, PORTRAIT);

          for (let step = 0; step < 120; step += 1) {
            point = { x, y: point.y - 3 };
            const previousYaw = view.yaw;
            const solved = solveViewForAnchor(view, point, PORTRAIT, target, nearPoleLimit);
            view = { ...view, yaw: solved.yaw, pitch: solved.pitch };

            // A 3px step may legitimately spin the view fast when the grabbed
            // point sits right on the pole, like dragging next to the center
            // of a turntable. Anywhere else a large yaw step is a flip.
            const onPole = Math.abs(target[1]) > Math.cos(2 * Math.PI / 180);
            if (!onPole) {
              worstYawStep = Math.max(worstYawStep, Math.abs(view.yaw - previousYaw));
            }
            expect(Math.abs(view.pitch)).toBeLessThanOrEqual(nearPoleLimit);

            // Re-grab at the limit, as the player does.
            if (solved.limited) target = directionAtScreenPoint(view, point, PORTRAIT);
          }
        }
      }
    }

    expect(worstYawStep).toBeLessThan(60);
  });
});
