import {
  WIDTH, HEIGHT, NUM_BALLS, RADIUS,
  BASE_SPEED,
  TRACK_LEFT_INDEX,
  TRACK_RIGHT_INDEX,
  TOUCH2_COLLIDE,
  BORDER_SAFE,
  WINDOW_MS,
  MAX_NEIGHBOR_DIST,
} from './config.js';

import { randomPos, rotateVec, limitTurn } from './utils.js';

// ---------------------- LEFT FIELD ----------------------

function pickTargetLeft(b) {
  const t = randomPos();
  b.targetX = t.x;
  b.targetY = t.y;
  b.speed = BASE_SPEED;
  const vx = b.targetX - b.x;
  const vy = b.targetY - b.y;
  const L = Math.hypot(vx, vy) || 1;
  b.dx = (vx / L) * b.speed;
  b.dy = (vy / L) * b.speed;
  b.framesSinceTarget = 0;
}

function createBallLeft() {
  const p = randomPos();
  const b = {
    x: p.x,
    y: p.y,
    targetX: 0,
    targetY: 0,
    dx: 0,
    dy: 0,
    speed: BASE_SPEED,
    colliding: false,
    framesSinceTarget: 0,
  };
  pickTargetLeft(b);
  return b;
}

// ---------------------- RIGHT FIELD ----------------------

function pickTargetRight(b) {
  const t = randomPos();

  if (b.alreadyHasTarget) {
    b.prevTargetX = b.targetX;
    b.prevTargetY = b.targetY;
  }

  b.targetX = t.x;
  b.targetY = t.y;
  b.alreadyHasTarget = true;

  b.baseSpeed = BASE_SPEED;
  b.speed = b.baseSpeed;

  const vx = t.x - b.x;
  const vy = t.y - b.y;
  const L = Math.hypot(vx, vy) || 1;
  b.baseDirX = vx / L;
  b.baseDirY = vy / L;

  b.framesSinceTarget = 0;
  b.stepsSinceTargetChange = 0;
}

function createBallRight() {
  const p = randomPos();
  const b = {
    x: p.x,
    y: p.y,
    targetX: 0,
    targetY: 0,

    prevTargetX: 0,
    prevTargetY: 0,
    alreadyHasTarget: false,

    stepsSinceTargetChange: 0,

    baseDirX: 0,
    baseDirY: 0,
    dirX: 1,
    dirY: 0,

    baseSpeed: BASE_SPEED,
    speed: BASE_SPEED,

    collisionType: 'none',
    collisionRole: 'none',

    framesSinceTarget: 0,

    isSecondLevel: false,

    history: [],

    emergencyTimer: 0,
    emergencyDirX: 1,
    emergencyDirY: 0,
    immediateCollisionsForecast: 0,
  };
  pickTargetRight(b);
  return b;
}

// ---------------------- WORLD ----------------------

export function createWorld() {
  // IMPORTANT: preserve random call order (left created first, right created second)
  const ballsLeft = Array.from({ length: NUM_BALLS }, createBallLeft);
  const ballsRight = Array.from({ length: NUM_BALLS }, createBallRight);

  return {
    ballsLeft,
    ballsRight,

    prevPairsLeft: new Set(),
    prevPairsRight: new Set(),

    leftCollisionTimes: [],
    rightCollisionTimes: [],

    totalFramesLeft: 0,
    completedTripsLeft: 0,

    totalFramesRight: 0,
    completedTripsRight: 0,

    // layer-2/3 usage stats
    layer2Usage: 0,
    layer3Usage: 0,
    layerFrames: 0,

    emergencyEvents: 0,

    sharpTurnCollisionsTotal: 0,

    // set by updateRight on the first normal collision
    pendingCollisionPair: null,

    // diagnostic histories (kept as in 107.html; XLSX export removed elsewhere)
    controlScoreHistory: Array.from({ length: NUM_BALLS }, () => []),
    usedControlHistory: Array.from({ length: NUM_BALLS }, () => []),
    layerDetailsHistory: Array.from({ length: NUM_BALLS }, () => []),
  };
}

// ---------------------- LEFT UPDATE ----------------------

export function updateLeft(world, dom) {
  const { ballsLeft } = world;

  for (const b of ballsLeft) {
    b.framesSinceTarget++;

    const d = Math.hypot(b.targetX - b.x, b.targetY - b.y);
    if (d <= 1.5 * b.speed) {
      b.x = b.targetX;
      b.y = b.targetY;

      world.totalFramesLeft += b.framesSinceTarget;
      world.completedTripsLeft++;

      pickTargetLeft(b);
    } else {
      let newX = b.x + b.dx;
      let newY = b.y + b.dy;

      if (newX < RADIUS) newX = RADIUS;
      if (newX > WIDTH - RADIUS) newX = WIDTH - RADIUS;
      if (newY < RADIUS) newY = RADIUS;
      if (newY > HEIGHT - RADIUS) newY = HEIGHT - RADIUS;

      b.x = newX;
      b.y = newY;
    }
  }

  for (const b of ballsLeft) b.colliding = false;
  const newPairs = new Set();
  let add = 0;

  const now = performance.now();

  for (let i = 0; i < NUM_BALLS; i++) {
    for (let j = i + 1; j < NUM_BALLS; j++) {
      const bi = ballsLeft[i];
      const bj = ballsLeft[j];
      const dx = bi.x - bj.x;
      const dy = bi.y - bj.y;
      if (dx * dx + dy * dy <= TOUCH2_COLLIDE) {
        bi.colliding = bj.colliding = true;
        const key = i + '-' + j;
        newPairs.add(key);
        if (!world.prevPairsLeft.has(key)) add++;
      }
    }
  }

  world.prevPairsLeft = newPairs;

  for (let k = 0; k < add; k++) {
    world.leftCollisionTimes.push(now);
  }
  while (world.leftCollisionTimes.length > 0 &&
         world.leftCollisionTimes[0] < now - WINDOW_MS) {
    world.leftCollisionTimes.shift();
  }

  const rate10 = world.leftCollisionTimes.length / 10;
  dom.statsLeftCollDiv.textContent = `Collisions/10s: ${rate10.toFixed(2)}`;

  const avgFrames = world.completedTripsLeft > 0
    ? world.totalFramesLeft / world.completedTripsLeft
    : 0;
  dom.statsLeftFramesDiv.textContent = `Avg frames to target: ${avgFrames.toFixed(1)}`;
}

// ---------------------- RIGHT UPDATE ----------------------

export function updateRight(world, dom, brain, runtime) {
  const { ballsRight } = world;

  // Plan controls (L1/L2/L3 + L4 overrides) using the extracted "brain".
  const plan = brain.plan(
    ballsRight,
    { controlScoreHistory: world.controlScoreHistory },
    { logL4ComponentsToConsole: runtime.logL4ComponentsToConsole }
  );

  // layer usage stats (kept identical)
  world.layerFrames++;
  let used2 = 0;
  let used3 = 0;
  for (let i = 0; i < NUM_BALLS; i++) {
    if (plan.chosenAngles2[i] !== 0 || plan.chosenDvs2[i] !== 0) used2++;
    if (plan.chosenAngles3[i] !== 0 || plan.chosenDvs3[i] !== 0) used3++;
  }
  world.layer2Usage += used2;
  world.layer3Usage += used3;

  // ===== APPLY final (possibly adjusted by layer-4) controls =====
  for (let i = 0; i < NUM_BALLS; i++) {
    const b = ballsRight[i];

    const prevDirRealX = b.dirX;
    const prevDirRealY = b.dirY;

    const a1 = plan.chosenAngles1[i];
    const dv1 = plan.chosenDvs1[i];
    const a2 = plan.chosenAngles2[i];
    const dv2 = plan.chosenDvs2[i];
    const a3 = plan.chosenAngles3[i];
    const dv3 = plan.chosenDvs3[i];

    const totalAngle = plan.finalAngles[i];
    const totalDv = plan.finalDvs[i];

    b.isSecondLevel = (a2 !== 0 || dv2 !== 0 || a3 !== 0 || dv3 !== 0);

    const desDir = rotateVec(plan.prevDirX[i], plan.prevDirY[i], totalAngle);
    const limDir = limitTurn(plan.prevDirX[i], plan.prevDirY[i], desDir.x, desDir.y);

    b.speed = Math.max(1, b.baseSpeed + totalDv);
    b.dirX = limDir.x;
    b.dirY = limDir.y;

    const prevAng = Math.atan2(prevDirRealY, prevDirRealX);
    const newAng = Math.atan2(b.dirY, b.dirX);
    let dAng = newAng - prevAng;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    if (dAng < -Math.PI) dAng += 2 * Math.PI;
    let angleUsed = dAng * 180 / Math.PI;
    if (angleUsed > 45) angleUsed = 45;
    if (angleUsed < -45) angleUsed = -45;

    const dvUsed = totalDv;
    const emergFlag = plan.emergFlags[i] || 0;
    const usedStr = `angle=${Math.round(angleUsed)},dv=${dvUsed},emergency=${emergFlag}`;
    world.usedControlHistory[i].push(usedStr);
    if (world.usedControlHistory[i].length > 4) world.usedControlHistory[i].shift();

    const emergAngle = plan.emergAngles[i];

    world.layerDetailsHistory[i].push({
      l1Angle: a1, l1Dv: dv1,
      l2Angle: a2, l2Dv: dv2,
      l3Angle: a3, l3Dv: dv3,
      rtbAngle: plan.totalAngles[i],
      emergAngle: emergAngle,
      emergFlag: emergFlag,
      totalAngle: Math.round(angleUsed),
      totalDv: totalDv,
      geomAngle: angleUsed,
      geomDv: dvUsed,
      graphEdge: plan.l4EdgeFlag[i]
    });
    if (world.layerDetailsHistory[i].length > 4) world.layerDetailsHistory[i].shift();
  }

  // Move, targets, history
  for (let idx = 0; idx < NUM_BALLS; idx++) {
    const b = ballsRight[idx];
    b.framesSinceTarget++;

    const dToTarget = Math.hypot(b.targetX - b.x, b.targetY - b.y);

    if (dToTarget <= 1.5 * b.speed) {
      b.x = b.targetX;
      b.y = b.targetY;

      world.totalFramesRight += b.framesSinceTarget;
      world.completedTripsRight++;

      pickTargetRight(b);
      if (b.emergencyTimer > 0) {
        b.emergencyTimer--;
      }

    } else {
      let newX = b.x + b.dirX * b.speed;
      let newY = b.y + b.dirY * b.speed;

      if (newX < RADIUS) newX = RADIUS;
      if (newX > WIDTH - RADIUS) newX = WIDTH - RADIUS;
      if (newY < RADIUS) newY = RADIUS;
      if (newY > HEIGHT - RADIUS) newY = HEIGHT - RADIUS;

      b.x = newX;
      b.y = newY;

      if (b.emergencyTimer > 0) {
        b.emergencyTimer--;
      }

      b.stepsSinceTargetChange++;
    }

    const vxHist = b.dirX * b.speed;
    const vyHist = b.dirY * b.speed;

    let vxL4 = 0;
    let vyL4 = 0;
    if (brain.lastStepL4Vx && brain.lastStepL4Vy) {
      vxL4 = brain.lastStepL4Vx[idx];
      vyL4 = brain.lastStepL4Vy[idx];
    }

    b.history.push({ x: b.x, y: b.y, vx: vxHist, vy: vyHist, vxL4: vxL4, vyL4: vyL4 });
    if (b.history.length > 4) {
      b.history.shift();
    }
  }

  // collisions
  for (const b of ballsRight) {
    b.collisionType = 'none';
    b.collisionRole = 'none';
  }
  const newPairs = new Set();
  let add = 0;
  let sharpAdd = 0;

  const now = performance.now();
  let firstNormalCollisionPair = null;

  for (let i = 0; i < NUM_BALLS; i++) {
    for (let j = i + 1; j < NUM_BALLS; j++) {
      const a = ballsRight[i];
      const b = ballsRight[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= TOUCH2_COLLIDE) {
        const key = i + '-' + j;
        newPairs.add(key);

        const isSharpPair = (a.stepsSinceTargetChange <= 3 || b.stepsSinceTargetChange <= 3);

        if (isSharpPair) {
          if (a.collisionType !== 'sharp') a.collisionType = 'sharp';
          if (b.collisionType !== 'sharp') b.collisionType = 'sharp';
        } else {
          if (a.collisionType === 'none') a.collisionType = 'normal';
          if (b.collisionType === 'none') b.collisionType = 'normal';
        }

        const aSafe = (a.x > BORDER_SAFE && a.x < WIDTH - BORDER_SAFE && a.y > BORDER_SAFE && a.y < HEIGHT - BORDER_SAFE);
        const bSafe = (b.x > BORDER_SAFE && b.x < WIDTH - BORDER_SAFE && b.y > BORDER_SAFE && b.y < HEIGHT - BORDER_SAFE);

        const countThis = aSafe && bSafe;

        if (!world.prevPairsRight.has(key) && countThis) {
          add++;
          if (isSharpPair) {
            sharpAdd++;
          } else if (!firstNormalCollisionPair) {
            firstNormalCollisionPair = { i, j };
          }
        }
      }
    }
  }

  world.prevPairsRight = newPairs;

  if (firstNormalCollisionPair) {
    const { i, j } = firstNormalCollisionPair;
    ballsRight[i].collisionRole = 'primaryRed';
    ballsRight[j].collisionRole = 'primaryOrange';
  }

  const normalAdd = add - sharpAdd;
  for (let k = 0; k < normalAdd; k++) {
    world.rightCollisionTimes.push(now);
  }
  while (world.rightCollisionTimes.length > 0 &&
         world.rightCollisionTimes[0] < now - WINDOW_MS) {
    world.rightCollisionTimes.shift();
  }

  const rate10 = world.rightCollisionTimes.length / 10;
  dom.statsRightCollDiv.textContent = `Collisions/10s: ${rate10.toFixed(2)}`;

  world.sharpTurnCollisionsTotal += sharpAdd;
  dom.statsRightSharpDiv.textContent = `Sharp-turn collisions (total): ${world.sharpTurnCollisionsTotal}`;

  const avgFrames = world.completedTripsRight > 0
    ? world.totalFramesRight / world.completedTripsRight
    : 0;
  dom.statsRightFramesDiv.textContent = `Avg frames to target: ${avgFrames.toFixed(1)}`;

  if (world.layerFrames > 0) {
    const layer2freq = world.layer2Usage / (world.layerFrames * NUM_BALLS);
    const layer3freq = world.layer3Usage / (world.layerFrames * NUM_BALLS);

    dom.statsRightLayer2Div.textContent = `Layer-2 usage: ${layer2freq.toFixed(3)}`;
    dom.statsRightLayer3Div.textContent = `Layer-3 usage: ${layer3freq.toFixed(3)}`;
  }

  dom.statsRightEmergencyDiv.textContent = `Emergency events: ${world.emergencyEvents}`;

  // === On first normal collision, snapshot + highlight L4 components ===
  if (firstNormalCollisionPair && !runtime.paused) {
    runtime.highlightL4Components = true;
    world.pendingCollisionPair = firstNormalCollisionPair;
  }
}

export const TRACK = {
  LEFT: TRACK_LEFT_INDEX,
  RIGHT: TRACK_RIGHT_INDEX,
};

export const VIEW = {
  MAX_NEIGHBOR_DIST,
};
