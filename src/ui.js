import {
  WIDTH, HEIGHT, NUM_BALLS, RADIUS,
  TRACK_LEFT_INDEX,
  TRACK_RIGHT_INDEX,
  MAX_NEIGHBOR_DIST,
  L4_COMPONENT_COLORS,
} from './config.js';

import { drawDestination, drawTargetSign, drawArrow } from './draw_primitives.js';

export function drawLeft(ctx1, world) {
  ctx1.clearRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < NUM_BALLS; i++) {
    const b = world.ballsLeft[i];
    ctx1.beginPath();
    ctx1.arc(b.x, b.y, RADIUS, 0, Math.PI * 2);

    if (i === TRACK_LEFT_INDEX) {
      ctx1.fillStyle = 'green';
    } else {
      ctx1.fillStyle = b.colliding ? 'red' : 'black';
    }
    ctx1.fill();

    // faint view circle around green ball on the left
    if (i === TRACK_LEFT_INDEX) {
      ctx1.beginPath();
      ctx1.arc(b.x, b.y, MAX_NEIGHBOR_DIST, 0, Math.PI * 2);
      ctx1.strokeStyle = 'rgba(180,180,180,0.25)';
      ctx1.lineWidth = 1;
      ctx1.stroke();
    }
  }

  const tb = world.ballsLeft[TRACK_LEFT_INDEX];
  drawDestination(ctx1, tb.targetX, tb.targetY);
}

export function drawRight(ctx2, world, brain, runtime) {
  ctx2.clearRect(0, 0, WIDTH, HEIGHT);

  // Draw L4 edges (faint green) between connected balls
  if (runtime.highlightL4Components && brain.lastL4Edges && brain.lastL4Edges.length > 0) {
    ctx2.save();
    ctx2.strokeStyle = 'rgba(0,255,0,0.3)';
    ctx2.lineWidth = 1;
    for (const pair of brain.lastL4Edges) {
      const i = pair[0];
      const j = pair[1];
      const bi = world.ballsRight[i];
      const bj = world.ballsRight[j];
      ctx2.beginPath();
      ctx2.moveTo(bi.x, bi.y);
      ctx2.lineTo(bj.x, bj.y);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  for (let i = 0; i < NUM_BALLS; i++) {
    const b = world.ballsRight[i];
    ctx2.beginPath();
    ctx2.arc(b.x, b.y, RADIUS, 0, Math.PI * 2);

    if (b.collisionRole === 'primaryRed') {
      ctx2.fillStyle = 'red';
    } else if (b.collisionRole === 'primaryOrange') {
      ctx2.fillStyle = 'orange';
    } else if (i === TRACK_RIGHT_INDEX) {
      ctx2.fillStyle = 'green';
    } else if (b.emergencyTimer > 0) {
      ctx2.fillStyle = 'purple';
    } else if (b.isSecondLevel) {
      ctx2.fillStyle = 'blue';
    } else {
      if (b.collisionType === 'sharp') {
        ctx2.fillStyle = '#ffb347';
      } else if (b.collisionType === 'normal') {
        ctx2.fillStyle = 'red';
      } else {
        ctx2.fillStyle = 'black';
      }
    }

    ctx2.fill();

    // faint view circle around the green ball
    if (i === TRACK_RIGHT_INDEX) {
      ctx2.beginPath();
      ctx2.arc(b.x, b.y, MAX_NEIGHBOR_DIST, 0, Math.PI * 2);
      ctx2.strokeStyle = 'rgba(180,180,180,0.25)';
      ctx2.lineWidth = 1;
      ctx2.stroke();
    }

    // Optional: highlight layer-4 connected components and show L4 emergency direction
    if (runtime.highlightL4Components && brain.lastL4ComponentId && brain.lastL4ComponentId[i] >= 0) {
      const compColor = L4_COMPONENT_COLORS[brain.lastL4ComponentId[i] % L4_COMPONENT_COLORS.length];
      ctx2.beginPath();
      ctx2.arc(b.x, b.y, RADIUS + 2, 0, Math.PI * 2);
      ctx2.strokeStyle = compColor;
      ctx2.lineWidth = 2;
      ctx2.stroke();

      if (brain.lastStepL4Vx && brain.lastStepL4Vy && brain.lastL4EdgeFlag && brain.lastL4EdgeFlag[i]) {
        drawArrow(ctx2, b.x, b.y, brain.lastStepL4Vx[i] * 0.5, brain.lastStepL4Vy[i] * 0.5, compColor);
      }
    }
  }

  const tb = world.ballsRight[TRACK_RIGHT_INDEX];
  drawDestination(ctx2, tb.targetX, tb.targetY);

  for (const b of world.ballsRight) {
    if (b.collisionType === 'none') continue;
    if (!b.alreadyHasTarget) continue;

    let color;
    if (b.collisionRole === 'primaryRed') {
      color = 'red';
    } else if (b.collisionRole === 'primaryOrange') {
      color = 'orange';
    } else if (b.collisionType === 'sharp') {
      color = '#ffb347';
    } else {
      color = 'red';
    }

    const baseR = RADIUS * 1.8;
    const smallR = baseR * 0.5;

    drawTargetSign(ctx2, b.prevTargetX, b.prevTargetY, color, smallR);
    drawTargetSign(ctx2, b.targetX, b.targetY, color, baseR);
  }
}
