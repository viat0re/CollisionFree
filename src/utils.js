import { RADIUS, WIDTH, HEIGHT, MAX_TURN_RAD, COS_MAX_TURN } from './config.js';

export function randomInRange(a, b) {
  return Math.random() * (b - a) + a;
}

export function randomPos() {
  return {
    x: randomInRange(RADIUS, WIDTH - RADIUS),
    y: randomInRange(RADIUS, HEIGHT - RADIUS)
  };
}

export function rotateVec(x, y, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  return {
    x: x * cosA - y * sinA,
    y: x * sinA + y * cosA
  };
}

// Identical to original limitTurn(prevX, prevY, desiredX, desiredY)
export function limitTurn(prevX, prevY, desiredX, desiredY) {
  const dLen = Math.hypot(desiredX, desiredY) || 1;
  let ux = desiredX / dLen;
  let uy = desiredY / dLen;

  const dot = prevX * ux + prevY * uy;
  if (dot >= COS_MAX_TURN) {
    return { x: ux, y: uy };
  }

  const anglePrev = Math.atan2(prevY, prevX);
  const angleDesired = Math.atan2(uy, ux);
  let delta = angleDesired - anglePrev;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta <= -Math.PI) delta += 2 * Math.PI;

  if (delta > MAX_TURN_RAD) delta = MAX_TURN_RAD;
  if (delta < -MAX_TURN_RAD) delta = -MAX_TURN_RAD;

  const newAngle = anglePrev + delta;
  return { x: Math.cos(newAngle), y: Math.sin(newAngle) };
}

export function faintColor(col) {
  if (col === 'red')    return 'rgba(255,0,0,0.35)';
  if (col === 'orange') return 'rgba(255,165,0,0.35)';
  return 'rgba(0,0,0,0.35)';
}
