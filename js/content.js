// content.js — content loader. On session start, fetches projectMeta/settings from
// Firestore once and stores it in state.content; all screens read from state.content
// afterwards (no further Firestore reads during the session). The admin panel reads
// and writes content separately, not through this module.

import { getState, setState } from './state.js';
import { loadContent as fetchContent } from './firebase.js';
import { getDefaultCondition } from './latinSquare.js';

export async function loadContentIntoState() {
  const content = await fetchContent();
  setState({ content });
  return content;
}

export function getCondition(group, textIndex) {
  const { content } = getState();
  const textKey = `text${textIndex + 1}`;
  const groupKey = `group${group}`;
  return content?.latinSquare?.[groupKey]?.[textKey] ?? getDefaultCondition(group, textIndex);
}

// Text metadata (id, title, praQuestions, conditions) for the given zero-based text index.
export function getTextMeta(textIndex) {
  const { content } = getState();
  const textKey = `text${textIndex + 1}`;
  return content?.texts?.[textKey] ?? null;
}

// The condition-specific content block for a text: { slides }. Content is authored
// once per (text, condition) pair — not per group. Which condition a given group
// sees for a given text is decided separately, by getCondition() above (the Latin
// square); this function just fetches that condition's actual slides.
export function getConditionContent(condition, textIndex) {
  const textMeta = getTextMeta(textIndex);
  return textMeta?.conditions?.[condition] ?? null;
}

export function getTextSlides(condition, textIndex) {
  return getConditionContent(condition, textIndex)?.slides ?? [];
}

// PRA questions are shared across all four conditions for a text — stored once at
// the text level (texts.text1.praQuestions), not per condition.
export function getPraQuestions(textIndex) {
  return getTextMeta(textIndex)?.praQuestions ?? [];
}
