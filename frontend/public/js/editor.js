let currentProjectId = null;
let quillInstance = null;
let saveTimer = null;
let originalContent = "";

// configure toolbar
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, false] }],
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["clean"],
];

// display status message in the editor UI
function updateStatus(text, type = "info") {
  const badge = document.getElementById("saveStatus");
  if (!badge) return;
  badge.textContent = text;
  badge.className = `badge badge-${type}`;
}

// fetch document content from the backend and initialize Quill editor
async function initProjectPicker() {
  const select = document.getElementById("projectSelect");
  const openBtn = document.getElementById("openProjectBtn");
  const pickerSection = document.getElementById("projectPicker");

  try {
    updateStatus("Loading projects...", "info");
// call main project API
    const data = await API.get("/api/projects");
    const projects = data.projects || [];

    if (!projects.length) {
      select.innerHTML = '<option value="">No projects available</option>';
      openBtn.disabled = true;
      updateStatus("No projects found", "warning");
      return;
    }

    select.innerHTML = projects
      .map((p) => `<option value="${p.id}">${p.title} (ID: ${p.id})</option>`)
      .join("");

    updateStatus("Idle", "info");

// open button to select project
    openBtn.addEventListener("click", async () => {
      const selectedId = select.value;
      if (selectedId) {
        pickerSection.style.display = "none";
        await loadProjectDocument(Number(selectedId));
      }
    });
  } catch (err) {
    updateStatus("Failed to load projects list", "danger");
    console.error(err);
  }
}

// load project and initialize Quill editor with its document content
async function loadProjectDocument(projectId) {
  currentProjectId = projectId;
  const workspace = document.getElementById("editorWorkspace");

  try {
    updateStatus("Fetching document...", "info");
    const response = await API.get(`/api/editor/${projectId}/document`);
    const doc = response.document;
    const canEdit = response.canEdit;

    originalContent = doc.content || "<p></p>";

// quill editor instance
    quillInstance = new Quill("#singleEditor", {
      theme: "snow",
      modules: {
        toolbar: TOOLBAR_OPTIONS,
      },
      readOnly: !canEdit,
    });

// load the document content into the editor
    quillInstance.root.innerHTML = originalContent;

// display the editor workspace and update status
    workspace.style.display = "block";
    updateStatus(canEdit ? "Ready to edit" : "Viewing Mode", "success");

    if (canEdit) {
//  start autosaving in 5 second
        startAutosaveLoop();
    }
  } catch (err) {
    updateStatus("Failed to open document", "danger");
    console.error(err);
  }
}

// periodic background autosave loop to check changes every 5 seconds
function startAutosaveLoop() {
  if (saveTimer) clearInterval(saveTimer);

  saveTimer = setInterval(async () => {
    if (!quillInstance || !currentProjectId) return;

    const currentHtml = quillInstance.root.innerHTML;

// make API request only if content has changed since last save
    if (currentHtml !== originalContent) {
      try {
        updateStatus("Autosaving...", "info");
        await API.put(`/api/editor/${currentProjectId}/document`, {
          content: currentHtml,
        });
        originalContent = currentHtml; // update baseline
        updateStatus("Changes Saved", "success");
        setTimeout(() => updateStatus("Idle", "info"), 2000);
      } catch (err) {
        updateStatus("Save failed! Retrying...", "danger");
        console.error("Save Error:", err);
      }
    }
  }, 5000); // 5 second check
}

// Check auth status and start initialization on entry
(async function init() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "/login";
    return;
  }
  await initProjectPicker();
})();
