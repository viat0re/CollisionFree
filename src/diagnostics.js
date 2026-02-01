import {
  WIDTH, HEIGHT, NUM_BALLS, RADIUS,
} from './config.js';

import { faintColor, rotateVec, limitTurn } from './utils.js';
import { drawArrow, drawTargetSign } from './draw_primitives.js';

export function downloadCanvasAsPNG(canvas, filename) {
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function createZoomedCollisionSnapshot(world, brain, i, j) {
  const b1 = world.ballsRight[i];
  const b2 = world.ballsRight[j];

  const magCanvas = document.createElement('canvas');
  magCanvas.width = 500;
  magCanvas.height = 500;
  const mctx = magCanvas.getContext('2d');

  mctx.fillStyle = 'white';
  mctx.fillRect(0, 0, magCanvas.width, magCanvas.height);

  const cx = (b1.x + b2.x) / 2;
  const cy = (b1.y + b2.y) / 2;
  const SCALE = 5;

  function worldToZoom(x, y) {
    return {
      x: magCanvas.width / 2 + (x - cx) * SCALE,
      y: magCanvas.height / 2 + (y - cy) * SCALE
    };
  }

  const HIST_RADIUS = RADIUS * SCALE;

  function drawBigBall(ball, color, index) {
    const p = worldToZoom(ball.x, ball.y);
    mctx.beginPath();
    mctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2);
    mctx.fillStyle = color;
    mctx.fill();

    const textColor = (color === 'orange' || color === 'yellow') ? 'black' : 'white';
    mctx.fillStyle = textColor;
    mctx.font = '16px Arial';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillText(index, p.x, p.y);
  }

  function drawHistory(ball, color) {
    if (!ball.history) return;
    const strokeCol = faintColor(color);
    mctx.save();
    mctx.lineWidth = 1;
    const hist = ball.history;
    for (let k = 0; k < hist.length; k++) {
      const rec = hist[k];
      const p = worldToZoom(rec.x, rec.y);
      mctx.beginPath();
      mctx.arc(p.x, p.y, HIST_RADIUS, 0, Math.PI * 2);
      mctx.strokeStyle = strokeCol;
      mctx.stroke();

      let vx, vy;
      if (k < hist.length - 1) {
        const recNext = hist[k + 1];
        const pNext = worldToZoom(recNext.x, recNext.y);
        vx = pNext.x - p.x;
        vy = pNext.y - p.y;
      } else {
        vx = rec.vx;
        vy = rec.vy;
      }
      drawArrow(mctx, p.x, p.y, vx, vy, strokeCol);
    }
    mctx.restore();
  }

  function drawTargetsForBall(ball, color) {
    const baseR = RADIUS * 1.8;
    const smallR = baseR * 0.5;

    if (ball.alreadyHasTarget) {
      const pPrev = worldToZoom(ball.prevTargetX, ball.prevTargetY);
      drawTargetSign(mctx, pPrev.x, pPrev.y, color, smallR);
    }

    const pCur = worldToZoom(ball.targetX, ball.targetY);
    drawTargetSign(mctx, pCur.x, pCur.y, color, baseR);
  }

  drawHistory(b1, 'red');
  drawHistory(b2, 'orange');

  // Draw L4 (post-layer-4, pre-layer-5) direction at t-1 as gray arrow from second-to-last hollow circle
  function drawL4ArrowForBall(ball) {
    if (!ball.history || ball.history.length < 2) return;
    const hist = ball.history;
    const rec = hist[hist.length - 2];
    const p = worldToZoom(rec.x, rec.y);
    const vxL4 = rec.vxL4 || 0;
    const vyL4 = rec.vyL4 || 0;
    if (vxL4 === 0 && vyL4 === 0) return;
    drawArrow(mctx, p.x, p.y, vxL4, vyL4, 'gray');
  }

  drawL4ArrowForBall(b1);
  drawL4ArrowForBall(b2);

  drawTargetsForBall(b1, 'red');
  drawTargetsForBall(b2, 'orange');

  for (let k = 0; k < NUM_BALLS; k++) {
    if (k === i || k === j) continue;
    const ob = world.ballsRight[k];
    const pOb = worldToZoom(ob.x, ob.y);

    mctx.beginPath();
    mctx.arc(pOb.x, pOb.y, 2, 0, Math.PI * 2);
    mctx.fillStyle = 'black';
    mctx.fill();

    mctx.font = '10px Arial';
    mctx.textAlign = 'left';
    mctx.textBaseline = 'bottom';
    mctx.fillText(String(k), pOb.x + 3, pOb.y - 3);

    const vxOb = ob.dirX * ob.speed * SCALE;
    const vyOb = ob.dirY * ob.speed * SCALE;
    drawArrow(mctx, pOb.x, pOb.y, vxOb, vyOb, 'black');
  }

  drawBigBall(b1, 'red', i);
  drawBigBall(b2, 'orange', j);

  mctx.strokeStyle = '#cccccc';
  mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.moveTo(magCanvas.width / 2 - 10, magCanvas.height / 2);
  mctx.lineTo(magCanvas.width / 2 + 10, magCanvas.height / 2);
  mctx.moveTo(magCanvas.width / 2, magCanvas.height / 2 - 10);
  mctx.lineTo(magCanvas.width / 2, magCanvas.height / 2 + 10);
  mctx.stroke();

  const originX = magCanvas.width - 60;
  const originY = magCanvas.height - 40;
  drawArrow(mctx, originX, originY, 5, 0, 'gray');
  drawArrow(mctx, originX, originY, 0, 5, 'gray');

  downloadCanvasAsPNG(magCanvas, 'collision_zoom.png');
}

// snapshot of 5 candidate L4 positions per ball (for collided pair not in one L4 component)
export function createL4ControlsSnapshot(world, brain, i, j) {
  const b1 = world.ballsRight[i];
  const b2 = world.ballsRight[j];

  const magCanvas = document.createElement('canvas');
  magCanvas.width = 500;
  magCanvas.height = 500;
  const mctx = magCanvas.getContext('2d');

  mctx.fillStyle = 'white';
  mctx.fillRect(0, 0, magCanvas.width, magCanvas.height);

  // L4 starting positions (t-1) for the two balls.
  const cx1 = (brain.lastL4PosX && brain.lastL4PosX[i] != null) ? brain.lastL4PosX[i] : b1.x;
  const cy1 = (brain.lastL4PosY && brain.lastL4PosY[i] != null) ? brain.lastL4PosY[i] : b1.y;
  const cx2 = (brain.lastL4PosX && brain.lastL4PosX[j] != null) ? brain.lastL4PosX[j] : b2.x;
  const cy2 = (brain.lastL4PosY && brain.lastL4PosY[j] != null) ? brain.lastL4PosY[j] : b2.y;

  const cx = (cx1 + cx2) / 2;
  const cy = (cy1 + cy2) / 2;
  const SCALE = 5;

  function worldToZoom(x, y) {
    return {
      x: magCanvas.width / 2 + (x - cx) * SCALE,
      y: magCanvas.height / 2 + (y - cy) * SCALE
    };
  }

  function drawBigBallAtL4Pos(ballIndex, color) {
    const bx = (brain.lastL4PosX && brain.lastL4PosX[ballIndex] != null)
      ? brain.lastL4PosX[ballIndex]
      : world.ballsRight[ballIndex].x;
    const by = (brain.lastL4PosY && brain.lastL4PosY[ballIndex] != null)
      ? brain.lastL4PosY[ballIndex]
      : world.ballsRight[ballIndex].y;

    const p = worldToZoom(bx, by);
    mctx.beginPath();
    mctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2);
    mctx.fillStyle = color;
    mctx.fill();

    const textColor = (color === 'orange' || color === 'yellow') ? 'black' : 'white';
    mctx.fillStyle = textColor;
    mctx.font = '16px Arial';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillText(String(ballIndex), p.x, p.y);
  }

  function drawL4Fan(ballIndex, color) {
    const ball = world.ballsRight[ballIndex];

    // direction basis = prevDir used in L4 (stored for this frame)
    const pdx = (brain.lastPrevDirX && brain.lastPrevDirX.length === NUM_BALLS)
      ? brain.lastPrevDirX[ballIndex]
      : ball.dirX;
    const pdy = (brain.lastPrevDirY && brain.lastPrevDirY.length === NUM_BALLS)
      ? brain.lastPrevDirY[ballIndex]
      : ball.dirY;

    // scalar speed that L4 actually used in prognosis for this ball
    const speed = (brain.lastL4Speed && brain.lastL4Speed[ballIndex] != null)
      ? brain.lastL4Speed[ballIndex]
      : ball.speed;

    // angles used in L4 connectivity test
    const ANGLES = [-45, -22, 0, 22, 45];

    const baseX = (brain.lastL4PosX && brain.lastL4PosX[ballIndex] != null)
      ? brain.lastL4PosX[ballIndex]
      : ball.x;
    const baseY = (brain.lastL4PosY && brain.lastL4PosY[ballIndex] != null)
      ? brain.lastL4PosY[ballIndex]
      : ball.y;

    mctx.save();
    for (let a = 0; a < ANGLES.length; a++) {
      const ang = ANGLES[a];
      const des = rotateVec(pdx, pdy, ang);
      const lim = limitTurn(pdx, pdy, des.x, des.y);

      let nx = baseX + lim.x * speed;
      let ny = baseY + lim.y * speed;
      if (nx < RADIUS) nx = RADIUS;
      if (nx > WIDTH - RADIUS) nx = WIDTH - RADIUS;
      if (ny < RADIUS) ny = RADIUS;
      if (ny > HEIGHT - RADIUS) ny = HEIGHT - RADIUS;

      const p = worldToZoom(nx, ny);

      mctx.beginPath();
      mctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      mctx.fillStyle = color;
      mctx.fill();

      const p0 = worldToZoom(baseX, baseY);
      drawArrow(mctx, p0.x, p0.y, p.x - p0.x, p.y - p0.y, color);

      mctx.font = '10px Arial';
      mctx.fillStyle = color;
      mctx.textAlign = 'left';
      mctx.textBaseline = 'middle';
      mctx.fillText(String(ang), p.x + 6, p.y);
    }
    mctx.restore();
  }

  // For each of the collided balls, draw a fan of 5 candidate next positions from L4.
  drawL4Fan(i, 'red');
  drawL4Fan(j, 'orange');

  drawBigBallAtL4Pos(i, 'red');
  drawBigBallAtL4Pos(j, 'orange');

  // draw small other balls for context
  for (let k = 0; k < NUM_BALLS; k++) {
    if (k === i || k === j) continue;
    const ob = world.ballsRight[k];

    const bx = (brain.lastL4PosX && brain.lastL4PosX[k] != null)
      ? brain.lastL4PosX[k]
      : ob.x;
    const by = (brain.lastL4PosY && brain.lastL4PosY[k] != null)
      ? brain.lastL4PosY[k]
      : ob.y;

    const pOb = worldToZoom(bx, by);

    mctx.beginPath();
    mctx.arc(pOb.x, pOb.y, 2, 0, Math.PI * 2);
    mctx.fillStyle = 'black';
    mctx.fill();

    mctx.font = '10px Arial';
    mctx.textAlign = 'left';
    mctx.textBaseline = 'bottom';
    mctx.fillText(String(k), pOb.x + 3, pOb.y - 3);
  }

  mctx.strokeStyle = '#cccccc';
  mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.moveTo(magCanvas.width / 2 - 10, magCanvas.height / 2);
  mctx.lineTo(magCanvas.width / 2 + 10, magCanvas.height / 2);
  mctx.moveTo(magCanvas.width / 2, magCanvas.height / 2 - 10);
  mctx.lineTo(magCanvas.width / 2, magCanvas.height / 2 + 10);
  mctx.stroke();

  downloadCanvasAsPNG(magCanvas, 'collision_l4_controls.png');
}
