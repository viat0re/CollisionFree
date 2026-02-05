// Centralized configuration (kept identical to the original 107.html)

export const WIDTH = 500;
export const HEIGHT = 500;
export const NUM_BALLS = 50;
export const RADIUS = 7;
export const BASE_SPEED = RADIUS;

export const TRACK_LEFT_INDEX = 0;
export const TRACK_RIGHT_INDEX = 0;

export const AVOID_DIST = 2.6 * RADIUS;
export const TOUCH2_AVOID = AVOID_DIST * AVOID_DIST;
export const TOUCH2_COLLIDE = (2 * RADIUS) * (2 * RADIUS);
export const BORDER_SAFE = AVOID_DIST + 2 * BASE_SPEED;

export const MAX_NEIGHBOR_DIST = 10 * RADIUS;
export const MAX_NEIGHBOR_DIST2 = MAX_NEIGHBOR_DIST * MAX_NEIGHBOR_DIST;

export const L4_CONNECT_DIST = 1.25 * (2 * RADIUS);
export const L4_CONNECT_DIST2 = L4_CONNECT_DIST * L4_CONNECT_DIST;

export const DISCOUNT_A = 0.9;

export const WINDOW_MS = 10000;

// Visualization pacing only (no model change)
export const DEFAULT_VIS_FPS = 60;

// Right-field prediction horizon
export const PRED_STEPS = 10;
export const EMERGENCY_STEPS = 4;

// Action set
export const ACTION_ANGLES = [-45, -30, -15, 0, 15, 30, 45];
export const ACTION_DVS = [-1, 0, 1];

export const ALL_CONTROLS = (() => {
  const out = [];
  for (const angleDeg of ACTION_ANGLES) {
    for (const dv of ACTION_DVS) {
      out.push({ angle: angleDeg, dv });
    }
  }
  return out;
})();

export function controlKey(angleDeg, dv) {
  return `angle=${angleDeg},dv=${dv}`;
}

export const MAX_TURN_DEG = 45;
export const MAX_TURN_RAD = MAX_TURN_DEG * Math.PI / 180;
export const COS_MAX_TURN = Math.cos(MAX_TURN_RAD);

export const L4_COMPONENT_COLORS = ['#00aa00','#aa00aa','#0000aa','#ff8800','#008888','#880000'];