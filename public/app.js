(() => {
  const entriesEl = document.getElementById('entries');
  const currentPathEl = document.getElementById('currentPath');
  const sortFieldEl = document.getElementById('sortField');
  const sortOrderEl = document.getElementById('sortOrder');
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
  // load sort settings from localStorage
  const savedSortField = localStorage.getItem('sortField');
  const savedSortOrder = localStorage.getItem('sortOrder');
  if (savedSortField) state.sortField = savedSortField;
  if (savedSortOrder) state.sortOrder = savedSortOrder;
  // set UI to saved values
  sortFieldEl.value = state.sortField;
  sortOrderEl.value = state.sortOrder;

  function fetchData(relPath = '') {
    fetch(`/api/files?path=${encodeURIComponent(relPath)}`)
      .then(res => res.json())
      .then(data => {
        state.path = relPath;
        state.folders = data.folders;
        state.files = data.files;
    state.selectionMode = data.selectionMode;
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
    selectBtn.disabled = state.selected.size === 0;
  }

  function render() {
    currentPathEl.textContent = state.path || '/';
    entriesEl.innerHTML = '';

    const sortedFolders = sortItems(state.folders);
    const sortedFiles = sortItems(state.files);
    const combined = [
      ...sortedFolders.map(f => ({ ...f, isFolder: true })),
      ...sortedFiles.map(f => ({ ...f, isFolder: false }))
    ];

    combined.forEach(entry => {
      const tr = document.createElement('tr');
      if (entry.isFolder) {
        tr.classList.add('folder-row');
      } else {
        const full = getFullPath(entry.name);
        if (state.selected.has(full)) {
          tr.classList.add('table-primary');
        }
      }
      tr.innerHTML = `
        <td>${entry.name}</td>
        <td>${new Date(entry.mtime).toLocaleString()}</td>
      `;
      tr.addEventListener('click', () => {
        if (entry.isFolder) {
          fetchData(
            state.path ? `${state.path}/${entry.name}` : entry.name
          );
        } else {
          const full = getFullPath(entry.name);
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
        }
        render();
      });
      entriesEl.appendChild(tr);
    });
    selectBtn.disabled = state.selected.size === 0;
  }

  function getFullPath(name) {
    return state.path ? `${state.path}/${name}` : name;
  }

  sortFieldEl.addEventListener('change', () => {
    state.sortField = sortFieldEl.value;
    localStorage.setItem('sortField', state.sortField);
    render();
  });
  sortOrderEl.addEventListener('change', () => {
    state.sortOrder = sortOrderEl.value;
    localStorage.setItem('sortOrder', state.sortOrder);
    render();
  });

  selectBtn.addEventListener('click', () => {
    const arr = Array.from(state.selected);
    fetch('/api/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(arr)
    })
      .then(res => res.json())
      .then(data => {
        console.log('Server response:', data);
        alert('Selected files sent to server.');
      })
      .catch(err => {
        console.error(err);
        alert('Error sending selected files to server.');
      });
  });
  upBtn.addEventListener('click', () => {
    const parts = state.path ? state.path.split('/') : [];
    parts.pop();
    fetchData(parts.join('/'));
  });

  // 初期ロード
  fetchData();
})();
