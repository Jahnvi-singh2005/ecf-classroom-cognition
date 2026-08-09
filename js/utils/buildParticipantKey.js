// buildParticipantKey.js — copied verbatim (logic unchanged) from the existing repo's
// src/services/ExperimentDataService.ts, with TypeScript types stripped for vanilla JS.

function normalizeForKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function buildParticipantKey(participant) {
  if (participant.subjectId?.trim()) {
    return `subject-${normalizeForKey(participant.subjectId)}`;
  }

  if (participant.email?.trim()) {
    return `email-${normalizeForKey(participant.email)}`;
  }

  const namePart = normalizeForKey(participant.name || participant.subjectId || 'unknown');
  const agePart = Number.isFinite(participant.age) ? String(participant.age) : 'na';
  return `participant-${namePart}-${agePart}`;
}
