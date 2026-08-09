// keyboard.js — global keyboard event management. Registered once on app init.
// Each screen registers its handlers on mount and unregisters on unmount, so no
// stale handlers fire on the wrong screen.

const _handlers = new Map();

export function registerHandler(key, handler) {
  _handlers.set(key, handler);
}

export function unregisterHandler(key) {
  _handlers.delete(key);
}

export function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter
    if (e.ctrlKey && e.key === 'Enter') {
      _handlers.get('ctrl+enter')?.();
      return;
    }
    // Spacebar — only when focus is not on an input/textarea
    if (e.key === ' ' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      _handlers.get('space')?.();
      return;
    }
    // Arrow keys
    if (e.key === 'ArrowUp') { _handlers.get('arrow-up')?.(); return; }
    if (e.key === 'ArrowDown') { _handlers.get('arrow-down')?.(); return; }
  });
}
