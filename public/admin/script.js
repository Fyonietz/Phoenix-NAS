// Global state
const state = {
    selectedFolder: null,
    fileToUpload: null,
    currentView: 'dashboard',
    uploading: false
};

// DOM Elements
const elements = {
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menuToggle'),
    hamburgerIcon: document.getElementById('hamburgerIcon'),
    closeIcon: document.getElementById('closeIcon'),
    folderPicker: document.getElementById('folder-picker'),
    folderPickerBtn: document.getElementById('folderPickerBtn'),
    selectedFolderDisplay: document.getElementById('selectedFolderDisplay'),
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    uploadBtn: document.getElementById('uploadBtn'),
    previewContainer: document.getElementById('previewContainer'),
    loadingOverlay: document.getElementById('loading-overlay'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    newFolderPath: document.getElementById('newFolderPath'),
    createFolderBtn: document.getElementById('createFolderBtn'),
    folderTree: document.getElementById('folderTree')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeSidebar();
    initializeFileUpload();
    initializeFolderPicker();
    initializeDirectoryManager();
    loadFolderTree();
});

// Sidebar Functionality
function initializeSidebar() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            changeView(view);
        });
    });

    elements.menuToggle.addEventListener('click', toggleSidebar);

    // Handle responsive sidebar
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            elements.sidebar.style.transform = 'translateX(0)';
        } else {
            elements.sidebar.style.transform = 'translateX(-100%)';
        }
    });
}

function toggleSidebar() {
    const isHidden = elements.sidebar.style.transform === 'translateX(-100%)';
    elements.sidebar.style.transform = isHidden ? 'translateX(0)' : 'translateX(-100%)';
    elements.hamburgerIcon.classList.toggle('hidden');
    elements.closeIcon.classList.toggle('hidden');
}

function changeView(view) {
    state.currentView = view;
    document.querySelectorAll('.view-content').forEach(el => {
        el.classList.add('hidden');
    });
    document.getElementById(`${view}-view`).classList.remove('hidden');

    if (window.innerWidth < 768) {
        toggleSidebar();
    }
}

// File Upload Functionality
function initializeFileUpload() {
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    elements.uploadBtn.addEventListener('click', uploadFile);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        setFileToUpload(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone.classList.add('border-blue-500', 'bg-blue-50');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('border-blue-500', 'bg-blue-50');
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        setFileToUpload(files[0]);
    }
}

function setFileToUpload(file) {
    state.fileToUpload = file;
    updateUploadButton();
    updatePreview(file);
}

function updateUploadButton() {
    elements.uploadBtn.disabled = !state.fileToUpload || !state.selectedFolder || state.uploading;
}

function updatePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewContent = createPreviewElement(file, e.target.result);
        elements.previewContainer.innerHTML = '';
        elements.previewContainer.appendChild(previewContent);
    };
    reader.readAsDataURL(file);
}

function createPreviewElement(file, dataUrl) {
    if (isImage(file.name)) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'max-w-full max-h-[400px] border rounded shadow';
        return img;
    } else if (isVideo(file.name)) {
        const video = document.createElement('video');
        video.src = dataUrl;
        video.controls = true;
        video.className = 'max-w-full max-h-[400px] border rounded shadow';
        return video;
    } else if (isGLB(file.name)) {
        const modelViewer = document.createElement('model-viewer');
        modelViewer.src = dataUrl;
        modelViewer.setAttribute('auto-rotate', '');
        modelViewer.setAttribute('camera-controls', '');
        modelViewer.style.backgroundColor = '#fff';
        modelViewer.className = 'w-full h-[400px] border rounded shadow';
        return modelViewer;
    }
    const p = document.createElement('p');
    p.textContent = 'No preview available';
    return p;
}

// Progress Functions
function showUploadProgress() {
    elements.loadingOverlay.classList.remove('hidden');
    elements.loadingOverlay.style.display = 'flex';
    updateProgress(0);
}

function hideUploadProgress() {
    elements.loadingOverlay.classList.add('hidden');
    elements.loadingOverlay.style.display = 'none';
    resetProgress();
}

function updateProgress(percent) {
    if (elements.progressBar) {
        elements.progressBar.style.width = `${percent}%`;
    }
    if (elements.progressText) {
        elements.progressText.textContent = `${Math.round(percent)}%`;
    }
}

function resetProgress() {
    updateProgress(0);
}

// Folder Picker Functionality
function initializeFolderPicker() {
    elements.folderPickerBtn.addEventListener('click', () => {
        elements.folderPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!elements.folderPicker.contains(e.target) && 
            !elements.folderPickerBtn.contains(e.target)) {
            elements.folderPicker.classList.add('hidden');
        }
    });
}

async function loadFolderTree() {
    try {
        const response = await fetch('/api/folder/lists');
        const data = await response.json();
        const root = Array.isArray(data) ? 
            data.find(item => item.type === 'directory') : 
            { contents: [] };
            
        renderFolderPicker(root);
        renderDirectoryTree(root);
    } catch (error) {
        console.error('Failed to load folder structure:', error);
    }
}

function renderFolderPicker(root) {
    elements.folderPicker.innerHTML = buildFolderPickerHTML(root);
    initializeFolderPickerEvents();
}

function buildFolderPickerHTML(node, parentPath = '') {
    if (!node || !node.contents) return '';

    let html = '<ul class="ml-4">';
    node.contents.forEach(item => {
        if (item.type === 'directory') {
            const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
            html += `
                <li class="my-1">
                    <div class="flex items-center space-x-1">
                        <button class="folder-toggle w-4" data-expanded="false">▶</button>
                        <button class="folder-select hover:text-blue-600" data-path="${fullPath}">
                            📁 ${item.name}
                        </button>
                    </div>
                    <div class="subfolder hidden">
                        ${buildFolderPickerHTML(item, fullPath)}
                    </div>
                </li>
            `;
        }
    });
    html += '</ul>';
    return html;
}

function initializeFolderPickerEvents() {
    elements.folderPicker.querySelectorAll('.folder-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const isExpanded = e.target.dataset.expanded === 'true';
            e.target.textContent = isExpanded ? '▶' : '▼';
            e.target.dataset.expanded = !isExpanded;
            e.target.closest('li').querySelector('.subfolder').classList.toggle('hidden');
        });
    });

    elements.folderPicker.querySelectorAll('.folder-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
            state.selectedFolder = e.target.dataset.path;
            elements.selectedFolderDisplay.textContent = state.selectedFolder;
            elements.folderPicker.classList.add('hidden');
            updateUploadButton();
        });
    });
}

// Directory Manager Functionality
function initializeDirectoryManager() {
    elements.createFolderBtn.addEventListener('click', createNewFolder);
}

async function createNewFolder() {
    const path = elements.newFolderPath.value.trim();
    if (!path) {
        alert('Please enter a valid folder path');
        return;
    }

    try {
        const response = await fetch('/api/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });

        if (response.ok) {
            alert('✅ Folder created successfully');
            elements.newFolderPath.value = '';
            await loadFolderTree();
        } else {
            const error = await response.text();
            alert('❌ Failed to create folder: ' + error);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

function renderDirectoryTree(root) {
    elements.folderTree.innerHTML = buildDirectoryTreeHTML(root);
    initializeDirectoryTreeEvents();
}

function buildDirectoryTreeHTML(node, parentPath = '') {
    if (!node || !node.contents) return '';

    let html = '<ul class="text-sm leading-6">';
    node.contents.forEach(item => {
        if (item.type === 'directory') {
            const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
            html += `
                <li class="my-1">
                    <div class="flex items-center space-x-1">
                        <button class="dir-toggle w-4" data-expanded="false">▶</button>
                        <span class="font-medium">${item.name}</span>
                        <button class="delete-dir ml-2 text-red-500 hover:text-red-700 text-xs px-1 py-0.5 border border-red-200 rounded"
                                data-path="${fullPath}">
                            🗑️
                        </button>
                    </div>
                    <div class="subdir hidden ml-5 border-l border-gray-200 pl-2">
                        ${buildDirectoryTreeHTML(item, fullPath)}
                    </div>
                </li>
            `;
        }
    });
    html += '</ul>';
    return html;
}

function initializeDirectoryTreeEvents() {
    elements.folderTree.querySelectorAll('.dir-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const isExpanded = e.target.dataset.expanded === 'true';
            e.target.textContent = isExpanded ? '▶' : '▼';
            e.target.dataset.expanded = !isExpanded;
            e.target.closest('li').querySelector('.subdir').classList.toggle('hidden');
        });
    });

    elements.folderTree.querySelectorAll('.delete-dir').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const path = e.target.dataset.path;
            if (confirm(`Are you sure you want to delete the folder "${path}"?`)) {
                await deleteDirectory(path);
            }
        });
    });
}

async function deleteDirectory(path) {
    try {
        const response = await fetch('/api/rmdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });

        if (response.ok) {
            alert('✅ Folder deleted successfully');
            await loadFolderTree();
        } else {
            const error = await response.text();
            alert('❌ Failed to delete folder: ' + error);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

// File Upload Function with Progress
async function uploadFile() {
    if (!state.fileToUpload || !state.selectedFolder) {
        alert('Please select both a folder and a file to upload');
        return;
    }

    const formData = new FormData();
    formData.append('folder', state.selectedFolder);
    formData.append('filename', state.fileToUpload.name);
    formData.append('file', state.fileToUpload);

    state.uploading = true;
    showUploadProgress();
    updateUploadButton();

    try {
        // Create XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateProgress(percentComplete);
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            try {
                const result = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    updateProgress(100);
                    setTimeout(() => {
                        alert('✅ Upload successful!');
                        resetUploadForm();
                        loadFolderTree();
                        hideUploadProgress();
                    }, 500);
                } else {
                    throw new Error(result.message || 'Upload failed');
                }
            } catch (error) {
                alert('❌ Upload failed: ' + error.message);
                hideUploadProgress();
            } finally {
                state.uploading = false;
                updateUploadButton();
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            alert('❌ Upload error: Network error occurred');
            state.uploading = false;
            hideUploadProgress();
            updateUploadButton();
        });

        // Handle timeout
        xhr.addEventListener('timeout', () => {
            alert('❌ Upload error: Request timed out');
            state.uploading = false;
            hideUploadProgress();
            updateUploadButton();
        });

        // Start upload
        xhr.open('POST', '/api/media/add');
        xhr.timeout = 300000; // 5 minutes timeout
        xhr.send(formData);

    } catch (error) {
        alert('❌ Upload error: ' + error.message);
        state.uploading = false;
        hideUploadProgress();
        updateUploadButton();
    }
}

function resetUploadForm() {
    state.fileToUpload = null;
    elements.fileInput.value = '';
    elements.previewContainer.innerHTML = '<p class="text-gray-500">No file selected.</p>';
    updateUploadButton();
}

// Utility Functions
function isImage(filename) {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
}

function isVideo(filename) {
    return /\.(mp4|webm|mov)$/i.test(filename);
}

function isGLB(filename) {
    return /\.glb$/i.test(filename);
}
