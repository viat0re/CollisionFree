import {
  WIDTH, HEIGHT, RADIUS,
  TOUCH2_AVOID, TOUCH2_COLLIDE,
  MAX_NEIGHBOR_DIST2,
  L4_CONNECT_DIST2,
  DISCOUNT_A,
  PRED_STEPS,
  EMERGENCY_STEPS,
  ACTION_ANGLES,
  ACTION_DVS,
  ALL_CONTROLS,
  controlKey,
} from './config.js';

import { rotateVec, limitTurn } from './utils.js';

function clampDv(dv) {
  if (dv > 1) return 1;
  if (dv < -1) return -1;
  return dv;
}

/**
 * Right-field "brain" (collision avoidance policy) extracted from 107.html.
 *
 * - No DOM.
 * - No drawing.
 * - No integration/position update.
 *
 * It only plans the per-agent control for the next step and exposes
 * diagnostics needed for visualization (L4 graph, candidate positions, etc.).
 */
export class RightFieldBrain {
  constructor() {
    this.lastStepL4Vx = null;
    this.lastStepL4Vy = null;
    this.lastL4ComponentId = [];
    this.lastL4EdgeFlag = [];
    this.lastL4Edges = [];

    this.lastPrevDirX = null;
    this.lastPrevDirY = null;

    this.lastL4PosX = null;
    this.lastL4PosY = null;
    this.lastL4Speed = null;
  }

  /**
   * Plans controls for all agents.
   *
   * @param {Array<object>} ballsRight - agent states (same fields as in 107.html)
   * @param {object} histories - optional diagnostic histories
   * @param {Array<Array<object>>} histories.controlScoreHistory - per agent array of score maps
   * @param {object} options
   * @param {boolean} options.logL4ComponentsToConsole
   *
   * @returns {object} plan bundle used by the simulator to apply commands
   */
  plan(ballsRight, histories = {}, options = {}) {
    const N = ballsRight.length;
    const controlScoreHistory = histories.controlScoreHistory;

    const logL4ComponentsToConsole = !!options.logL4ComponentsToConsole;

    // Previous directions (normalized)
    const prevDirX = new Array(N);
    const prevDirY = new Array(N);
    for (let i = 0; i < N; i++) {
      const b = ballsRight[i];
      const len = Math.hypot(b.dirX, b.dirY) || 1;
      prevDirX[i] = b.dirX / len;
      prevDirY[i] = b.dirY / len;
    }

    // store for later visualization of L4 candidate positions
    this.lastPrevDirX = prevDirX.slice();
    this.lastPrevDirY = prevDirY.slice();

    // plans per-layer for later union-of-layers in Layer-5
    const planDir1X = new Array(N);
    const planDir1Y = new Array(N);
    const planSpeed1 = new Array(N);
    const planDir2X = new Array(N);
    const planDir2Y = new Array(N);
    const planSpeed2 = new Array(N);

    for (const b of ballsRight) {
      const vx = b.targetX - b.x;
      const vy = b.targetY - b.y;
      const L = Math.hypot(vx, vy) || 1;
      b.baseDirX = vx / L;
      b.baseDirY = vy / L;
      b.immediateCollisionsForecast = 0;
    }

    // ---- helper predictors (identical logic, but parameterized) ----

    const predictCollisionsForActionLong = (index, angleDeg, dv) => {
      const self = ballsRight[index];

      const des = rotateVec(prevDirX[index], prevDirY[index], angleDeg);
      const lim = limitTurn(prevDirX[index], prevDirY[index], des.x, des.y);
      const dirX = lim.x;
      const dirY = lim.y;

      const speed = Math.max(1, self.baseSpeed + dv);

      let x = self.x;
      let y = self.y;
      let collisions = 0;
      let step1Collisions = 0;

      for (let step = 1; step <= PRED_STEPS; step++) {
        const dxT = self.targetX - x;
        const dyT = self.targetY - y;
        const distT = Math.hypot(dxT, dyT);
        if (distT <= speed) {
          x = self.targetX;
          y = self.targetY;
        } else {
          x += dirX * speed;
          y += dirY * speed;

          if (x < RADIUS) x = RADIUS;
          if (x > WIDTH - RADIUS) x = WIDTH - RADIUS;
          if (y < RADIUS) y = RADIUS;
          if (y > HEIGHT - RADIUS) y = HEIGHT - RADIUS;
        }

        for (let j = 0; j < N; j++) {
          if (j === index) continue;
          const other = ballsRight[j];

          const dx0 = self.x - other.x;
          const dy0 = self.y - other.y;
          if (dx0 * dx0 + dy0 * dy0 > MAX_NEIGHBOR_DIST2) continue;

          // IMPORTANT: uses other's *previous* executed velocity (dirX/dirY * speed)
          const ox = other.x + other.dirX * other.speed * step;
          const oy = other.y + other.dirY * other.speed * step;

          const dx = x - ox;
          const dy = y - oy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= TOUCH2_COLLIDE) {
            const weight = Math.pow(DISCOUNT_A, step - 1);
            collisions += weight * 1000;
            if (step === 1) step1Collisions += 1000;
          } else if (d2 <= TOUCH2_AVOID) {
            const weight = Math.pow(DISCOUNT_A, step - 1);
            collisions += weight;
            if (step === 1) step1Collisions++;
          }
        }
      }

      return { collisions, step1Collisions };
    };

    const predictCollisionsForActionShort = (
      index,
      angleDeg2,
      dv2,
      chosenAngles1,
      chosenDvs1
    ) => {
      const plannedDirX = new Array(N);
      const plannedDirY = new Array(N);
      const plannedSpeed = new Array(N);

      for (let j = 0; j < N; j++) {
        const b = ballsRight[j];
        const ang1 = chosenAngles1[j];
        const dv1 = chosenDvs1[j];

        const des = rotateVec(prevDirX[j], prevDirY[j], ang1);
        const lim = limitTurn(prevDirX[j], prevDirY[j], des.x, des.y);

        plannedDirX[j] = lim.x;
        plannedDirY[j] = lim.y;
        plannedSpeed[j] = Math.max(1, b.baseSpeed + dv1);
      }

      const self = ballsRight[index];

      const ang1s = chosenAngles1[index];
      const dv1s = chosenDvs1[index];
      const totalAngle = ang1s + angleDeg2;
      const totalDv = clampDv(dv1s + dv2);

      const desSelf = rotateVec(prevDirX[index], prevDirY[index], totalAngle);
      const limSelf = limitTurn(prevDirX[index], prevDirY[index], desSelf.x, desSelf.y);
      const selfDirX = limSelf.x;
      const selfDirY = limSelf.y;
      const selfSpeed = Math.max(1, self.baseSpeed + totalDv);

      let x = self.x;
      let y = self.y;
      let collisions = 0;
      let step1Collisions = 0;

      for (let step = 1; step <= PRED_STEPS; step++) {
        const dxT = self.targetX - x;
        const dyT = self.targetY - y;
        const distT = Math.hypot(dxT, dyT);
        if (distT <= selfSpeed) {
          x = self.targetX;
          y = self.targetY;
        } else {
          x += selfDirX * selfSpeed;
          y += selfDirY * selfSpeed;

          if (x < RADIUS) x = RADIUS;
          if (x > WIDTH - RADIUS) x = WIDTH - RADIUS;
          if (y < RADIUS) y = RADIUS;
          if (y > HEIGHT - RADIUS) y = HEIGHT - RADIUS;
        }

        for (let j = 0; j < N; j++) {
          if (j === index) continue;
          const b = ballsRight[j];

          const dx0 = self.x - b.x;
          const dy0 = self.y - b.y;
          if (dx0 * dx0 + dy0 * dy0 > MAX_NEIGHBOR_DIST2) continue;

          const ox = b.x + plannedDirX[j] * plannedSpeed[j] * step;
          const oy = b.y + plannedDirY[j] * plannedSpeed[j] * step;

          const dx = x - ox;
          const dy = y - oy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= TOUCH2_COLLIDE) {
            const weight = Math.pow(DISCOUNT_A, step - 1);
            collisions += weight * 1000;
            if (step === 1) step1Collisions += 1000;
          } else if (d2 <= TOUCH2_AVOID) {
            const weight = Math.pow(DISCOUNT_A, step - 1);
            collisions += weight;
            if (step === 1) step1Collisions++;
          }
        }
      }

      return { collisions, step1Collisions };
    };

    const predictCollisionsForActionThird = (
      index,
      angleDeg3,
      dv3,
      chosenAngles1,
      chosenDvs1,
      chosenAngles2,
      chosenDvs2
    ) => {
      const plannedDirX = new Array(N);
      const plannedDirY = new Array(N);
      const plannedSpeed = new Array(N);

      for (let j = 0; j < N; j++) {
        const b = ballsRight[j];
        const ang1 = chosenAngles1[j];
        const dv1 = chosenDvs1[j];
        const ang2 = chosenAngles2[j];
        const dv2 = chosenDvs2[j];

        const angle12 = ang1 + ang2;
        const dv12 = clampDv(dv1 + dv2);

        const des = rotateVec(prevDirX[j], prevDirY[j], angle12);
        const lim = limitTurn(prevDirX[j], prevDirY[j], des.x, des.y);

        plannedDirX[j] = lim.x;
        plannedDirY[j] = lim.y;
        plannedSpeed[j] = Math.max(1, b.baseSpeed + dv12);
      }

      const self = ballsRight[index];
      const a1s = chosenAngles1[index];
      const dv1s = chosenDvs1[index];
      const a2s = chosenAngles2[index];
      const dv2s = chosenDvs2[index];
      const angle12s = a1s + a2s;
      const dv12s = clampDv(dv1s + dv2s);

      const totalAngle = angle12s + angleDeg3;
      const totalDv = clampDv(dv12s + dv3);

      const desSelf = rotateVec(prevDirX[index], prevDirY[index], totalAngle);
      const limSelf = limitTurn(prevDirX[index], prevDirY[index], desSelf.x, desSelf.y);
      const selfDirX = limSelf.x;
      const selfDirY = limSelf.y;
      const selfSpeed = Math.max(1, self.baseSpeed + totalDv);

      let x = self.x;
      let y = self.y;
      let collisions = 0;
      let step1Collisions = 0;

      for (let step = 1; step <= PRED_STEPS; step++) {
        const dxT = self.targetX - x;
        const dyT = self.targetY - y;
        const distT = Math.hypot(dxT, dyT);
        if (distT <= selfSpeed) {
          x = self.targetX;
          y = self.targetY;
        } else {
          x += selfDirX * selfSpeed;
          y += selfDirY * selfSpeed;

          if (x < RADIUS) x = RADIUS;
          if (x > WIDTH - RADIUS) x = WIDTH - RADIUS;
          if (y < RADIUS) y = RADIUS;
          if (y > HEIGHT - RADIUS) y = HEIGHT - RADIUS;
        }

        for (let j = 0; j < N; j++) {
          if (j === index) continue;
          const b = ballsRight[j];

          const dx0 = self.x - b.x;
          const dy0 = self.y - b.y;
          if (dx0 * dx0 + dy0 * dy0 > MAX_NEIGHBOR_DIST2) continue;

          const ox = b.x + plannedDirX[j] * plannedSpeed[j] * step;
          const oy = b.y + plannedDirY[j] * plannedSpeed[j] * step;

          const dx = x - ox;
          const dy = y - oy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= TOUCH2_COLLIDE) {
            const weight = Math.pow(DISCOUNT_A, step - 1);
            collisions += weight * 1000;
            if (step === 1) step1Collisions += 1000;
          } else if (d2 <= TOUCH2_AVOID) {
            const weight = Math.pow(DISCOUNT_A, step - 1);
            collisions += weight;
            if (step === 1) step1Collisions++;
          }
        }
      }

      return { collisions, step1Collisions };
    };

    // STEP 0: safe controls + score (layer-0 + layer-1)
    const safeControls = new Array(N);
    const needsEmergency = new Array(N).fill(false);

    const BIG_PENALTY = 1e6;

    const chosenAngles1 = new Array(N).fill(0);
    const chosenDvs1 = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      const scoresThisStep = {};
      const allowed = [];
      const baseDirX = ballsRight[i].baseDirX;
      const baseDirY = ballsRight[i].baseDirY;

      let bestColl = Infinity;
      let bestStep1 = Infinity;
      let bestAngle = 0;
      let bestDv = 0;
      let bestTargetAlign = -Infinity;

      for (const ctrl of ALL_CONTROLS) {
        const angleDeg = ctrl.angle;
        const dv = ctrl.dv;
        const key = controlKey(angleDeg, dv);

        const safe = true; // layer-0 disabled

        let score;
        let coll = Infinity;
        let step1 = Infinity;
        let targetAlign = -1;

        const desDir = rotateVec(prevDirX[i], prevDirY[i], angleDeg);
        const limDir = limitTurn(prevDirX[i], prevDirY[i], desDir.x, desDir.y);
        targetAlign = limDir.x * baseDirX + limDir.y * baseDirY;

        if (!safe) {
          score = BIG_PENALTY + (1 - targetAlign) * 10;
        } else {
          const res = predictCollisionsForActionLong(i, angleDeg, dv);
          coll = res.collisions;
          step1 = res.step1Collisions;

          const dirPenalty = (1 - targetAlign) * 10;
          score = coll + dirPenalty;

          allowed.push({ angle: angleDeg, dv });

          const better =
            step1 < bestStep1 ||
            (step1 === bestStep1 && (
              coll < bestColl ||
              (coll === bestColl && (
                targetAlign > bestTargetAlign ||
                (targetAlign === bestTargetAlign && (
                  Math.abs(dv) < Math.abs(bestDv) ||
                  (Math.abs(dv) === Math.abs(bestDv) && dv < bestDv)
                ))
              ))
            ));

          if (better) {
            bestStep1 = step1;
            bestColl = coll;
            bestAngle = angleDeg;
            bestDv = dv;
            bestTargetAlign = targetAlign;
          }
        }

        scoresThisStep[key] = score;
      }

      safeControls[i] = allowed;
      if (allowed.length === 0) {
        needsEmergency[i] = true;
      }

      chosenAngles1[i] = bestAngle;
      chosenDvs1[i] = bestDv;

      if (controlScoreHistory) {
        controlScoreHistory[i].push(scoresThisStep);
        if (controlScoreHistory[i].length > 4) {
          controlScoreHistory[i].shift();
        }
      }
    }

    // Build plan for layer-1 only (controls from layer1)
    for (let i = 0; i < N; i++) {
      const b = ballsRight[i];
      const ang1 = chosenAngles1[i];
      const dv1 = chosenDvs1[i];

      const des1 = rotateVec(prevDirX[i], prevDirY[i], ang1);
      const lim1 = limitTurn(prevDirX[i], prevDirY[i], des1.x, des1.y);

      planDir1X[i] = lim1.x;
      planDir1Y[i] = lim1.y;
      planSpeed1[i] = Math.max(1, b.baseSpeed + dv1);
    }

    // ===== LAYER 2 =====
    const chosenAngles2 = new Array(N).fill(0);
    const chosenDvs2 = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      if (needsEmergency[i]) continue;

      let bestColl = Infinity;
      let bestStep1 = Infinity;
      let bestAngle = 0;
      let bestDv = 0;
      let bestTargetAlign = -Infinity;

      const baseDirX = ballsRight[i].baseDirX;
      const baseDirY = ballsRight[i].baseDirY;

      const ang1 = chosenAngles1[i];
      const dv1 = chosenDvs1[i];

      for (const angleDeg2 of ACTION_ANGLES) {
        for (const dv2 of ACTION_DVS) {
          const totalAngle = ang1 + angleDeg2;
          const totalDv = clampDv(dv1 + dv2);

          const desDir = rotateVec(prevDirX[i], prevDirY[i], totalAngle);
          const limDir = limitTurn(prevDirX[i], prevDirY[i], desDir.x, desDir.y);
          const targetAlign = limDir.x * baseDirX + limDir.y * baseDirY;

          const { collisions: coll, step1Collisions: step1 } =
            predictCollisionsForActionShort(
              i, angleDeg2, dv2,
              chosenAngles1, chosenDvs1
            );

          const better =
            step1 < bestStep1 ||
            (step1 === bestStep1 && (
              coll < bestColl ||
              (coll === bestColl && (
                targetAlign > bestTargetAlign ||
                (targetAlign === bestTargetAlign && (
                  Math.abs(dv2) < Math.abs(bestDv) ||
                  (Math.abs(dv2) === Math.abs(bestDv) && dv2 < bestDv)
                ))
              ))
            ));

          if (better) {
            bestStep1 = step1;
            bestColl = coll;
            bestAngle = angleDeg2;
            bestDv = dv2;
            bestTargetAlign = targetAlign;
          }
        }
      }

      chosenAngles2[i] = bestAngle;
      chosenDvs2[i] = bestDv;
    }

    // Build plan for layers 1+2
    for (let i = 0; i < N; i++) {
      const b = ballsRight[i];
      const ang1 = chosenAngles1[i];
      const dv1 = chosenDvs1[i];
      const ang2 = chosenAngles2[i];
      const dv2 = chosenDvs2[i];

      const angle12 = ang1 + ang2;
      const dv12 = clampDv(dv1 + dv2);

      const des2 = rotateVec(prevDirX[i], prevDirY[i], angle12);
      const lim2 = limitTurn(prevDirX[i], prevDirY[i], des2.x, des2.y);

      planDir2X[i] = lim2.x;
      planDir2Y[i] = lim2.y;
      planSpeed2[i] = Math.max(1, b.baseSpeed + dv12);
    }

    // ===== LAYER 3 =====
    const chosenAngles3 = new Array(N).fill(0);
    const chosenDvs3 = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      if (needsEmergency[i]) continue;

      let bestColl = Infinity;
      let bestStep1 = Infinity;
      let bestAngle = 0;
      let bestDv = 0;
      let bestTargetAlign = -Infinity;

      const baseDirX = ballsRight[i].baseDirX;
      const baseDirY = ballsRight[i].baseDirY;

      const ang1 = chosenAngles1[i];
      const dv1 = chosenDvs1[i];
      const ang2 = chosenAngles2[i];
      const dv2 = chosenDvs2[i];
      const angle12 = ang1 + ang2;
      const dv12 = clampDv(dv1 + dv2);

      for (const angleDeg3 of ACTION_ANGLES) {
        for (const dv3 of ACTION_DVS) {
          const totalAngle = angle12 + angleDeg3;
          const totalDv = clampDv(dv12 + dv3);

          const desDir = rotateVec(prevDirX[i], prevDirY[i], totalAngle);
          const limDir = limitTurn(prevDirX[i], prevDirY[i], desDir.x, desDir.y);
          const targetAlign = limDir.x * baseDirX + limDir.y * baseDirY;

          const { collisions: coll, step1Collisions: step1 } =
            predictCollisionsForActionThird(
              i, angleDeg3, dv3,
              chosenAngles1, chosenDvs1,
              chosenAngles2, chosenDvs2
            );

          const better =
            step1 < bestStep1 ||
            (step1 === bestStep1 && (
              coll < bestColl ||
              (coll === bestColl && (
                targetAlign > bestTargetAlign ||
                (targetAlign === bestTargetAlign && (
                  Math.abs(dv3) < Math.abs(bestDv) ||
                  (Math.abs(dv3) === Math.abs(bestDv) && dv3 < bestDv)
                ))
              ))
            ));

          if (better) {
            bestStep1 = step1;
            bestColl = coll;
            bestAngle = angleDeg3;
            bestDv = dv3;
            bestTargetAlign = targetAlign;
          }
        }
      }

      chosenAngles3[i] = bestAngle;
      chosenDvs3[i] = bestDv;

      ballsRight[i].immediateCollisionsForecast = (bestStep1 >= 500) ? bestStep1 : 0;
    }

    // ===== LAYER-4: joint emergency re-planning based on relative velocities =====

    // First, compute total (layer1+2+3) planned controls and corresponding directions/speeds.
    const totalAngles = new Array(N);
    const totalDvs = new Array(N);
    const planDirX = new Array(N);
    const planDirY = new Array(N);
    const planSpeed = new Array(N);

    for (let i = 0; i < N; i++) {
      const a1 = chosenAngles1[i];
      const dv1 = chosenDvs1[i];
      const a2 = chosenAngles2[i];
      const dv2 = chosenDvs2[i];
      const a3 = chosenAngles3[i];
      const dv3 = chosenDvs3[i];

      const totalAngle = a1 + a2 + a3;
      const totalDv = clampDv(dv1 + dv2 + dv3);

      totalAngles[i] = totalAngle;
      totalDvs[i] = totalDv;

      const desDir = rotateVec(prevDirX[i], prevDirY[i], totalAngle);
      const limDir = limitTurn(prevDirX[i], prevDirY[i], desDir.x, desDir.y);

      planDirX[i] = limDir.x;
      planDirY[i] = limDir.y;
      planSpeed[i] = Math.max(1, ballsRight[i].baseSpeed + totalDv);
    }

    // Precompute eligibility (not too close to border for L4 graph)
    const l4Eligible = new Array(N);
    for (let i = 0; i < N; i++) {
      const bi = ballsRight[i];
      const distEdgeLeft = bi.x - RADIUS;
      const distEdgeRight = (WIDTH - RADIUS) - bi.x;
      const distEdgeTop = bi.y - RADIUS;
      const distEdgeBottom = (HEIGHT - RADIUS) - bi.y;
      const minEdgeDist = Math.min(distEdgeLeft, distEdgeRight, distEdgeTop, distEdgeBottom);
      l4Eligible[i] = (minEdgeDist >= RADIUS);
    }

    const adj = Array.from({ length: N }, () => []);
    const l4EdgesList = [];

    const jointAngles = [-45, -22, 0, 22, 45];

    // Ensure L4 diagnostic buffers exist
    if (!this.lastL4PosX || this.lastL4PosX.length !== N) {
      this.lastL4PosX = new Array(N);
      this.lastL4PosY = new Array(N);
      this.lastL4Speed = new Array(N);
    }

    for (let i = 0; i < N; i++) {
      const bi = ballsRight[i];

      // For L4 prognosis, use worst-case acceleration
      let speedI = bi.speed;
      const maxSpeedI = bi.baseSpeed + 1;
      if (speedI + 1 <= maxSpeedI) {
        speedI = speedI + 1;
      }

      // store L4 starting position and speed for diagnostics
      this.lastL4PosX[i] = bi.x;
      this.lastL4PosY[i] = bi.y;
      this.lastL4Speed[i] = speedI;

      if (!l4Eligible[i]) continue;

      for (let j = i + 1; j < N; j++) {
        const bj = ballsRight[j];
        if (!l4Eligible[j]) continue;

        const dx0 = bi.x - bj.x;
        const dy0 = bi.y - bj.y;
        if (dx0 * dx0 + dy0 * dy0 > MAX_NEIGHBOR_DIST2) continue;

        let speedJ = bj.speed;
        const maxSpeedJ = bj.baseSpeed + 1;
        if (speedJ + 1 <= maxSpeedJ) {
          speedJ = speedJ + 1;
        }

        // store j's L4 starting position/speed (as in original)
        this.lastL4PosX[j] = bj.x;
        this.lastL4PosY[j] = bj.y;
        this.lastL4Speed[j] = speedJ;

        let connected = false;

        for (let a1Idx = 0; a1Idx < jointAngles.length && !connected; a1Idx++) {
          const ang1 = jointAngles[a1Idx];
          const des1 = rotateVec(prevDirX[i], prevDirY[i], ang1);
          const lim1 = limitTurn(prevDirX[i], prevDirY[i], des1.x, des1.y);
          const vx1 = lim1.x * speedI;
          const vy1 = lim1.y * speedI;

          let xiNext = bi.x + vx1;
          let yiNext = bi.y + vy1;
          if (xiNext < RADIUS) xiNext = RADIUS;
          if (xiNext > WIDTH - RADIUS) xiNext = WIDTH - RADIUS;
          if (yiNext < RADIUS) yiNext = RADIUS;
          if (yiNext > HEIGHT - RADIUS) yiNext = HEIGHT - RADIUS;

          for (let a2Idx = 0; a2Idx < jointAngles.length && !connected; a2Idx++) {
            const ang2 = jointAngles[a2Idx];
            const des2 = rotateVec(prevDirX[j], prevDirY[j], ang2);
            const lim2 = limitTurn(prevDirX[j], prevDirY[j], des2.x, des2.y);
            const vx2 = lim2.x * speedJ;
            const vy2 = lim2.y * speedJ;

            let xjNext = bj.x + vx2;
            let yjNext = bj.y + vy2;
            if (xjNext < RADIUS) xjNext = RADIUS;
            if (xjNext > WIDTH - RADIUS) xjNext = WIDTH - RADIUS;
            if (yjNext < RADIUS) yjNext = RADIUS;
            if (yjNext > HEIGHT - RADIUS) yjNext = HEIGHT - RADIUS;

            const dx = xiNext - xjNext;
            const dy = yiNext - yjNext;
            if (dx * dx + dy * dy <= L4_CONNECT_DIST2) {
              connected = true;
            }
          }
        }

        if (connected) {
          adj[i].push(j);
          adj[j].push(i);
          l4EdgesList.push([i, j]);
        }
      }
    }

    // per-ball flag whether it has any layer-4 edges this step
    const l4EdgeFlag = new Array(N).fill(0);
    const l4ComponentId = new Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (adj[i].length > 0) l4EdgeFlag[i] = 1;
    }

    // 2) Find connected components of this graph (only vertices with degree > 0).
    const visitedComp = new Array(N).fill(false);
    const components = [];
    for (let i = 0; i < N; i++) {
      if (visitedComp[i]) continue;
      if (adj[i].length === 0) continue;

      const queue = [i];
      visitedComp[i] = true;
      const comp = [];
      for (let qh = 0; qh < queue.length; qh++) {
        const v = queue[qh];
        comp.push(v);
        for (const u of adj[v]) {
          if (!visitedComp[u]) {
            visitedComp[u] = true;
            queue.push(u);
          }
        }
      }
      if (comp.length > 0) {
        const compIndex = components.length;
        components.push(comp);
        for (const node of comp) {
          l4ComponentId[node] = compIndex;
        }
      }
    }

    // 3) For balls in components, override layer1-3 plan using joint controls {-45,0,+45} with dv=0.
    const finalAngles = totalAngles.slice();
    const finalDvs = totalDvs.slice();

    const emergFlags = new Array(N).fill(0);
    const emergAngles = new Array(N).fill('no L4');

    const evaluateJointControlForComponent = (
      comp,
      angleAssign,
      basePlanDirX,
      basePlanDirY,
      basePlanSpeed
    ) => {
      const dirXNext = new Array(N);
      const dirYNext = new Array(N);
      const speedNext = new Array(N);

      for (let idx = 0; idx < comp.length; idx++) {
        const i = comp[idx];
        const ang = angleAssign[i];
        const des = rotateVec(prevDirX[i], prevDirY[i], ang);
        const lim = limitTurn(prevDirX[i], prevDirY[i], des.x, des.y);
        dirXNext[i] = lim.x;
        dirYNext[i] = lim.y;
        speedNext[i] = ballsRight[i].baseSpeed;
      }
      for (let k = 0; k < N; k++) {
        if (dirXNext[k] === undefined) {
          dirXNext[k] = basePlanDirX[k];
          dirYNext[k] = basePlanDirY[k];
          speedNext[k] = basePlanSpeed[k];
        }
      }

      const stepCollisions = new Array(EMERGENCY_STEPS).fill(0);
      const xs = new Array(N);
      const ys = new Array(N);

      for (let step = 1; step <= EMERGENCY_STEPS; step++) {
        for (let i = 0; i < N; i++) {
          const bi = ballsRight[i];
          let xi = bi.x + dirXNext[i] * speedNext[i] * step;
          let yi = bi.y + dirYNext[i] * speedNext[i] * step;

          if (xi < RADIUS) xi = RADIUS;
          else if (xi > WIDTH - RADIUS) xi = WIDTH - RADIUS;
          if (yi < RADIUS) yi = RADIUS;
          else if (yi > HEIGHT - RADIUS) yi = HEIGHT - RADIUS;

          xs[i] = xi;
          ys[i] = yi;
        }

        let c = 0;
        for (let i = 0; i < N; i++) {
          const xi = xs[i], yi = ys[i];
          for (let j = i + 1; j < N; j++) {
            const dx = xi - xs[j];
            const dy = yi - ys[j];
            if (dx * dx + dy * dy <= TOUCH2_COLLIDE) c++;
          }
        }
        stepCollisions[step - 1] = c;
      }

      let maxAbsAngle = 0;
      for (let idx = 0; idx < comp.length; idx++) {
        const i = comp[idx];
        const targetDirX = ballsRight[i].baseDirX;
        const targetDirY = ballsRight[i].baseDirY;
        const angTarget = Math.atan2(targetDirY, targetDirX);
        const angEmerg = Math.atan2(dirYNext[i], dirXNext[i]);
        let delta = angEmerg - angTarget;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        else if (delta < -Math.PI) delta += 2 * Math.PI;
        const devDeg = Math.abs(delta * 180 / Math.PI);
        if (devDeg > maxAbsAngle) maxAbsAngle = devDeg;
      }

      return { stepCollisions, maxAbsAngle };
    };

    for (const comp of components) {
      const m = comp.length;
      if (m === 0) continue;

      const angleOptions = [-45, 0, 45];
      const totalCombos = Math.pow(angleOptions.length, m);

      const comboIndices = [];
      for (let c = 0; c < totalCombos; c++) {
        comboIndices.push(c);
      }
      for (let k = comboIndices.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        const tmpIdx = comboIndices[k];
        comboIndices[k] = comboIndices[r];
        comboIndices[r] = tmpIdx;
      }

      let chosen = null;

      function isBetterJointCandidate(a, b) {
        if (!b) return true;
        for (let s = 0; s < EMERGENCY_STEPS; s++) {
          if (a.stepCollisions[s] < b.stepCollisions[s]) return true;
          if (a.stepCollisions[s] > b.stepCollisions[s]) return false;
        }
        if (a.maxAbsAngle < b.maxAbsAngle) return true;
        if (a.maxAbsAngle > b.maxAbsAngle) return false;
        return false;
      }

      for (let idxCombo = 0; idxCombo < comboIndices.length; idxCombo++) {
        const combo = comboIndices[idxCombo];
        const angleAssign = {};
        let tmp = combo;
        for (let idxBit = 0; idxBit < m; idxBit++) {
          const i = comp[idxBit];
          const choice = tmp % angleOptions.length;
          tmp = Math.floor(tmp / angleOptions.length);
          const ang = angleOptions[choice];
          angleAssign[i] = ang;
        }

        const { stepCollisions, maxAbsAngle } =
          evaluateJointControlForComponent(
            comp,
            angleAssign,
            planDirX,
            planDirY,
            planSpeed
          );

        const cand = { angleAssign, stepCollisions, maxAbsAngle };
        if (isBetterJointCandidate(cand, chosen)) {
          chosen = cand;
        }
      }

      if (logL4ComponentsToConsole && chosen) {
        const compAngles = comp.map(i => ({ index: i, angle: chosen.angleAssign[i] }));
        console.log('L4 component', comp, 'chosenAngles', compAngles,
                    'stepCollisions', chosen.stepCollisions,
                    'maxAbsAngle', chosen.maxAbsAngle);
      }

      for (let idx = 0; idx < comp.length; idx++) {
        const i = comp[idx];
        finalAngles[i] = chosen.angleAssign[i];
        finalDvs[i] = 0;
        emergFlags[i] = 1;
        emergAngles[i] = chosen.angleAssign[i];
      }
    }

    // Remember L4 graph info for visualization/highlighting
    this.lastL4EdgeFlag = l4EdgeFlag.slice();
    this.lastL4ComponentId = l4ComponentId.slice();
    this.lastL4Edges = l4EdgesList.slice();

    // Store post-layer-4 velocity vectors for the last executed step
    this.lastStepL4Vx = new Array(N);
    this.lastStepL4Vy = new Array(N);
    for (let i = 0; i < N; i++) {
      const des = rotateVec(prevDirX[i], prevDirY[i], finalAngles[i]);
      const lim = limitTurn(prevDirX[i], prevDirY[i], des.x, des.y);
      const sp = Math.max(1, ballsRight[i].baseSpeed + finalDvs[i]);
      this.lastStepL4Vx[i] = lim.x * sp;
      this.lastStepL4Vy[i] = lim.y * sp;
    }

    return {
      prevDirX,
      prevDirY,
      chosenAngles1,
      chosenDvs1,
      chosenAngles2,
      chosenDvs2,
      chosenAngles3,
      chosenDvs3,
      totalAngles,
      totalDvs,
      finalAngles,
      finalDvs,
      emergFlags,
      emergAngles,
      l4EdgeFlag,
      l4ComponentId,
      l4EdgesList,
      // layer-1 / layer-1+2 plans are returned mainly for diagnostics if needed
      planDir1X,
      planDir1Y,
      planSpeed1,
      planDir2X,
      planDir2Y,
      planSpeed2,
    };
  }
}
