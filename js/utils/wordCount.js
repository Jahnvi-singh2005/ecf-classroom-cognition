// wordCount.js — word count enforcement for Constructive and PRA written responses.

export function countWords(text) {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function isWithinRange(count, min, max) {
  return count >= min && count <= max;
}
