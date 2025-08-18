(() => {
  const foldersEl = document.getElementById('folders');
  const filesEl = document.getElementById('files');
  const currentPathEl = document.getElementById('currentPath');
  const sortFieldEl = document.getElementById('sortField');
  const sortOrderEl = document.getElementById('sortOrder');
  const selectionModeEl = document.getElementById('selectionMode');
  const selectBtn = document.getElementById('selectBtn');
  const upBtn = document.getElementById('upBtn');

  let state = {
    path: '',
    folders: [],
    files: [],
    sortField: 'name',
    sortOrder: 'asc',
    selectionMode: 'single',
    selected: new Set()
  };

  function fetchData(relPath = '') {
    fetch(`/api/files?path=${encodeURIComponent(relPath)}`)
      .then(res => res.json())
      .then(data => {
        state.path = relPath;
        state.folders = data.folders;
        state.files = data.files;
        state.selectionMode = data.selectionMode;
        selectionModeEl.value = state.selectionMode;
        render();
      })
      .catch(err => console.error(err));
  }

  function sortItems(arr) {
    return arr.slice().sort((a, b) => {
      let vA = a[state.sortField];
      let vB = b[state.sortField];
      if (state.sortField === 'name') {
        vA = vA.toLowerCase();
        vB = vB.toLowerCase();
      }
      if (vA < vB) return state.sortOrder === 'asc' ? -1 : 1;
      if (vA > vB) return state.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function render() {
    currentPathEl.textContent = state.path || '/';
    // folders
    foldersEl.innerHTML = '';
    sortItems(state.folders).forEach(folder => {
      const li = document.createElement('li');
      li.textContent = folder.name + ' (' + new Date(folder.mtime).toLocaleString() + ')';
      li.className = 'list-item';
      li.addEventListener('click', () => {
        fetchData(state.path ? `${state.path}/${folder.name}` : folder.name);
      });
      foldersEl.appendChild(li);
    });
    // files
    filesEl.innerHTML = '';
    sortItems(state.files).forEach(file => {
      const li = document.createElement('li');
      li.textContent = file.name + ' (' + new Date(file.mtime).toLocaleString() + ')';
      li.className = 'list-item';
      li.dataset.name = file.name;
      if (state.selected.has(getFullPath(file.name))) {
        li.classList.add('highlight');
      }
      li.addEventListener('click', () => {
        const full = getFullPath(file.name);
        if (state.selectionMode === 'single') {
          state.selected.clear();
          state.selected.add(full);
        } else {
          if (state.selected.has(full)) {
            state.selected.delete(full);
          } else {
            state.selected.add(full);
          }
        }
        render();
      });
      filesEl.appendChild(li);
    });
  }

  function getFullPath(name) {
    return state.path ? `${state.path}/${name}` : name;
  }

  sortFieldEl.addEventListener('change', () => {
    state.sortField = sortFieldEl.value;
    render();
  });
  sortOrderEl.addEventListener('change', () => {
    state.sortOrder = sortOrderEl.value;
    render();
  });
  selectionModeEl.addEventListener('change', () => {
    state.selectionMode = selectionModeEl.value;
    state.selected.clear();
    render();
  });

  selectBtn.addEventListener('click', () => {
    const arr = Array.from(state.selected);
    console.log('Selected files:', arr);
    alert('Selected files:\n' + arr.join('\n'));
  });

  upBtn.addEventListener('click', () => {
    const parts = state.path ? state.path.split('/') : [];
    parts.pop();
    const parent = parts.join('/');
    fetchData(parent);
  });

  // 初期ロード
  fetchData();
})();
