// latinSquare.js — default group → condition assignment. Hardcoded here; the admin panel
// can override it via Firestore (projectMeta/settings.latinSquare). This file is the fallback.

export const LATIN_SQUARE_DEFAULT = {
  group1: { text1: 'passive', text2: 'active', text3: 'constructive', text4: 'control' },
  group2: { text1: 'active', text2: 'control', text3: 'passive', text4: 'constructive' },
  group3: { text1: 'constructive', text2: 'passive', text3: 'control', text4: 'active' },
  group4: { text1: 'control', text2: 'constructive', text3: 'active', text4: 'passive' },
};

export function getDefaultCondition(group, textIndex) {
  const textKey = `text${textIndex + 1}`;
  const groupKey = `group${group}`;
  return LATIN_SQUARE_DEFAULT[groupKey]?.[textKey] ?? null;
}
