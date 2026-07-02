// Formatter page logic
let currentProjectId = null;
let formattedDocId = null;
let socket = null;

async function init() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  currentProjectId = urlParams.get('projectId');

  if (!currentProjectId) {
    alert('No project specified');
    window.location.href = '/dashboard';
    return;
  }

  // Load project title
  try {
    const response = await API.get(`/api/editor/${currentProjectId}/document`);
    document.getElementById('projectTitle').textContent = 
      `Formatting: ${response.document.title || 'Untitled'}`;
  } catch (err) {
    console.error('Failed to load project', err);
  }

  // Setup socket for live updates
  socket = io();
  
  // Join user room for receiving updates
  socket.emit('join_user_room', { userId: user.id });
  
  socket.on('format_progress', handleFormatProgress);
  socket.on('format_complete', handleFormatComplete);
  socket.on('format_error', handleFormatError);

  // Button handlers
  document.getElementById('startFormatBtn').addEventListener('click', startFormatting);
  document.getElementById('downloadBtn').addEventListener('click', downloadDocument);
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = `/editor?projectId=${currentProjectId}`;
  });
  document.getElementById('resetDefaultsBtn').addEventListener('click', resetToDefaults);
}

function resetToDefaults() {
  // Font settings
  document.getElementById('fontName').value = 'Times New Roman';
  document.getElementById('bodyFontSize').value = '12';
  document.getElementById('headingFontName').value = '';
  
  // Heading sizes
  document.getElementById('heading1Size').value = '16';
  document.getElementById('heading2Size').value = '14';
  document.getElementById('heading3Size').value = '13';
  
  // Heading colors
  document.getElementById('heading1Color').value = '';
  document.getElementById('heading2Color').value = '';
  
  // Spacing
  document.getElementById('lineSpacing').value = '1.5';
  document.getElementById('paragraphSpacing').value = '6';
  
  // Alignment
  document.getElementById('bodyAlignment').value = 'justify';
  
  // Document features
  document.getElementById('optTOC').checked = true;
  document.getElementById('optLOF').checked = true;
  document.getElementById('optLOT').checked = true;
  document.getElementById('optNLP').checked = true;
  
  addStatusLog('Settings reset to defaults', 'complete');
}

function addStatusLog(message, type = 'info') {
  const log = document.getElementById('statusLog');
  const item = document.createElement('div');
  item.className = `status-item ${type}`;
  item.innerHTML = `
    <small class="text-muted">${new Date().toLocaleTimeString()}</small><br>
    ${message}
  `;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

function updateProgress(percent) {
  document.getElementById('progressBar').style.width = `${percent}%`;
}

async function startFormatting() {
  const startBtn = document.getElementById('startFormatBtn');
  startBtn.disabled = true;
  startBtn.textContent = 'Formatting...';

  addStatusLog('Starting formatting process...', 'active');
  updateProgress(10);

  try {
    // Collect styling options
    const options = {
      // Document features
      include_toc: document.getElementById('optTOC').checked,
      include_lof: document.getElementById('optLOF').checked,
      include_lot: document.getElementById('optLOT').checked,
      enable_nlp_backup: document.getElementById('optNLP').checked,
      
      // Font settings
      font_name: document.getElementById('fontName').value,
      body_font_size_pt: parseInt(document.getElementById('bodyFontSize').value),
      heading_font_name: document.getElementById('headingFontName').value || null,
      
      // Heading sizes
      heading_1_size_pt: parseInt(document.getElementById('heading1Size').value),
      heading_2_size_pt: parseInt(document.getElementById('heading2Size').value),
      heading_3_size_pt: parseInt(document.getElementById('heading3Size').value),
      
      // Heading colors
      heading_1_color: document.getElementById('heading1Color').value || null,
      heading_2_color: document.getElementById('heading2Color').value || null,
      
      // Spacing
      line_spacing: parseFloat(document.getElementById('lineSpacing').value),
      paragraph_space_after_pt: parseInt(document.getElementById('paragraphSpacing').value),
      
      // Alignment
      body_alignment: document.getElementById('bodyAlignment').value,
    };

    addStatusLog('Sending document to formatter...', 'active');
    updateProgress(20);

    const response = await API.post(`/api/formatter/${currentProjectId}/format-live`, {
      options: options,
    });

    if (response.success) {
      addStatusLog('Formatting initiated', 'complete');
      // Live updates will come via socket
    } else {
      throw new Error(response.error || 'Formatting failed');
    }
  } catch (error) {
    console.error('Formatting error:', error);
    addStatusLog(`Error: ${error.message}`, 'error');
    startBtn.disabled = false;
    startBtn.textContent = '✨ Retry Formatting';
    updateProgress(0);
  }
}

function handleFormatProgress(data) {
  const { stage, message, progress, preview } = data;
  
  addStatusLog(message, 'active');
  updateProgress(progress || 50);

  if (preview) {
    // Update preview with formatted HTML
    document.getElementById('previewContent').innerHTML = preview;
  }
}

function handleFormatComplete(data) {
  const { documentId, preview, message } = data;
  
  addStatusLog(message || 'Formatting complete!', 'complete');
  updateProgress(100);

  formattedDocId = documentId;

  // Show final preview
  if (preview) {
    document.getElementById('previewContent').innerHTML = preview;
  }

  // Show download button
  document.getElementById('startFormatBtn').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'inline-block';
}

function handleFormatError(data) {
  const { error, details } = data;
  addStatusLog(`Error: ${error}`, 'error');
  if (details) {
    addStatusLog(details, 'error');
  }
  
  const startBtn = document.getElementById('startFormatBtn');
  startBtn.disabled = false;
  startBtn.textContent = '✨ Retry Formatting';
  updateProgress(0);
}

async function downloadDocument() {
  if (!formattedDocId) {
    alert('No formatted document available');
    return;
  }

  try {
    addStatusLog('Preparing download...', 'active');
    
    window.location.href = `/api/formatter/${currentProjectId}/download/${formattedDocId}`;
    
    addStatusLog('Download started', 'complete');
  } catch (error) {
    console.error('Download error:', error);
    addStatusLog(`Download failed: ${error.message}`, 'error');
  }
}

init();
