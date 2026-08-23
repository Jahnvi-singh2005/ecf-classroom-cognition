// markdown.js — minimal renderer, only what appears in experiment content (bold,
// italic, headings, paragraphs). No external library. Content comes from Firestore
// written by the experimenter, not from participants, so there is no XSS risk here.

function applyInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

export function renderMarkdown(text) {
  return (text || '')
    .split(/\n\n+/)
    .map((block) => {
      const heading = /^(#{1,6})\s+(.*)$/.exec(block.trim());
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${applyInline(heading[2])}</h${level}>`;
      }
      return `<p>${applyInline(block)}</p>`;
    })
    .join('');
}
