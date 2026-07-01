// ─── State ──────────────────────────────────────────────────────────────────
let currentProjectId = null;
let quillInstance    = null;
let saveTimer        = null;
let originalContent  = "";
let docVersion       = 0;
let canEditDoc       = false;
let socket           = null;
let currentUser      = null;
let userColor        = null;

const remoteCursors  = new Map(); // socketId → DOM element

// ─── Quill font / size registration ─────────────────────────────────────────
const Font = Quill.import('formats/font');
Font.whitelist = ['times', 'arial', 'georgia', 'courier', 'garamond'];
Quill.register(Font, true);

const Size = Quill.import('attributors/style/size');
// Numeric pt values — stored as inline font-size CSS, not class names.
// Include false so the picker has a 'no size' (inherit) option.
Size.whitelist = ['8pt','9pt','10pt','11pt','12pt','14pt','16pt','18pt','24pt','36pt'];
Quill.register(Size, true);

const ColorClass = Quill.import('attributors/class/color');
const ColorStyle = Quill.import('attributors/style/color');
Quill.register(ColorClass, true);
Quill.register(ColorStyle, true);

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  [{ font: Font.whitelist }],
  [{ size: ['8pt','9pt','10pt','11pt','12pt','14pt','16pt','18pt','24pt','36pt'] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ align: [] }],
  ['clean'],
];

// ─── Status badge ────────────────────────────────────────────────────────────
function updateStatus(text, type = 'info') {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `badge badge-${type}`;
}

// ─── Page-break overlay ──────────────────────────────────────────────────────
// A4 is 210 × 297 mm with 20 mm padding on all sides.
// The editorShell's pixel width tells us the current px/mm ratio,
// so we can place lines at exact page boundaries without hardcoding dpi.
function updatePageLines() {
  const shell   = document.getElementById('editorShell');
  const overlay = document.getElementById('pageLineOverlay');
  if (!shell || !overlay || !quillInstance) return;

  const pxPerMm       = shell.clientWidth / 210;          // e.g. ~3.78 at 96 dpi
  const pageHeightPx  = pxPerMm * 297;                    // full A4 height
  const contentHeight = quillInstance.root.scrollHeight;  // how tall the document is

  const linesNeeded = Math.floor(contentHeight / pageHeightPx);

  overlay.innerHTML = '';
  for (let i = 1; i <= linesNeeded; i++) {
    const line  = document.createElement('div');
    line.className = 'pg-break-line';
    line.style.top = `${i * pageHeightPx}px`;

    const label = document.createElement('span');
    label.className = 'pg-break-label';
    label.textContent = `Page ${i + 1}`;
    line.appendChild(label);

    overlay.appendChild(line);
  }
}

// ─── Remote cursors ──────────────────────────────────────────────────────────
function renderRemoteCursor(socketId, remoteUser, range) {
  if (!quillInstance || !range) return;

  const safeIndex = Math.min(range.index || 0, Math.max(0, quillInstance.getLength() - 1));
  const bounds    = quillInstance.getBounds(safeIndex);
  if (!bounds) return;

  let el = remoteCursors.get(socketId);
  if (!el) {
    el = document.createElement('div');
    el.className = 'remote-cursor';
    el.innerHTML = '<span class="remote-cursor-label"></span>';
    remoteCursors.set(socketId, el);
    quillInstance.root.appendChild(el);
  }

  el.style.background  = remoteUser.color;
  el.style.left        = `${bounds.left}px`;
  el.style.top         = `${bounds.top}px`;
  el.style.height      = `${Math.max(20, bounds.height || 22)}px`;
  el.querySelector('.remote-cursor-label').textContent  = remoteUser.name;
  el.querySelector('.remote-cursor-label').style.background = remoteUser.color;
}

function clearRemoteCursor(socketId) {
  const el = remoteCursors.get(socketId);
  if (el) { el.remove(); remoteCursors.delete(socketId); }
}

// ─── Authorship helpers ──────────────────────────────────────────────────────
function getUserColor(user) {
  if (user?.color) return user.color;
  console.warn('No color on session user; falling back.');
  return '#3b82f6';
}

// Stamp the current user's color onto every insert op before broadcasting.
// We do this AFTER Quill has already applied the delta (text-change fires post-insert),
// so we use formatText to retroactively color the just-inserted range.
function stampAuthorColor(delta) {
  let cursor = 0;
  delta.ops.forEach((op) => {
    if (typeof op.retain === 'number') {
      cursor += op.retain;
    } else if (typeof op.insert === 'string') {
      quillInstance.formatText(cursor, op.insert.length, 'color', userColor, 'silent');
      cursor += op.insert.length;
    } else if (op.insert && typeof op.insert === 'object') {
      cursor += 1; // embed (image etc.) — no color needed
    }
  });
}

function applyColorToDelta(delta, color) {
  return {
    ...delta,
    ops: delta.ops.map((op) => {
      if (op.insert === undefined) return op; // retain / delete — leave alone
      return { ...op, attributes: { ...(op.attributes || {}), color } };
    }),
  };
}

// ─── Save ────────────────────────────────────────────────────────────────────
function startAutosaveLoop() {
  if (saveTimer) clearInterval(saveTimer);
  saveTimer = setInterval(() => {
    if (!quillInstance || !currentProjectId || !canEditDoc) return;
    const html = quillInstance.root.innerHTML;
    if (html !== originalContent) persistDocument(html, 'Autosaving…', 'Saved');
  }, 5000);
}

async function persistDocument(html, inFlightMsg, successMsg) {
  try {
    updateStatus(inFlightMsg, 'info');
    const result = await API.put(`/api/editor/${currentProjectId}/document`, {
      content:     html,
      baseVersion: docVersion,
    });

    if (result?.error === 'version_conflict') {
      // Another editor saved more recently — resync to their version
      docVersion      = result.currentVersion;
      originalContent = result.currentContent;
      quillInstance.setContents(
        quillInstance.clipboard.convert({ html: result.currentContent }),
        'api'
      );
      updateStatus('Resynced with latest changes', 'warning');
      setTimeout(() => updateStatus('Idle', 'info'), 2500);
      return;
    }

    if (typeof result?.version === 'number') docVersion = result.version;
    originalContent = html;
    updateStatus(successMsg, 'success');
    setTimeout(() => updateStatus('Idle', 'info'), 2000);
  } catch (err) {
    updateStatus('Save failed — retrying…', 'danger');
    console.error('Save error:', err);
  }
}

// ─── Project picker ──────────────────────────────────────────────────────────
async function initProjectPicker() {
  const select       = document.getElementById('projectSelect');
  const openBtn      = document.getElementById('openProjectBtn');
  const pickerSection = document.getElementById('projectPicker');

  try {
    updateStatus('Loading projects…', 'info');
    const data     = await API.get('/api/projects');
    const projects = data.projects || [];

    if (!projects.length) {
      select.innerHTML = '<option value="">No projects available</option>';
      openBtn.disabled = true;
      updateStatus('No projects found', 'warning');
      return;
    }

    select.innerHTML = projects
      .map((p) => `<option value="${p.id}">${p.title} (ID: ${p.id})</option>`)
      .join('');

    updateStatus('Idle', 'info');

    openBtn.addEventListener('click', async () => {
      const id = select.value;
      if (!id) return;
      localStorage.setItem('last_opened_project_id', id);
      pickerSection.style.display = 'none';
      await loadProjectDocument(Number(id));
    });
  } catch (err) {
    updateStatus('Failed to load projects', 'danger');
    console.error(err);
  }
}

// ─── Load document ───────────────────────────────────────────────────────────
async function loadProjectDocument(projectId) {
  currentProjectId = projectId;
  const workspace  = document.getElementById('editorWorkspace');

  try {
    updateStatus('Opening…', 'info');

    // Fetch metadata (title, canEdit). Content comes from document_init
    // over the socket — not from here — to avoid the double-render bug.
    const response = await API.get(`/api/editor/${projectId}/document`);
    const doc      = response.document;
    canEditDoc     = response.canEdit;

    quillInstance = new Quill('#singleEditor', {
      theme:    'snow',
      modules:  { toolbar: TOOLBAR_OPTIONS },
      readOnly: !canEditDoc,
    });

    // Quill injects .ql-toolbar as a sibling before #singleEditor (inside
    // #editorShell). Move it out to the sticky #toolbarContainer above the
    // paper canvas so it stays pinned at the top when the user scrolls.
    const generatedToolbar = document.querySelector('#editorShell .ql-toolbar');
    const toolbarContainer = document.getElementById('toolbarContainer');
    if (generatedToolbar && toolbarContainer) {
      toolbarContainer.appendChild(generatedToolbar);
    }

    // --- REMOVE the duplicate readOnly + closing brace that sed leaves ---
    // (cleaned below)
    //   readOnly: !canEditDoc,
    // });

    const titleEl = document.getElementById('projectNameDisplay');
    if (titleEl) titleEl.textContent = doc.title ? ` — ${doc.title}` : '';

    workspace.style.display = 'flex';
    updateStatus('Syncing…', 'info');

    // Watch for content height changes → redraw page lines
    const ro = new ResizeObserver(() => updatePageLines());
    ro.observe(quillInstance.root);

    // Socket join — document_init fires once joined and seeds content
    setupRealTimeSync(projectId);

  } catch (err) {
    updateStatus('Failed to open document', 'danger');
    console.error(err);
  }
}

// ─── Real-time sync ──────────────────────────────────────────────────────────
function setupRealTimeSync(projectId) {
  if (!socket) socket = io();

  socket.emit('join_document', { projectId });
  socket.emit('join_project',  { projectId, user: currentUser });

  // ── Seed content from server's authoritative in-memory state ──
  // This is the ONE place editor content is initialized.
  // The REST GET above intentionally does NOT seed Quill — doing both
  // was the root cause of the content-doubling bug.
  socket.on('document_init', ({ content, version }) => {
    if (typeof version === 'number') docVersion = version;
    originalContent = content || '<p></p>';

    quillInstance.setContents(
      quillInstance.clipboard.convert({ html: originalContent }),
      'api'
    );

    updateStatus(canEditDoc ? 'Ready to edit' : 'View only', 'success');
    updatePageLines();

    if (canEditDoc) startAutosaveLoop();
  });

  // ── Remote delta from another collaborator ──
  socket.on('page_delta', ({ userId, delta, version }) => {
    if (userId === currentUser.id || !quillInstance) return;
    if (typeof version === 'number') docVersion = version;
    quillInstance.updateContents(delta, 'api');
    updatePageLines();
  });

  // ── Server ack — advance our local version ──
  socket.on('page_delta_ack', ({ version }) => {
    if (typeof version === 'number') docVersion = version;
  });

  // ── Server rejected our delta (stale version) — resync ──
  socket.on('delta_rejected', ({ currentVersion, currentContent }) => {
    if (typeof currentVersion === 'number') docVersion = currentVersion;
    if (currentContent) {
      originalContent = currentContent;
      quillInstance.setContents(
        quillInstance.clipboard.convert({ html: currentContent }),
        'api'
      );
      updatePageLines();
    }
    updateStatus('Resynced', 'warning');
    setTimeout(() => updateStatus('Idle', 'info'), 2000);
  });

  // ── Remote cursors ──
  socket.on('cursor_position', ({ socketId, user: remoteUser, range }) => {
    if (remoteUser?.id === currentUser.id) return;
    renderRemoteCursor(socketId, remoteUser, range);
  });

  socket.on('cursor_clear', ({ socketId }) => clearRemoteCursor(socketId));

  if (!canEditDoc) return;

  // ── Local changes ──
  quillInstance.on('text-change', (delta, _old, source) => {
    if (source !== 'user') return;

    // 1. Stamp author color onto the just-inserted range (retroactive)
    stampAuthorColor(delta);

    // 2. Build a colored copy to broadcast (so remote clients see the color)
    const coloredDelta = applyColorToDelta(delta, userColor);

    // 3. Emit to server with our current base version for conflict detection
    socket.emit('page_delta', {
      projectId,
      userId:      currentUser.id,
      pageNumber:  1,
      delta:       coloredDelta,
      baseVersion: docVersion,
      fullContent: quillInstance.root.innerHTML,
    });

    // 4. Update page lines whenever content changes
    updatePageLines();

    // 5. Emit cursor so collaborators see where we are
    const sel = quillInstance.getSelection();
    if (sel) socket.emit('cursor_position', { projectId, range: sel, user: currentUser });

    // 6. Analytics
    let insertedChars = 0, insertedWords = 0, deletedChars = 0;
    delta.ops.forEach((op) => {
      if (typeof op.delete === 'number') deletedChars += op.delete;
      if (typeof op.insert === 'string') {
        insertedChars += op.insert.length;
        insertedWords += (op.insert.match(/\b[-?a-zA-Z0-9]+\b/g) || []).length;
      }
    });

    const actions = [];
    if (insertedChars) actions.push('write');
    if (!actions.length)     return;

    API.post(`/api/analytics/${projectId}/activity`, {
      actions,
      wordsAdded:   insertedWords,
      charsAdded:   insertedChars,
      time:         1,
    }).catch(() => {});
  });

  // Emit cursor on selection change (not just text change)
  quillInstance.on('selection-change', (range) => {
    if (!range) { socket.emit('cursor_clear', { projectId }); return; }
    socket.emit('cursor_position', { projectId, range, user: currentUser });
  });
}

// ─── PDF export helpers ──────────────────────────────────────────────────────
function inlineQuillStyles(element) {
  const fontMap = {
    'ql-font-times':    "'Times New Roman', Times, serif",
    'ql-font-arial':    'Arial, Helvetica, sans-serif',
    'ql-font-georgia':  'Georgia, serif',
    'ql-font-courier':  "'Courier New', Courier, monospace",
    'ql-font-garamond': 'Garamond, serif',
  };
  const sizeMap  = { 'ql-size-small': '0.75em', 'ql-size-large': '1.5em', 'ql-size-huge': '2.5em' };
  const alignMap = { 'ql-align-center': 'center', 'ql-align-right': 'right', 'ql-align-justify': 'justify' };

  Object.entries(fontMap).forEach(([cls, font])  => element.querySelectorAll(`.${cls}`).forEach(el => el.style.fontFamily = font));
  Object.entries(sizeMap).forEach(([cls, size])  => element.querySelectorAll(`.${cls}`).forEach(el => el.style.fontSize  = size));
  Object.entries(alignMap).forEach(([cls, align]) => element.querySelectorAll(`.${cls}`).forEach(el => el.style.textAlign = align));
  element.querySelectorAll('img').forEach(img => { if (!img.style.maxWidth) img.style.maxWidth = '100%'; });
  return element;
}

// ─── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  const user = await getCurrentUser();
  if (!user) { window.location.href = '/login'; return; }
  currentUser = user;
  userColor   = getUserColor(user);

  const urlParams    = new URLSearchParams(window.location.search);
  const urlProjectId = urlParams.get('projectId');
  const savedId      = localStorage.getItem('last_opened_project_id');

  if (urlProjectId) {
    localStorage.setItem('last_opened_project_id', urlProjectId);
    document.getElementById('projectPicker').style.display = 'none';
    await loadProjectDocument(Number(urlProjectId));
  } else if (savedId) {
    document.getElementById('projectPicker').style.display = 'none';
    await loadProjectDocument(Number(savedId));
  } else {
    await initProjectPicker();
  }

  document.getElementById('actionsContainer').style.display = 'flex';

  // ── Manual save ──
  const manualSaveBtn = document.getElementById('manualSaveBtn');
  if (manualSaveBtn) {
    manualSaveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!quillInstance || !currentProjectId || !canEditDoc) return;
      await persistDocument(quillInstance.root.innerHTML, 'Saving…', 'Saved');
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      manualSaveBtn?.click();
    }
  });

  // ── PDF export ──
  document.getElementById('downloadPdfBtn').addEventListener('click', (e) => {
    e.preventDefault();
    if (!quillInstance) return;

    const clone = document.createElement('div');
    clone.innerHTML = quillInstance.root.innerHTML;
    inlineQuillStyles(clone);

    html2pdf().set({
      margin:     1,
      filename:   `project_${currentProjectId}.pdf`,
      image:      { type: 'jpeg', quality: 0.98 },
      html2canvas:{ scale: 2 },
      jsPDF:      { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak:  { mode: ['avoid-all', 'css', 'legacy'] },
    }).from(clone).save();
  });

  // ── Analytics ──
  document.getElementById('viewAnalyticsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `/analytics?projectId=${currentProjectId}`;
  });

  // ── Redraw page lines on window resize (zoom change, viewport change) ──
  window.addEventListener('resize', updatePageLines);
})();