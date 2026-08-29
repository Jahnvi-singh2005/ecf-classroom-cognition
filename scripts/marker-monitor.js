// marker-monitor.js — dummy WebSocket server for testing EEG markers without any
// hardware or BrainFlow. Listens on ws://localhost:8765 (the same endpoint
// js/markers.js sends to) and prints every marker it receives.
//
// Usage:
//   npm run marker:monitor

import { WebSocketServer } from 'ws';
import { MARKERS } from '../js/markers.js';

const PORT = 8765;

const MARKER_NAMES_BY_ID = Object.fromEntries(
  Object.entries(MARKERS).map(([name, id]) => [id, name]),
);

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function handleMessage(data) {
  let payload;
  try {
    payload = JSON.parse(data.toString());
  } catch {
    console.log(`[RAW] ${data}`);
    return;
  }

  const { marker, timestamp } = payload;
  const name = MARKER_NAMES_BY_ID[marker] ?? `UNKNOWN_${marker}`;
  const idLabel = String(marker).padStart(3, ' ');
  console.log(`[${formatTimestamp(timestamp)}] ${idLabel} — ${name}`);
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  console.log('[CONNECTED]');
  ws.on('message', handleMessage);
  ws.on('close', () => console.log('[DISCONNECTED]'));
});

console.log(`Marker monitor running on ws://localhost:${PORT}`);
