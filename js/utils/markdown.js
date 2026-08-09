// markdown.js — minimal renderer, only what appears in experiment content (bold, italic).
// No external library. Content comes from Firestore written by the experimenter, not
// from participants, so there is no XSS risk here.

export function renderMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
