// screens/breakScreen.js — Break Screen. Build-spec §11.11 / rebuild plan §6.11.
// Shown after each PRA except the last (pra.js already routes straight to 'done'
// after text 4, so this module is only ever mounted when there IS a next text).
// The only post-experiment mouse-clickable button in the whole app.

import { getState, setState } from '../state.js';
import { goToPhase } from '../main.js';

let containerRef = null;

function render() {
  const { currentTextIndex } = getState();
  const completedTextNumber = currentTextIndex + 1;
  const nextTextNumber = completedTextNumber + 1;

  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="center-wrap">
      <div class="break-inner">
        <div class="break-icon">✓</div>
        <h2>Text ${completedTextNumber} complete</h2>
        <p class="subtitle" style="margin-bottom:0;">Take a short break if you need one. Continue when you are ready to begin the next text.</p>
        <button type="button" id="btn-next" class="btn btn-primary" style="width:auto;padding:12px 40px;margin-top:16px;">Begin Text ${nextTextNumber} →</button>
      </div>
    </div>
  `;

  containerRef.querySelector('#btn-next').addEventListener('click', handleBeginNext);
}

// Same EEG-skip fork as instructions.js: fixation only shown when eegMode is on.
function handleBeginNext() {
  const { currentTextIndex, eegMode } = getState();
  setState({ currentTextIndex: currentTextIndex + 1, currentSlideIndex: 0 });
  goToPhase(eegMode ? 'fixation' : 'stimulus');
}

export function mount(container) {
  containerRef = container;
  render();
}

export function unmount() {
  containerRef = null;
}
