// Alpine.js global dashboard component
document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => ({
    currentView: 'dashboard',
    sidebarOpen: window.innerWidth >= 768,
    newFolderPath: '',
    uploading: false,

    navClass(view) {
      return this.currentView === view
        ? 'bg-indigo-100 text-indigo-700 font-semibold rounded px-2 py-1'
        : 'text-gray-700 hover:bg-gray-100 rounded px-2 py-1';
    },

    changeView(view) {
      this.currentView = view;
      if (window.innerWidth < 768) this.sidebarOpen = false;
    },

    init() {
      this.sidebarOpen = window.innerWidth >= 768;
      window.addEventListener('resize', () => {
        this.sidebarOpen = window.innerWidth >= 768;
      });
    },

    async makeDirectory() {
      const path = this.newFolderPath.trim();
      if (!path) {
        alert("Please enter a valid folder path.");
        return;
      }

      try {
        const res = await fetch('/api/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });

        if (res.ok) {
          alert("✅ Folder created successfully.");
          this.newFolderPath = '';

          // Refresh folder trees in both uploadExplorer and directoryManager if they exist
          if (window.uploadExplorerRef?.refreshTree instanceof Function) {
            await window.uploadExplorerRef.refreshTree();
          }
          if (window.directoryManagerRef?.loadFolders instanceof Function) {
            await window.directoryManagerRef.loadFolders();
          }

        } else {
          const error = await res.text();
          alert("❌ Failed to create folder: " + error);
        }
      } catch (err) {
        alert("❌ Error: " + err.message);
      }
    }
  }));

  Alpine.data('uploadExplorer', (root) => ({
    selectedFolder: null,
    fileToUpload: null,
    localFilePreview: null,
    showFolderPicker: false,
    treeData: null,
    dragOver: false,

    get uploading() {
      return root.uploading;
    },
    set uploading(val) {
      root.uploading = val;
    },

    async init() {
      window.uploadExplorerRef = this;
      await this.refreshTree();
    },

    async refreshTree() {
      try {
        const res = await fetch('/api/folder/lists');
        const data = await res.json();
        this.treeData = Array.isArray(data) ? (data.find(item => item.type === 'directory') || { contents: [] }) : { contents: [] };
      } catch (err) {
        console.error("Failed to refresh folder list:", err);
        this.treeData = { contents: [] };
      }
    },

    onFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.fileToUpload = file;

      const reader = new FileReader();
      reader.onload = e => {
        this.localFilePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    },

    handleDrop(event) {
      this.dragOver = false;
      const files = event.dataTransfer.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      this.fileToUpload = file;

      const reader = new FileReader();
      reader.onload = e => {
        this.localFilePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    },

    async uploadFile() {
      if (!this.fileToUpload || !this.selectedFolder) {
        alert('Please select a folder and file to upload.');
        return;
      }

      const form = new FormData();
      form.append('file', this.fileToUpload);
      form.append('folder', this.selectedFolder);
      form.append('filename', this.fileToUpload.name);

      this.uploading = true;

      try {
        const res = await fetch('/api/media/add', {
          method: 'POST',
          body: form,
        });
        const result = await res.json();
        if (res.ok) {
          alert('✅ Upload successful!');
          this.fileToUpload = null;
          this.localFilePreview = null;
          await this.refreshTree();
          const fileInput = document.querySelector('input[type="file"]');
          if (fileInput) fileInput.value = '';
        } else {
          alert('❌ Upload failed: ' + (result.message || 'Unknown error'));
        }
      } catch (err) {
        alert('❌ Upload error: ' + err.message);
      } finally {
        this.uploading = false;
      }
    },

    isImage() {
      return this.fileToUpload && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(this.fileToUpload.name);
    },

    isVideo() {
      return this.fileToUpload && /\.(mp4|webm|mov)$/i.test(this.fileToUpload.name);
    },

    isGLB() {
      return this.fileToUpload && /\.glb$/i.test(this.fileToUpload.name);
    }
  }));
});
// Alpine.js component for individual folder items
    document.addEventListener('alpine:init', () => {
      Alpine.data('folderItem', (folder, basePath, rootData) => ({
        folder,
        basePath,
        rootData,
        expanded: false,
        
        get fullPath() {
          return this.basePath ? `${this.basePath}/${this.folder.name}` : this.folder.name;
        },
        
        get hasChildren() {
          return this.folder.contents && this.folder.contents.length > 0 && 
                 this.folder.contents.some(child => child.type === 'directory');
        },
        
        selectFolder() {
          this.rootData.selectedFolder = this.fullPath;
          this.rootData.showFolderPicker = false;
        },
        
        get isSelected() {
          return this.rootData.selectedFolder === this.fullPath;
        }
      }));
    });

    function uploadExplorer() {
      return {
        selectedFolder: null,
        fileToUpload: null,
        localFilePreview: null,
        showFolderPicker: false,
        treeData: null,
        dragOver:false,
        async init() {
          try {
            const res = await fetch('/api/folder/lists');
            if (!res.ok) throw new Error('Failed to fetch folder list');
            const data = await res.json();
            // Ensure treeData is valid and has contents array to avoid undefined errors
            this.treeData = data.find(d => d.type === 'directory') || { contents: [] };
          } catch (err) {
            console.error(err);
            // Create mock data for demonstration
                      }
        },

        onFileChange(event) {
          const file = event.target.files[0];
          if (!file) return;
          this.fileToUpload = file;
          const reader = new FileReader();
          reader.onload = e => {
            this.localFilePreview = e.target.result;
          };
          reader.readAsDataURL(file);
        },

       
  handleDrop(event) {
    this.dragOver = false;
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    this.fileToUpload = file;

    const reader = new FileReader();
    reader.onload = e => {
      this.localFilePreview = e.target.result;
    };
    reader.readAsDataURL(file);
  },
async uploadFile() {
  if (!this.fileToUpload || !this.selectedFolder) {
    alert('Please select a folder and file to upload.');
    return;
  }

  const form = new FormData();
  form.append('file', this.fileToUpload);
  form.append('folder', this.selectedFolder);
  form.append('filename', this.fileToUpload.name); // Add this line

  try {
    const res = await fetch('/api/media/add', {
      method: 'POST',
      body: form,
    });
    const result = await res.json();
    if (res.ok) {
      alert('Upload successful!');
      this.fileToUpload = null;
      this.localFilePreview = null;
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      await this.refreshTree();
    } else {
      alert('Upload failed: ' + (result.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Upload error: ' + err.message);
  }
},
        async refreshTree() {
          try {
            const res = await fetch('/api/folder/lists');
            if (!res.ok) throw new Error('Failed to refresh folders');
            const data = await res.json();
            this.treeData = data.find(d => d.type === 'directory') || { contents: [] };
          } catch (err) {
            console.error(err);
          }
        },

        isImage() {
          return this.fileToUpload && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(this.fileToUpload.name);
        },
        
        isVideo() {
          return this.fileToUpload && /\.(mp4|webm|mov)$/i.test(this.fileToUpload.name);
        },
        
        isGLB() {
          return this.fileToUpload && /\.glb$/i.test(this.fileToUpload.name);
        },
      };
    }
 function mediaExplorer() {
    return {
      treeHtml: '',
      selectedFile: null,
      showMobileTree: false,

      async init() {
        try {
          const res = await fetch('/api/folder/lists');
          const data = await res.json();
          const root = data.find(d => d.type === 'directory');
          this.treeHtml = this.buildTreeHTML(root);
        } catch (e) {
          console.error('Failed to load folder list:', e);
        }
      },

      buildTreeHTML(node, parentPath = '') {
        if (!node || !node.contents) return '';

        let html = '<ul class="ml-4 border-l border-dotted border-gray-300 pl-2">';
        node.contents.forEach(child => {
          const fullPath = `${parentPath}/${child.name}`;
          if (child.type === 'directory') {
            html += `
              <li class="mt-1">
                <div @click="$el.nextElementSibling.classList.toggle('hidden')" class="cursor-pointer font-medium">
                  ▶ ${child.name}
                </div>
                <div class="hidden">
                  ${this.buildTreeHTML(child, fullPath)}
                </div>
              </li>
            `;
          } else if (this.isMediaFile(child.name)) {
            html += `
              <li class="cursor-pointer mt-1 hover:text-blue-600" @click="selectedFile='/nas${fullPath}'; showMobileTree=false;">
                📄 ${child.name}
              </li>
            `;
          }
        });
        html += '</ul>';
        return html;
      },

      isMediaFile(filename) {
        const ext = filename.toLowerCase();
        return (
          ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png') || ext.endsWith('.gif') ||
          ext.endsWith('.webp') || ext.endsWith('.bmp') || ext.endsWith('.svg') ||
          ext.endsWith('.mp4') || ext.endsWith('.webm') || ext.endsWith('.mov') ||
          ext.endsWith('.glb')
        );
      },

      isImage(file) {
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file);
      },

      isVideo(file) {
        return /\.(mp4|webm|mov)$/i.test(file);
      },

      isGLB(file) {
        return /\.glb$/i.test(file);
      },

      async deleteFile() {
        if (!this.selectedFile) return;

        if (!confirm('Are you sure you want to delete this file?')) return;

        try {
          // Assuming your API expects path without /nas prefix:
          const filePath = this.selectedFile.replace(/^\/nas/, '');

          const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath }),
          });

          if (res.ok) {
            alert('File deleted successfully');
            this.selectedFile = null;
            await this.init(); // reload folder tree
          } else {
            const error = await res.text();
            alert(`Failed to delete file: ${error}`);
          }
        } catch (err) {
          alert(`Error deleting file: ${err.message}`);
        }
      }
    };
  }
