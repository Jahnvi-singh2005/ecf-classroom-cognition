// admin/settings.js — Admin Panel logic (settings/index.html). Build-spec §15 /
// rebuild plan §8.1. Password-gated, three tabs: General Settings, Content Editor,
// Security. All saves go through firebase.js's saveContent()/changePassword().
//
// PRA questions are edited exclusively via the Content Editor's "Assessment
// questions" section (Section A), matching build-spec's self-contained PRA question
// object schema (§5.4) and how pra.js actually reads content (a dedicated
// praQuestions array, never scanned out of `slides`). The slide-types table in
// build-spec §15 / rebuild plan §8.1 also lists four "PRA — ..." entries as if they
// were addable Slides-Editor types, but that would be dead data no runtime code
// reads — slides.js's Section B here only offers the 6 types that are genuinely part
// of the `slides` array (pure-text/active-*/constructive-*/guided-resolution).

import { initFirebase, loadContent, saveContent, validatePassword, changePassword } from '../firebase.js';
import { LATIN_SQUARE_DEFAULT } from '../latinSquare.js';

const CONDITIONS = ['passive', 'active', 'constructive', 'control'];
const CONDITION_LABELS = { passive: 'Passive', active: 'Active', constructive: 'Constructive', control: 'Control' };
const GROUP_KEYS = ['group1', 'group2', 'group3', 'group4'];
const TEXT_KEYS = ['text1', 'text2', 'text3', 'text4'];

const SLIDE_TYPE_META = {
  'pure-text': { label: 'Pure text', bg: 'var(--accent-light)', color: 'var(--accent)' },
  'active-question-probe': { label: 'Active — question probe', bg: '#FDF3DC', color: '#8A6010' },
  'active-options': { label: 'Active — options', bg: '#FDF3DC', color: '#8A6010' },
  'constructive-question-probe': { label: 'Constructive — question probe', bg: '#EEE8F8', color: '#5B3FA0' },
  'constructive-textbox': { label: 'Constructive — text box', bg: '#EEE8F8', color: '#5B3FA0' },
  'guided-resolution': { label: 'Guided resolution', bg: '#EDF7F1', color: 'var(--success)' },
};
const SLIDE_TYPES = Object.keys(SLIDE_TYPE_META);
const SLIDE_TYPE_FIELDS = {
  'pure-text': { hasContent: true, hasOptions: false, hasWords: false },
  'active-question-probe': { hasContent: true, hasOptions: false, hasWords: false },
  'active-options': { hasContent: false, hasOptions: true, hasWords: false },
  'constructive-question-probe': { hasContent: true, hasOptions: false, hasWords: false },
  'constructive-textbox': { hasContent: false, hasOptions: false, hasWords: true },
  'guided-resolution': { hasContent: true, hasOptions: false, hasWords: false },
};

const TIMING_ROWS = [
  { key: 'pureText', label: 'Pure text slide', hasWords: false },
  { key: 'questionProbe', label: 'Question probe (Active / Constructive / PRA)', hasWords: false },
  { key: 'activeOptions', label: 'Active — options', hasWords: false },
  { key: 'constructiveTextBox', label: 'Constructive — text box', hasWords: true },
  { key: 'praMcOptions', label: 'PRA — MC options', hasWords: false },
  { key: 'praWrittenTextBox', label: 'PRA — written text box', hasWords: true },
  { key: 'guidedResolution', label: 'Guided resolution', hasWords: false },
];

let appEl = null;
let workingConfig = null;
let unlockedPassword = null;
let activeTab = 'general';
let activeGroupIndex = 0;
let activeTextIndex = 0;
let lastInteractedSlideIndex = null;

// ─── Helpers ────────────────────────────────────────────────────────────

const msToS = (ms) => (Number.isFinite(ms) ? ms / 1000 : 0);
const sToMs = (s) => Math.round((Number(s) || 0) * 1000);
const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

// ─── Scaffolding (no hardcoded timing defaults — build-spec §22) ──────────

function createDefaultText(id) {
  return {
    id,
    title: '',
    groups: {
      group1: { condition: null, slides: [], praQuestions: [] },
      group2: { condition: null, slides: [], praQuestions: [] },
      group3: { condition: null, slides: [], praQuestions: [] },
      group4: { condition: null, slides: [], praQuestions: [] },
    },
  };
}

function createDefaultConfig() {
  return {
    version: 1,
    updatedAt: Date.now(),
    latinSquare: deepClone(LATIN_SQUARE_DEFAULT),
    globalTimingDefaults: {
      pureText: { minMs: 0, maxMs: 0 },
      questionProbe: { minMs: 0, maxMs: 0 },
      activeOptions: { minMs: 0, maxMs: 0 },
      constructiveTextBox: { minMs: 0, maxMs: 0, minWords: 0, maxWords: 0 },
      praMcOptions: { minMs: 0, maxMs: 0 },
      praWrittenTextBox: { minMs: 0, maxMs: 0, minWords: 0, maxWords: 0 },
      guidedResolution: { minMs: 0, maxMs: 0 },
      baseline: { minMs: 0, maxMs: 0 },
      fixationCross: { durationMs: 0 },
    },
    texts: {
      text1: createDefaultText('text1'),
      text2: createDefaultText('text2'),
      text3: createDefaultText('text3'),
      text4: createDefaultText('text4'),
    },
  };
}

function createDefaultQuestion() {
  return {
    id: uid(),
    heading: '',
    type: 'mc',
    prompt: '',
    options: { A: '', B: '', C: '', D: '', correct: 'A' },
    timing: { thinkingMinMs: 0, thinkingMaxMs: 0, responseMinMs: 0, responseMaxMs: 0 },
    wordLimits: { min: 0, max: 0 },
    coachNotes: '',
  };
}

function createDefaultSlide(type) {
  const slide = { id: uid(), type, timing: { minMs: 0, maxMs: 0 } };
  const fields = SLIDE_TYPE_FIELDS[type];
  if (fields.hasContent) slide.content = '';
  if (fields.hasOptions) slide.options = { A: '', B: '', C: '', D: '', correct: 'A' };
  if (fields.hasWords) { slide.timing.minWords = 0; slide.timing.maxWords = 0; }
  return slide;
}

// The `condition` field stored per group is denormalised display metadata (build-spec
// §5.4 shows it on every group block) — the Latin square is the real source of truth
// at runtime (content.js's getCondition()), so keep this field in sync on every edit.
function syncConditions(config) {
  TEXT_KEYS.forEach((textKey) => {
    GROUP_KEYS.forEach((groupKey) => {
      const group = config.texts[textKey]?.groups?.[groupKey];
      if (group) group.condition = config.latinSquare?.[groupKey]?.[textKey] || null;
    });
  });
}

// ─── Password gate ─────────────────────────────────────────────────────────

function renderPasswordGate() {
  appEl.innerHTML = `
    <div class="password-gate-overlay">
      <div class="password-gate-card">
        <span class="eyebrow">Admin Access</span>
        <h1 style="font-size:20px;">Enter Settings Password</h1>
        <div class="field" style="margin-top:16px;text-align:left;">
          <input type="password" id="gate-password" placeholder="Password"/>
        </div>
        <p class="field-error" id="gate-error"></p>
        <button type="button" id="gate-submit" class="btn btn-primary">Unlock</button>
      </div>
    </div>
  `;

  const input = appEl.querySelector('#gate-password');
  const errorEl = appEl.querySelector('#gate-error');
  input.focus();

  const submit = async () => {
    const value = input.value;
    const valid = await validatePassword(value);
    if (valid) {
      unlockedPassword = value;
      render();
    } else {
      errorEl.textContent = 'Incorrect password. Please try again.';
    }
  };

  appEl.querySelector('#gate-submit').addEventListener('click', submit);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
}

// ─── Shell + tab switching ──────────────────────────────────────────────────

function render() {
  appEl.innerHTML = `
    <div class="admin-shell">
      <div class="admin-sidebar">
        <div class="admin-sidebar-title">Admin Panel</div>
        <div class="admin-nav-item ${activeTab === 'general' ? 'active' : ''}" data-tab="general">General Settings</div>
        <div class="admin-nav-item ${activeTab === 'content' ? 'active' : ''}" data-tab="content">Content Editor</div>
        <div class="admin-nav-item ${activeTab === 'security' ? 'active' : ''}" data-tab="security">Security</div>
      </div>
      <div class="admin-main ${activeTab === 'content' ? 'no-pad' : ''}" id="admin-main"></div>
    </div>
  `;

  appEl.querySelectorAll('.admin-nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      activeTab = item.dataset.tab;
      render();
    });
  });

  const mainEl = appEl.querySelector('#admin-main');
  if (activeTab === 'general') renderGeneralTab(mainEl);
  else if (activeTab === 'content') renderContentTab(mainEl);
  else renderSecurityTab(mainEl);
}

// ─── Tab 1: General Settings ────────────────────────────────────────────────

function renderGeneralTab(container) {
  const defaults = workingConfig.globalTimingDefaults;

  container.innerHTML = `
    <div class="settings-grid-2">
      <div class="settings-card">
        <div class="settings-section-title">Global Timing Defaults</div>
        <p style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.5;">Fallback values. Per-slide overrides in Content Editor take precedence.</p>
        <table class="settings-table">
          <thead><tr><th>Slide Type</th><th>Min (s)</th><th>Max (s)</th><th>Min words</th><th>Max words</th></tr></thead>
          <tbody>
            ${TIMING_ROWS.map((row) => `
              <tr>
                <td>${row.label}</td>
                <td><input class="settings-input" type="number" min="0" data-timing-key="${row.key}" data-field="minMs" value="${msToS(defaults[row.key]?.minMs)}"/></td>
                <td><input class="settings-input" type="number" min="0" data-timing-key="${row.key}" data-field="maxMs" value="${msToS(defaults[row.key]?.maxMs)}"/></td>
                <td>${row.hasWords ? `<input class="settings-input" type="number" min="0" data-timing-key="${row.key}" data-field="minWords" value="${defaults[row.key]?.minWords ?? 0}"/>` : '<span style="color:var(--muted);">—</span>'}</td>
                <td>${row.hasWords ? `<input class="settings-input" type="number" min="0" data-timing-key="${row.key}" data-field="maxWords" value="${defaults[row.key]?.maxWords ?? 0}"/>` : '<span style="color:var(--muted);">—</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="settings-stack">
        <div class="settings-card">
          <div class="settings-section-title">EEG &amp; Baseline</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="settings-small-field"><label>Baseline min (s)</label><input type="number" min="0" id="baseline-min" value="${msToS(defaults.baseline?.minMs)}"/></div>
            <div class="settings-small-field"><label>Baseline max (s)</label><input type="number" min="0" id="baseline-max" value="${msToS(defaults.baseline?.maxMs)}"/></div>
            <div class="settings-small-field"><label>Fixation cross (s)</label><input type="number" min="0" id="fixation-duration" value="${msToS(defaults.fixationCross?.durationMs)}"/></div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-section-title">Latin Square Assignment</div>
          <p style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;">Maps subject groups to condition per text. <strong>Edit with caution.</strong></p>
          <table class="settings-table" style="font-size:12px;">
            <thead><tr><th>Group</th>${TEXT_KEYS.map((tk, i) => `<th>Text ${i + 1}</th>`).join('')}</tr></thead>
            <tbody>
              ${GROUP_KEYS.map((gk, gi) => `
                <tr>
                  <td>${gi + 1}</td>
                  ${TEXT_KEYS.map((tk) => `
                    <td>
                      <select class="settings-mini-select" data-group-key="${gk}" data-text-key="${tk}">
                        ${CONDITIONS.map((c) => `<option value="${c}" ${workingConfig.latinSquare[gk][tk] === c ? 'selected' : ''}>${CONDITION_LABELS[c]}</option>`).join('')}
                      </select>
                    </td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button type="button" id="btn-save-settings" class="btn btn-primary" style="width:auto;margin-top:0;padding:10px 28px;">Save Settings</button>
      <button type="button" id="btn-reset-defaults" class="btn btn-ghost" style="border:1px solid var(--border);">Reset to Defaults</button>
    </div>
  `;

  container.querySelectorAll('[data-timing-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const { timingKey, field } = input.dataset;
      const isTimeField = field === 'minMs' || field === 'maxMs';
      workingConfig.globalTimingDefaults[timingKey][field] = isTimeField ? sToMs(input.value) : Number(input.value) || 0;
    });
  });

  container.querySelector('#baseline-min').addEventListener('input', (e) => {
    workingConfig.globalTimingDefaults.baseline.minMs = sToMs(e.target.value);
  });
  container.querySelector('#baseline-max').addEventListener('input', (e) => {
    workingConfig.globalTimingDefaults.baseline.maxMs = sToMs(e.target.value);
  });
  container.querySelector('#fixation-duration').addEventListener('input', (e) => {
    workingConfig.globalTimingDefaults.fixationCross.durationMs = sToMs(e.target.value);
  });

  container.querySelectorAll('[data-group-key][data-text-key]').forEach((select) => {
    select.addEventListener('change', () => {
      const { groupKey, textKey } = select.dataset;
      workingConfig.latinSquare[groupKey][textKey] = select.value;
      syncConditions(workingConfig);
    });
  });

  container.querySelector('#btn-save-settings').addEventListener('click', handleSaveConfig);
  container.querySelector('#btn-reset-defaults').addEventListener('click', handleResetDefaults);
}

async function handleSaveConfig() {
  workingConfig.updatedAt = Date.now();
  workingConfig.version = (workingConfig.version || 0) + 1;
  try {
    await saveContent(workingConfig, unlockedPassword);
    window.alert('Saved.');
  } catch (error) {
    window.alert(`Could not save: ${error.message || error}`);
  }
}

function handleResetDefaults() {
  const shouldReset = window.confirm('Reset General Settings to defaults? This clears timing values and resets the Latin square to its hardcoded default. Content (texts, slides, PRA questions) is not affected.');
  if (!shouldReset) return;

  const fresh = createDefaultConfig();
  workingConfig.globalTimingDefaults = fresh.globalTimingDefaults;
  workingConfig.latinSquare = fresh.latinSquare;
  syncConditions(workingConfig);
  render();
}

// ─── Tab 2: Content Editor ──────────────────────────────────────────────────

function renderContentTab(container) {
  container.innerHTML = `
    <div class="group-tabs">
      ${GROUP_KEYS.map((gk, i) => `<div class="group-tab ${i === activeGroupIndex ? 'active' : ''}" data-group-index="${i}">Group ${i + 1}</div>`).join('')}
    </div>
    <div class="content-editor-body">
      <div class="text-list" id="text-list"></div>
      <div class="content-editor-panel" id="content-editor-panel"></div>
    </div>
  `;

  container.querySelectorAll('.group-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeGroupIndex = Number(tab.dataset.groupIndex);
      lastInteractedSlideIndex = null;
      render();
    });
  });

  renderTextList(container.querySelector('#text-list'));
  renderEditorPanel(container.querySelector('#content-editor-panel'));
}

function renderTextList(container) {
  container.innerHTML = `
    <div class="text-list-title">Texts</div>
    ${TEXT_KEYS.map((tk, i) => {
      const text = workingConfig.texts[tk];
      return `
        <div class="text-list-item ${i === activeTextIndex ? 'active' : ''}" data-text-index="${i}">
          <div class="title">Text ${i + 1}</div>
          <div class="subtitle">${escapeHtml(text.title) || '(untitled)'}</div>
        </div>
      `;
    }).join('')}
  `;

  container.querySelectorAll('.text-list-item').forEach((item) => {
    item.addEventListener('click', () => {
      activeTextIndex = Number(item.dataset.textIndex);
      lastInteractedSlideIndex = null;
      render();
    });
  });
}

function renderEditorPanel(container) {
  const groupKey = GROUP_KEYS[activeGroupIndex];
  const textKey = TEXT_KEYS[activeTextIndex];
  const text = workingConfig.texts[textKey];
  const group = text.groups[groupKey];
  const condition = workingConfig.latinSquare[groupKey][textKey];

  container.innerHTML = `
    <div class="content-editor-header">
      <div>
        <input type="text" id="text-title-input" value="${escapeAttr(text.title)}" placeholder="Text ${activeTextIndex + 1} title"
          style="font-size:16px;font-weight:600;color:var(--text);border:none;background:transparent;font-family:var(--font-ui);padding:0 0 2px;outline:none;border-bottom:1px dashed var(--border);"/>
        <div class="condition">Condition: <strong>${CONDITION_LABELS[condition] || 'Unassigned'}</strong></div>
      </div>
    </div>

    <div class="section-heading-row">
      <h3>Assessment questions (objective + short-answer)</h3>
      <button type="button" class="btn btn-secondary" id="btn-add-question" style="font-size:12px;padding:7px 16px;">+ Add question</button>
    </div>
    <div id="question-cards"></div>

    <div class="section-heading-row">
      <h3>Slides editor</h3>
      <button type="button" class="btn btn-secondary" id="btn-add-slide" style="font-size:12px;padding:7px 16px;">+ Add slide</button>
    </div>
    <div id="slide-cards"></div>

    <div class="settings-actions">
      <button type="button" id="btn-save-slides" class="btn btn-primary" style="width:auto;margin-top:0;padding:10px 24px;">Save slides</button>
    </div>
  `;

  container.querySelector('#text-title-input').addEventListener('input', (event) => {
    text.title = event.target.value;
  });

  renderQuestionCards(container.querySelector('#question-cards'), group);
  renderSlideCards(container.querySelector('#slide-cards'), group);

  container.querySelector('#btn-add-question').addEventListener('click', () => {
    group.praQuestions.push(createDefaultQuestion());
    render();
  });

  container.querySelector('#btn-add-slide').addEventListener('click', () => {
    openSlideTypePicker(group);
  });

  container.querySelector('#btn-save-slides').addEventListener('click', handleSaveConfig);
}

// ─── Section A: Assessment Questions (PRA) ─────────────────────────────────

function renderQuestionCards(container, group) {
  const questions = group.praQuestions;

  if (questions.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">No assessment questions yet. Use "+ Add question" to create one.</p>';
    return;
  }

  container.innerHTML = questions.map((q, i) => `
    <div class="editor-card" data-question-id="${q.id}">
      <div class="editor-card-head">
        <div class="editor-card-head-left"><span class="editor-card-label">Question ${i + 1}</span></div>
        <div class="editor-card-actions">
          <button type="button" class="btn" data-q-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn" data-q-action="down" ${i === questions.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-delete" data-q-action="delete">Delete</button>
        </div>
      </div>

      <div class="editor-fields-row">
        <div class="settings-small-field"><label>Heading</label><input type="text" data-q-field="heading" value="${escapeAttr(q.heading)}" placeholder="e.g. QUESTION - 1"/></div>
        <div class="settings-small-field">
          <label>Question type</label>
          <select data-q-field="type">
            <option value="mc" ${q.type === 'mc' ? 'selected' : ''}>Objective (MCQ)</option>
            <option value="written" ${q.type === 'written' ? 'selected' : ''}>Short answer</option>
          </select>
        </div>
      </div>

      <div class="settings-small-field" style="margin-top:12px;">
        <label>Prompt</label>
        <textarea class="editor-textarea" data-q-field="prompt" style="min-height:60px;">${escapeHtml(q.prompt)}</textarea>
      </div>

      ${q.type === 'mc' ? `
        <div class="editor-options-grid">
          ${['A', 'B', 'C', 'D'].map((letter) => `
            <div class="settings-small-field"><label>Option ${letter}</label><input type="text" data-q-option="${letter}" value="${escapeAttr(q.options?.[letter] || '')}"/></div>
          `).join('')}
        </div>
        <div class="settings-small-field" style="max-width:160px;margin-bottom:12px;">
          <label>Correct option</label>
          <select data-q-field="correct">
            ${['A', 'B', 'C', 'D'].map((letter) => `<option value="${letter}" ${q.options?.correct === letter ? 'selected' : ''}>${letter}</option>`).join('')}
          </select>
        </div>
      ` : `
        <div class="editor-fields-row" style="margin-bottom:12px;">
          <div class="settings-small-field"><label>Min words</label><input type="number" min="0" data-q-word="min" value="${q.wordLimits?.min ?? 0}"/></div>
          <div class="settings-small-field"><label>Max words</label><input type="number" min="0" data-q-word="max" value="${q.wordLimits?.max ?? 0}"/></div>
        </div>
      `}

      <div class="editor-fields-row">
        <div class="settings-small-field"><label>Thinking min (s)</label><input type="number" min="0" data-q-timing="thinkingMinMs" value="${msToS(q.timing?.thinkingMinMs)}"/></div>
        <div class="settings-small-field"><label>Thinking max (s)</label><input type="number" min="0" data-q-timing="thinkingMaxMs" value="${msToS(q.timing?.thinkingMaxMs)}"/></div>
        <div class="settings-small-field"><label>Response min (s)</label><input type="number" min="0" data-q-timing="responseMinMs" value="${msToS(q.timing?.responseMinMs)}"/></div>
        <div class="settings-small-field"><label>Response max (s)</label><input type="number" min="0" data-q-timing="responseMaxMs" value="${msToS(q.timing?.responseMaxMs)}"/></div>
      </div>

      <div class="settings-small-field" style="margin-top:12px;">
        <label>Coach notes <span style="text-transform:none;font-weight:400;">(internal only, not shown to participant)</span></label>
        <textarea class="editor-textarea" data-q-field="coachNotes" style="min-height:50px;">${escapeHtml(q.coachNotes || '')}</textarea>
      </div>
    </div>
  `).join('');

  bindQuestionCardEvents(container, group);
}

function bindQuestionCardEvents(container, group) {
  container.querySelectorAll('[data-question-id]').forEach((card) => {
    const id = card.dataset.questionId;
    const question = group.praQuestions.find((q) => q.id === id);

    card.querySelectorAll('[data-q-field]').forEach((el) => {
      const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, () => {
        const field = el.dataset.qField;
        if (field === 'correct') {
          question.options.correct = el.value;
        } else {
          question[field] = el.value;
        }
        if (field === 'type') render();
      });
    });

    card.querySelectorAll('[data-q-option]').forEach((el) => {
      el.addEventListener('input', () => {
        question.options[el.dataset.qOption] = el.value;
      });
    });

    card.querySelectorAll('[data-q-word]').forEach((el) => {
      el.addEventListener('input', () => {
        question.wordLimits = question.wordLimits || {};
        question.wordLimits[el.dataset.qWord] = Number(el.value) || 0;
      });
    });

    card.querySelectorAll('[data-q-timing]').forEach((el) => {
      el.addEventListener('input', () => {
        question.timing = question.timing || {};
        question.timing[el.dataset.qTiming] = sToMs(el.value);
      });
    });

    card.querySelectorAll('[data-q-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.qAction;
        const index = group.praQuestions.findIndex((q) => q.id === id);
        if (action === 'delete') group.praQuestions.splice(index, 1);
        else if (action === 'up' && index > 0) {
          [group.praQuestions[index - 1], group.praQuestions[index]] = [group.praQuestions[index], group.praQuestions[index - 1]];
        } else if (action === 'down' && index < group.praQuestions.length - 1) {
          [group.praQuestions[index + 1], group.praQuestions[index]] = [group.praQuestions[index], group.praQuestions[index + 1]];
        }
        render();
      });
    });
  });
}

// ─── Section B: Slides Editor ───────────────────────────────────────────────

function renderSlideCards(container, group) {
  const slides = group.slides;

  if (slides.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">No slides yet. Use "+ Add slide" to create one.</p>';
    return;
  }

  container.innerHTML = slides.map((slide, i) => {
    const meta = SLIDE_TYPE_META[slide.type] || { label: slide.type, bg: 'var(--border)', color: 'var(--text)' };
    const fields = SLIDE_TYPE_FIELDS[slide.type] || {};

    return `
      <div class="editor-card" data-slide-id="${slide.id}">
        <div class="editor-card-head">
          <div class="editor-card-head-left">
            <span class="editor-card-label">Slide ${i + 1}</span>
            <span class="slide-type-badge" style="background:${meta.bg};color:${meta.color};">${meta.label}</span>
          </div>
          <div class="editor-card-actions">
            <button type="button" class="btn" data-s-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn" data-s-action="down" ${i === slides.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-delete" data-s-action="delete">Delete</button>
          </div>
        </div>

        ${fields.hasContent ? `<textarea class="editor-textarea" data-s-field="content">${escapeHtml(slide.content || '')}</textarea>` : ''}

        ${fields.hasOptions ? `
          <div class="editor-options-grid">
            ${['A', 'B', 'C', 'D'].map((letter) => `
              <div class="settings-small-field"><label>Option ${letter}</label><input type="text" data-s-option="${letter}" value="${escapeAttr(slide.options?.[letter] || '')}"/></div>
            `).join('')}
          </div>
          <div class="settings-small-field" style="max-width:160px;margin-bottom:12px;">
            <label>Correct option</label>
            <select data-s-field="correct">
              ${['A', 'B', 'C', 'D'].map((letter) => `<option value="${letter}" ${slide.options?.correct === letter ? 'selected' : ''}>${letter}</option>`).join('')}
            </select>
          </div>
        ` : ''}

        <div class="editor-fields-row">
          <div class="settings-small-field"><label>Min time (s)</label><input type="number" min="0" data-s-timing="minMs" value="${msToS(slide.timing?.minMs)}"/></div>
          <div class="settings-small-field"><label>Max time (s)</label><input type="number" min="0" data-s-timing="maxMs" value="${msToS(slide.timing?.maxMs)}"/></div>
          ${fields.hasWords ? `
            <div class="settings-small-field"><label>Min words</label><input type="number" min="0" data-s-word="minWords" value="${slide.timing?.minWords ?? 0}"/></div>
            <div class="settings-small-field"><label>Max words</label><input type="number" min="0" data-s-word="maxWords" value="${slide.timing?.maxWords ?? 0}"/></div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  bindSlideCardEvents(container, group);
}

function bindSlideCardEvents(container, group) {
  container.querySelectorAll('[data-slide-id]').forEach((card) => {
    const id = card.dataset.slideId;
    const slide = group.slides.find((s) => s.id === id);

    card.addEventListener('click', () => {
      lastInteractedSlideIndex = group.slides.findIndex((s) => s.id === id);
    });

    card.querySelectorAll('[data-s-field="content"]').forEach((el) => {
      el.addEventListener('input', () => { slide.content = el.value; });
    });

    card.querySelectorAll('[data-s-field="correct"]').forEach((el) => {
      el.addEventListener('change', () => { slide.options.correct = el.value; });
    });

    card.querySelectorAll('[data-s-option]').forEach((el) => {
      el.addEventListener('input', () => {
        slide.options = slide.options || {};
        slide.options[el.dataset.sOption] = el.value;
      });
    });

    card.querySelectorAll('[data-s-timing]').forEach((el) => {
      el.addEventListener('input', () => {
        slide.timing = slide.timing || {};
        slide.timing[el.dataset.sTiming] = sToMs(el.value);
      });
    });

    card.querySelectorAll('[data-s-word]').forEach((el) => {
      el.addEventListener('input', () => {
        slide.timing = slide.timing || {};
        slide.timing[el.dataset.sWord] = Number(el.value) || 0;
      });
    });

    card.querySelectorAll('[data-s-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.sAction;
        const index = group.slides.findIndex((s) => s.id === id);
        if (action === 'delete') group.slides.splice(index, 1);
        else if (action === 'up' && index > 0) {
          [group.slides[index - 1], group.slides[index]] = [group.slides[index], group.slides[index - 1]];
        } else if (action === 'down' && index < group.slides.length - 1) {
          [group.slides[index + 1], group.slides[index]] = [group.slides[index], group.slides[index + 1]];
        }
        lastInteractedSlideIndex = Math.max(0, Math.min(index, group.slides.length - 1));
        render();
      });
    });
  });
}

function openSlideTypePicker(group) {
  const insertAt = (lastInteractedSlideIndex === null ? group.slides.length - 1 : lastInteractedSlideIndex) + 1;

  const picker = document.createElement('div');
  picker.className = 'editor-card';
  picker.innerHTML = `
    <div class="settings-small-field">
      <label>Choose slide type to insert</label>
      <select id="slide-type-picker-select">
        ${SLIDE_TYPES.map((t) => `<option value="${t}">${SLIDE_TYPE_META[t].label}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button type="button" class="btn btn-primary" id="slide-type-picker-confirm" style="width:auto;margin-top:0;padding:8px 18px;">Insert slide</button>
      <button type="button" class="btn btn-ghost" id="slide-type-picker-cancel" style="border:1px solid var(--border);">Cancel</button>
    </div>
  `;

  const slideCardsEl = appEl.querySelector('#slide-cards');
  slideCardsEl.prepend(picker);

  picker.querySelector('#slide-type-picker-confirm').addEventListener('click', () => {
    const type = picker.querySelector('#slide-type-picker-select').value;
    group.slides.splice(insertAt, 0, createDefaultSlide(type));
    lastInteractedSlideIndex = insertAt;
    render();
  });

  picker.querySelector('#slide-type-picker-cancel').addEventListener('click', () => picker.remove());
}

// ─── Tab 3: Security ────────────────────────────────────────────────────────

function renderSecurityTab(container) {
  container.innerHTML = `
    <div class="settings-card" style="max-width:420px;">
      <div class="settings-section-title">Change Experimenter Password</div>
      <div class="settings-small-field" style="margin-bottom:12px;"><label>Current password</label><input type="password" id="sec-current"/></div>
      <div class="settings-small-field" style="margin-bottom:12px;"><label>New password</label><input type="password" id="sec-new"/></div>
      <div class="settings-small-field" style="margin-bottom:16px;"><label>Confirm new password</label><input type="password" id="sec-confirm"/></div>
      <p class="field-error" id="sec-error"></p>
      <button type="button" id="btn-change-password" class="btn btn-primary" style="width:auto;padding:10px 24px;">Update Password</button>
    </div>
  `;

  container.querySelector('#btn-change-password').addEventListener('click', handleChangePassword);
}

async function handleChangePassword() {
  const current = appEl.querySelector('#sec-current').value;
  const next = appEl.querySelector('#sec-new').value;
  const confirmValue = appEl.querySelector('#sec-confirm').value;
  const errorEl = appEl.querySelector('#sec-error');
  errorEl.textContent = '';

  const currentValid = await validatePassword(current);
  if (!currentValid) { errorEl.textContent = 'Current password is incorrect.'; return; }
  if (!next) { errorEl.textContent = 'Enter a new password.'; return; }
  if (next !== confirmValue) { errorEl.textContent = 'New password and confirmation do not match.'; return; }

  try {
    await changePassword(next);
    unlockedPassword = next;
    window.alert('Password updated.');
    appEl.querySelector('#sec-current').value = '';
    appEl.querySelector('#sec-new').value = '';
    appEl.querySelector('#sec-confirm').value = '';
  } catch (error) {
    errorEl.textContent = `Could not update password: ${error.message || error}`;
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function initAdminApp() {
  appEl = document.getElementById('app');
  initFirebase();

  const loaded = await loadContent();
  workingConfig = loaded ? deepClone(loaded) : createDefaultConfig();
  syncConditions(workingConfig);

  renderPasswordGate();
}

initAdminApp();
