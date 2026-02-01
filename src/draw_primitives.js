import { RADIUS } from './config.js';

export function drawDestination(ctx, x, y) {
  const r = RADIUS * 1.8;
  ctx.strokeStyle = 'gray';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

export function drawTargetSign(ctx, x, y, color, radius) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - radius, y - radius);
  ctx.lineTo(x + radius, y + radius);
  ctx.moveTo(x - radius, y + radius);
  ctx.lineTo(x + radius, y - radius);
  ctx.stroke();
}

export function drawArrow(ctx, x, y, vx, vy, color = 'gray') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  const arrowScale = 10;
  const len = Math.hypot(vx, vy) || 1;
  const ux = (vx / len) * arrowScale;
  const uy = (vy / len) * arrowScale;

  const x2 = x + ux;
  const y2 = y + uy;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const headSize = 4;
  const angle = Math.atan2(uy, ux);
  const leftAngle = angle + Math.PI * 0.75;
  const rightAngle = angle - Math.PI * 0.75;

  const xLeft = x2 + headSize * Math.cos(leftAngle);
  const yLeft = y2 * 1 + headSize * Math.sin(leftAngle);
  const xRight = x2 + headSize * Math.cos(rightAngle);
  const yRight = y2 + headSize * Math.sin(rightAngle);

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(xLeft, yLeft);
  ctx.lineTo(xRight, yRight);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}
