import { DEFAULT_VIS_FPS, NUM_BALLS } from './config.js';
import { createWorld, updateLeft, updateRight } from './sim2d.js';
import { drawLeft, drawRight } from './ui.js';
import { createZoomedCollisionSnapshot, createL4ControlsSnapshot } from './diagnostics.js';
import { RightFieldBrain } from './policy_right.js';

window.addEventListener('load', () => {
  const canvas1 = document.getElementById('field1');
  const ctx1 = canvas1.getContext('2d');
  const canvas2 = document.getElementById('field2');
  const ctx2 = canvas2.getContext('2d');

  const dom = {
    statsLeftCollDiv: document.getElementById('stats-left-coll'),
    statsLeftFramesDiv: document.getElementById('stats-left-frames'),
    statsRightCollDiv: document.getElementById('stats-right-coll'),
    statsRightFramesDiv: document.getElementById('stats-right-frames'),
    statsRightLayer2Div: document.getElementById('stats-right-layer2'),
    statsRightLayer3Div: document.getElementById('stats-right-layer3'),
    statsRightEmergencyDiv: document.getElementById('stats-right-emergency'),
    statsRightSharpDiv: document.getElementById('stats-right-sharp'),
  };

  const world = createWorld();
  const brain = new RightFieldBrain();

  const runtime = {
    paused: false,
    highlightL4Components: true,
    logL4ComponentsToConsole: false,
    visFps: DEFAULT_VIS_FPS,
  };

  function requestNextFrame() {
    if (runtime.paused) return;
    if (runtime.visFps <= 0) {
      setTimeout(() => requestAnimationFrame(loop), 50);
      return;
    }
    const extraDelayMs = Math.max(0, Math.round((1000 / runtime.visFps) - (1000 / DEFAULT_VIS_FPS)));
    if (extraDelayMs > 0) {
      setTimeout(() => requestAnimationFrame(loop), extraDelayMs);
    } else {
      requestAnimationFrame(loop);
    }
  }

  function loop() {
    if (runtime.paused) return;

    updateLeft(world, dom);
    drawLeft(ctx1, world);

    updateRight(world, dom, brain, runtime);
    drawRight(ctx2, world, brain, runtime);

    if (world.pendingCollisionPair && !runtime.paused) {
      const i = world.pendingCollisionPair.i;
      const j = world.pendingCollisionPair.j;

      // Always create normal zoom snapshot
      createZoomedCollisionSnapshot(world, brain, i, j);

      // If balls were NOT in one L4 connected component, create extra snapshot
      let sameComponent = false;
      if (brain.lastL4ComponentId &&
          brain.lastL4ComponentId[i] >= 0 &&
          brain.lastL4ComponentId[j] >= 0 &&
          brain.lastL4ComponentId[i] === brain.lastL4ComponentId[j]) {
        sameComponent = true;
      }
      if (!sameComponent) {
        createL4ControlsSnapshot(world, brain, i, j);
      }

      // XLSX collision log intentionally removed (per user request)
      world.pendingCollisionPair = null;
      runtime.paused = true;
      return;
    }

    if (!runtime.paused) {
      requestNextFrame();
    }
  }

  window.addEventListener('keydown', (e) => {
    // Visualization pacing only (no model change)
    if (e.key === '+' || e.key === '=') {
      runtime.visFps = Math.min(DEFAULT_VIS_FPS, runtime.visFps + 5);
      console.log('visFps:', runtime.visFps);
      return;
    }
    if (e.key === '-') {
      runtime.visFps = Math.max(0, runtime.visFps - 5);
      console.log('visFps:', runtime.visFps);
      return;
    }

    if (e.code === 'Space') {
      // Toggle freeze/unfreeze.
      // Ignore key repeat to avoid rapid toggling when Space is held down.
      e.preventDefault();
      if (e.repeat) return;
      runtime.paused = !runtime.paused;
      if (!runtime.paused) requestNextFrame();
      return;
    } else if (e.code === 'KeyH') {
      runtime.highlightL4Components = !runtime.highlightL4Components;
      console.log('Highlight L4 components:', runtime.highlightL4Components);
    } else if (e.code === 'KeyL') {
      runtime.logL4ComponentsToConsole = !runtime.logL4ComponentsToConsole;
      console.log('Log L4 components to console:', runtime.logL4ComponentsToConsole);
    }
  });

  requestNextFrame();
});
