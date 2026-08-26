// screens/praIntro.js — "Post-Reading Assessment starts" announcement slide. Shown
// once per text, right after the reading (and any embedded tasks/guided resolutions)
// for that text finishes, before the first PRA question mounts. No buttons, no mouse
// interaction — Spacebar is the only way forward, matching the reading-slide
// convention (visual style reused from stimulus.js's per-text title slide).

import { getState } from '../state.js';
import { registerHandler, unregisterHandler } from '../keyboard.js';
import { goToPhase } from '../main.js';

let containerRef = null;

function render() {
  const { currentTextIndex } = getState();

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="reading-layout">
      <div class="reading-body title-slide-body">
        <div class="title-slide-card">
          <span class="section-label">Text ${currentTextIndex + 1}</span>
          <h1 class="title-slide-heading">Post-reading assessment starts now</h1>
          <p class="title-slide-author">You will answer 6 questions about the text you just read.</p>
        </div>
      </div>
      <div class="reading-footer">
        <div class="kbd-hint"><kbd class="kbd">Spacebar</kbd> to begin</div>
      </div>
    </div>
  `;

  registerHandler('space', advance);
}

function advance() {
  unregisterHandler('space');
  goToPhase('pra');
}

export function mount(container) {
  containerRef = container;
  render();
}

export function unmount() {
  unregisterHandler('space');
  containerRef = null;
}
