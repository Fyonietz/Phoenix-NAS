// Global state
const state = {
    selectedFolder: null,
    filesToUpload: [], // Changed from single file to array
    currentView: 'dashboard',
    uploading: false,
    uploadQueue: []
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
    // Enable multiple file selection
    elements.fileInput.setAttribute('multiple', 'multiple');
    
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    elements.uploadBtn.addEventListener('click', uploadFiles);
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        addFilesToUpload(files);
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
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        addFilesToUpload(files);
    }
}

function addFilesToUpload(files) {
    state.filesToUpload = [...state.filesToUpload, ...files];
    updateUploadButton();
    updatePreviewList();
}

function removeFileFromUpload(index) {
    state.filesToUpload.splice(index, 1);
    updateUploadButton();
    updatePreviewList();
}

function updateUploadButton() {
    const fileCount = state.filesToUpload.length;
    elements.uploadBtn.disabled = fileCount === 0 || !state.selectedFolder || state.uploading;
    elements.uploadBtn.textContent = fileCount > 0 ? `Upload ${fileCount} file${fileCount > 1 ? 's' : ''}` : 'Upload';
}

function updatePreviewList() {
    if (state.filesToUpload.length === 0) {
        elements.previewContainer.innerHTML = '<p class="text-gray-500">No files selected.</p>';
        return;
    }

    const container = document.createElement('div');
    container.className = 'space-y-4';

    state.filesToUpload.forEach((file, index) => {
        const fileCard = document.createElement('div');
        fileCard.className = 'border rounded-lg p-3 bg-white shadow-sm';
        
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-2';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'flex items-center space-x-2';
        
        const icon = document.createElement('span');
        icon.textContent = getFileIcon(file.name);
        icon.className = 'text-2xl';
        
        const details = document.createElement('div');
        details.innerHTML = `
            <div class="font-medium text-sm">${file.name}</div>
            <div class="text-xs text-gray-500">${formatFileSize(file.size)}</div>
        `;
        
        fileInfo.appendChild(icon);
        fileInfo.appendChild(details);
        
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.className = 'text-red-500 hover:text-red-700 font-bold text-lg px-2 py-1';
        removeBtn.addEventListener('click', () => removeFileFromUpload(index));
        
        header.appendChild(fileInfo);
        header.appendChild(removeBtn);
        fileCard.appendChild(header);
        
        // Add preview for supported formats
        if (isImage(file.name) || isVideo(file.name) || is3DModel(file.name)) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = createPreviewElement(file, e.target.result);
                preview.className = 'mt-2 ' + preview.className;
                fileCard.appendChild(preview);
            };
            reader.readAsDataURL(file);
        }
        
        container.appendChild(fileCard);
    });

    elements.previewContainer.innerHTML = '';
    elements.previewContainer.appendChild(container);
}

function createPreviewElement(file, dataUrl) {
    if (isImage(file.name)) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'max-w-full max-h-[200px] border rounded shadow';
        return img;
    } else if (isVideo(file.name)) {
        const video = document.createElement('video');
        video.src = dataUrl;
        video.controls = true;
        video.className = 'max-w-full max-h-[200px] border rounded shadow';
        return video;
    } else if (is3DModel(file.name)) {
        const modelViewer = document.createElement('model-viewer');
        modelViewer.src = dataUrl;
        modelViewer.setAttribute('auto-rotate', '');
        modelViewer.setAttribute('camera-controls', '');
        modelViewer.style.backgroundColor = '#fff';
        modelViewer.className = 'w-full h-[200px] border rounded shadow';
        return modelViewer;
    }
    const p = document.createElement('p');
    p.textContent = 'No preview available';
    p.className = 'text-gray-500 text-sm';
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

function updateProgress(percent, currentFile = '', currentIndex = 0, totalFiles = 0) {
    if (elements.progressBar) {
        elements.progressBar.style.width = `${percent}%`;
    }
    if (elements.progressText) {
        if (totalFiles > 1) {
            elements.progressText.textContent = `Uploading ${currentIndex}/${totalFiles}: ${currentFile} (${Math.round(percent)}%)`;
        } else {
            elements.progressText.textContent = `${Math.round(percent)}%`;
        }
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

// Multi-File Upload Function with Progress
async function uploadFiles() {
    if (state.filesToUpload.length === 0 || !state.selectedFolder) {
        alert('Please select both a folder and files to upload');
        return;
    }

    state.uploading = true;
    showUploadProgress();
    updateUploadButton();

    const totalFiles = state.filesToUpload.length;
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < totalFiles; i++) {
        const file = state.filesToUpload[i];
        
        try {
            const result = await uploadSingleFile(file, i + 1, totalFiles);
            if (result.success) {
                successCount++;
            } else {
                failCount++;
                errors.push(`${file.name}: ${result.error}`);
            }
        } catch (error) {
            failCount++;
            errors.push(`${file.name}: ${error.message}`);
        }
    }

    state.uploading = false;
    hideUploadProgress();
    
    // Show results
    let message = `Upload complete!\n✅ ${successCount} successful`;
    if (failCount > 0) {
        message += `\n❌ ${failCount} failed`;
        if (errors.length > 0) {
            message += `\n\nErrors:\n${errors.join('\n')}`;
        }
    }
    
    alert(message);
    
    if (successCount > 0) {
        resetUploadForm();
        loadFolderTree();
    }
    
    updateUploadButton();
}

function uploadSingleFile(file, currentIndex, totalFiles) {
    return new Promise((resolve) => {
        const formData = new FormData();
        formData.append('folder', state.selectedFolder);
        formData.append('filename', file.name);
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateProgress(percentComplete, file.name, currentIndex, totalFiles);
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            try {
                const result = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: result.message || 'Upload failed' });
                }
            } catch (error) {
                resolve({ success: false, error: error.message });
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            resolve({ success: false, error: 'Network error occurred' });
        });

        // Handle timeout
        xhr.addEventListener('timeout', () => {
            resolve({ success: false, error: 'Request timed out' });
        });

        // Start upload
        xhr.open('POST', '/api/media/add');
        xhr.timeout = 300000; // 5 minutes timeout
        xhr.send(formData);
    });
}

function resetUploadForm() {
    state.filesToUpload = [];
    elements.fileInput.value = '';
    elements.previewContainer.innerHTML = '<p class="text-gray-500">No files selected.</p>';
    updateUploadButton();
}

// Utility Functions
function isImage(filename) {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
}

function isVideo(filename) {
    return /\.(mp4|webm|mov)$/i.test(filename);
}

function is3DModel(filename) {
    return /\.(glb|fbx)$/i.test(filename);
}

function isGLB(filename) {
    return /\.glb$/i.test(filename);
}

function isFBX(filename) {
    return /\.fbx$/i.test(filename);
}

function getFileIcon(filename) {
    if (isImage(filename)) return '🖼️';
    if (isVideo(filename)) return '🎬';
    if (is3DModel(filename)) return '🎮';
    return '📄';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
