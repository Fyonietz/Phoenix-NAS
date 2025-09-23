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
            this.treeData = {
              name: "root",
              type: "directory",
              contents: [
                {
                  name: "Documents",
                  type: "directory",
                  contents: [
                    { name: "Projects", type: "directory", contents: [] },
                    { name: "Archive", type: "directory", contents: [] }
                  ]
                },
                {
                  name: "Images",
                  type: "directory",
                  contents: [
                    { name: "Photos", type: "directory", contents: [] },
                    { name: "Screenshots", type: "directory", contents: [] }
                  ]
                },
                { name: "Videos", type: "directory", contents: [] }
              ]
            };
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

