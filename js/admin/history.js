// admin/history.js — Session History page (history/index.html). Build-spec §16 /
// rebuild plan §8.2. Password-gated (same password as /settings). Merges
// experimentSessions (always Complete) with not-yet-completed experimentSessionDrafts
// (Incomplete) into one table, newest first.

import { initFirebase, validatePassword, getAllSessions, getAllDrafts, getSession } from '../firebase.js';

let appEl = null;
let allRows = [];

// ─── Helpers ────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDateTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

async function loadAllRows() {
  const [sessions, drafts] = await Promise.all([getAllSessions(), getAllDrafts()]);
  const incompleteDrafts = drafts.filter((d) => !d.completed);

  const merged = [
    ...sessions.map((s) => ({ ...s, status: 'Complete' })),
    ...incompleteDrafts.map((d) => ({ ...d, status: 'Incomplete' })),
  ];
  merged.sort((a, b) => (b.sessionStartTime || 0) - (a.sessionStartTime || 0));
  return merged;
}

// ─── CSV export ─────────────────────────────────────────────────────────

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function convertToCSV(rows) {
  const headers = ['Subject ID', 'Name', 'Group', 'Date & Time', 'EEG', 'Status'];
  const lines = [headers.join(',')];

  rows.forEach((row) => {
    const cells = [
      row.participant?.subjectId || '',
      row.participant?.name || '',
      row.assignedGroup ? `Group ${row.assignedGroup}` : '',
      formatDateTime(row.sessionStartTime),
      row.eegMode ? 'Yes' : 'No',
      row.status,
    ].map(csvEscape);
    lines.push(cells.join(','));
  });

  return lines.join('\n');
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleExportCSV() {
  downloadCSV(convertToCSV(allRows), `ecf-sessions-${Date.now()}.csv`);
}

// ─── View JSON modal ────────────────────────────────────────────────────

function showJsonModal(data) {
  const overlay = document.createElement('div');
  overlay.className = 'history-modal-overlay';
  overlay.innerHTML = `
    <div class="history-modal-card">
      <div class="history-modal-head">
        <strong>Session JSON</strong>
        <button type="button" class="btn btn-ghost" id="modal-close" style="border:1px solid var(--border);">Close</button>
      </div>
      <div class="history-modal-body"><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
}

async function handleViewJson(row) {
  // Complete rows: re-fetch the canonical document (build-spec §16). Incomplete
  // (draft) rows have no single-document fetch in firebase.js — only bulk reads —
  // and drafts change frequently anyway, so the already-loaded copy is shown as-is.
  if (row.status === 'Complete' && row.sessionId) {
    const fresh = await getSession(row.sessionId);
    showJsonModal(fresh || row);
  } else {
    showJsonModal(row);
  }
}

// ─── Table ──────────────────────────────────────────────────────────────

function renderRows(tbody) {
  if (allRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No sessions yet.</td></tr>';
    return;
  }

  tbody.innerHTML = allRows.map((row, i) => `
    <tr>
      <td><strong>${escapeHtml(row.participant?.subjectId || '—')}</strong></td>
      <td>${escapeHtml(row.participant?.name || '—')}</td>
      <td>${row.assignedGroup ? `Group ${row.assignedGroup}` : '—'}</td>
      <td>${formatDateTime(row.sessionStartTime)}</td>
      <td style="${row.eegMode ? 'color:var(--accent);font-weight:500;' : 'color:var(--muted);'}">${row.eegMode ? 'Yes' : 'No'}</td>
      <td><span style="${row.status === 'Complete' ? 'background:#EDF7F1;color:var(--success);' : 'background:#FDF3DC;color:#8A6010;'}font-size:11px;font-weight:600;padding:3px 8px;border-radius:3px;">${row.status}</span></td>
      <td><button type="button" class="btn btn-ghost" data-row-index="${i}" style="font-size:12px;padding:4px 10px;border:1px solid var(--border);">View JSON</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-row-index]').forEach((btn) => {
    btn.addEventListener('click', () => handleViewJson(allRows[Number(btn.dataset.rowIndex)]));
  });
}

function renderTable() {
  appEl.innerHTML = `
    <div class="admin-shell">
      <div class="admin-sidebar">
        <div class="admin-sidebar-title">History</div>
        <div class="admin-nav-item active" id="nav-all-sessions">All Sessions</div>
        <div class="admin-nav-item" id="nav-export-data">Export Data</div>
      </div>
      <div class="admin-main">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div class="settings-section-title" style="margin-bottom:0;border:none;padding:0;">Session Logs</div>
          <button type="button" id="btn-export-csv" class="btn btn-ghost" style="border:1px solid var(--border);font-size:12px;padding:7px 14px;">↓ Export all as CSV</button>
        </div>
        <table class="settings-table" style="margin-bottom:0;">
          <thead><tr><th>Subject ID</th><th>Name</th><th>Group</th><th>Date &amp; Time</th><th>EEG</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="history-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  renderRows(appEl.querySelector('#history-tbody'));
  appEl.querySelector('#btn-export-csv').addEventListener('click', handleExportCSV);
  appEl.querySelector('#nav-export-data').addEventListener('click', handleExportCSV);
  appEl.querySelector('#nav-all-sessions').addEventListener('click', async () => {
    allRows = await loadAllRows();
    renderTable();
  });
}

// ─── Password gate ──────────────────────────────────────────────────────

function renderPasswordGate() {
  appEl.innerHTML = `
    <div class="password-gate-overlay">
      <div class="password-gate-card">
        <span class="eyebrow">History Access</span>
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
    const valid = await validatePassword(input.value);
    if (valid) {
      allRows = await loadAllRows();
      renderTable();
    } else {
      errorEl.textContent = 'Incorrect password. Please try again.';
    }
  };

  appEl.querySelector('#gate-submit').addEventListener('click', submit);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
}

// ─── Bootstrap ──────────────────────────────────────────────────────────

async function initHistoryApp() {
  appEl = document.getElementById('app');
  initFirebase();
  renderPasswordGate();
}

initHistoryApp();
