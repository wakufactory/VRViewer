(() => {
  // UIまわりの主要DOM参照
  const fileInput = document.getElementById('file-input');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const seekBar = document.getElementById('seek-bar');
  const infoEl = document.getElementById('folder-info');

  const sceneEl = document.querySelector('a-scene');
  const imageAsset = document.getElementById('imageAsset');
  const videoAsset = document.getElementById('videoAsset');

  // A-Frameに必要な要素が揃っていない場合は初期化を中断
  if (!sceneEl || !imageAsset || !videoAsset) {
    console.warn('[view] Missing required viewer elements; aborting bootstrap');
    return;
  }

  // メディア用エンティティを動的に管理するためのコンテナ
  const viewRoot = document.createElement('a-entity');
  viewRoot.id = 'media-view-root';
  sceneEl.appendChild(viewRoot);

  // ビューモードごとにESモジュールを遅延ロードするテーブル
  const viewModuleLoaders = {
    'vr360': () => import('./view-modules/vr360.js'),
    'vr180': () => import('./view-modules/vr180.js'),
    'sbs': () => import('./view-modules/sbs.js'),
    'flat-video': () => import('./view-modules/flat-video.js'),
    'flat-image': () => import('./view-modules/flat-image.js')
  };

  // 既に生成したビューアダプタはキャッシュして使い回す
  const viewModuleCache = new Map();
  let currentViewAdapter = null;
  let currentViewKey = null;
  let currentDirInfo = null;

  const toLower = (value) => (value == null ? '' : String(value).toLowerCase());

  // ファイル名・メタ情報から表示モードを推測
  const detectMode = ({ filename, info }) => {
    const nameForDetect = filename || '';
    const hasVR180Name = /vr180/i.test(nameForDetect);
    const hasVR360Name = /vr360/i.test(nameForDetect);
    const hasSBSName = /(?:^|[_-])sbs(?:$|[_-]|\.)/i.test(nameForDetect);

    const typeParamLC = toLower(info && info.type);
    const hasVR180Param = /vr180|180/.test(typeParamLC);
    const hasVR360Param = typeParamLC === 'vr360' || /(^|\b)360(\b|$)/.test(typeParamLC);
    const hasSBSParam = /sbs/.test(typeParamLC);

    if (hasVR180Name) return 'vr180';
    if (hasVR360Name) return 'vr360';
    if (hasSBSName) return 'sbs';
    if (hasVR180Param) return 'vr180';
    if (hasVR360Param) return 'vr360';
    if (hasSBSParam) return 'sbs';
    return null;
  };

  // ビュー種別に応じて読み込むモジュールのキーを決定
  const resolveViewModuleKey = ({ isVideo, filename, info }) => {
    const mode = detectMode({ filename, info });
    if (mode === 'vr180') return { key: 'vr180', mode };
    if (mode === 'vr360') return { key: 'vr360', mode };
    if (mode === 'sbs') return { key: 'sbs', mode };
    return { key: isVideo ? 'flat-video' : 'flat-image', mode: null };
  };

  // 指定キーのビューアダプタを取得（未ロードならモジュールを動的 import）
  const ensureViewAdapter = async (key) => {
    let adapter = viewModuleCache.get(key);
    if (adapter) return adapter;

    const loader = viewModuleLoaders[key];
    if (!loader) throw new Error(`Unsupported view module: ${key}`);

    let moduleExports;
    try {
      moduleExports = await loader();
    } catch (err) {
      console.error(`[view] Failed to load module "${key}"`, err);
      throw err;
    }

    const factory = typeof moduleExports.createView === 'function'
      ? moduleExports.createView
      : moduleExports.default;

    if (typeof factory !== 'function') {
      throw new Error(`View module "${key}" does not export a factory function`);
    }

    // ファクトリからアダプタを生成してキャッシュ
    adapter = factory({ sceneEl, viewRoot, videoAsset, imageAsset });
    viewModuleCache.set(key, adapter);
    return adapter;
  };

  // 現在のビューを切り替えて表示処理を呼び出す
  const activateView = async (key, params) => {
    const adapter = await ensureViewAdapter(key);

    if (currentViewAdapter && currentViewAdapter !== adapter) {
      try {
        currentViewAdapter.hide?.();
      } catch (err) {
        console.warn('[view] Failed to hide previous view adapter', err);
      }
    }

    currentViewAdapter = adapter;
    currentViewKey = key;

    if (typeof adapter.show === 'function') {
      await adapter.show(params);
    }
  };

  const onLoadedMetadata = () => {
    if (seekBar) {
      seekBar.max = videoAsset.duration || 0;
    }
  };

  const onTimeUpdate = () => {
    if (seekBar && !Number.isNaN(videoAsset.currentTime)) {
      seekBar.value = videoAsset.currentTime || 0;
    }
  };

  const onSeekInput = () => {
    if (!seekBar) return;
    try {
      const next = Number(seekBar.value);
      if (!Number.isNaN(next)) {
        videoAsset.currentTime = next;
      }
    } catch (_) {}
  };

  // 再生UIが二重登録されないよう毎回バインドし直す
  const rebindVideoUi = () => {
    videoAsset.removeEventListener('loadedmetadata', onLoadedMetadata);
    videoAsset.removeEventListener('timeupdate', onTimeUpdate);
    if (seekBar) seekBar.removeEventListener('input', onSeekInput);

    videoAsset.addEventListener('loadedmetadata', onLoadedMetadata);
    videoAsset.addEventListener('timeupdate', onTimeUpdate);
    if (seekBar) seekBar.addEventListener('input', onSeekInput);
  };

  // 動画でない場合にリスナを解除
  const releaseVideoUi = () => {
    videoAsset.removeEventListener('loadedmetadata', onLoadedMetadata);
    videoAsset.removeEventListener('timeupdate', onTimeUpdate);
    if (seekBar) seekBar.removeEventListener('input', onSeekInput);
  };

  // 動画再生UIの表示更新
  const showVideoUi = () => {
    if (playPauseBtn) {
      playPauseBtn.style.display = 'block';
      playPauseBtn.textContent = videoAsset.paused ? 'Play' : 'Pause';
    }
    if (seekBar) {
      seekBar.style.display = 'block';
      seekBar.value = 0;
      seekBar.max = videoAsset.duration || 0;
    }
  };

  // 静止画などではUIを非表示に戻す
  const hideVideoUi = () => {
    if (playPauseBtn) {
      playPauseBtn.style.display = 'none';
      playPauseBtn.textContent = 'Play';
    }
    if (seekBar) {
      seekBar.style.display = 'none';
      seekBar.value = 0;
      seekBar.max = 0;
    }
  };

  const togglePlayPause = () => {
    if (!videoAsset.src) return;
    if (videoAsset.paused) {
      const playPromise = videoAsset.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(err => console.warn('[view] Failed to play video', err));
      }
      if (playPauseBtn) playPauseBtn.textContent = 'Pause';
    } else {
      videoAsset.pause();
      if (playPauseBtn) playPauseBtn.textContent = 'Play';
    }
  };

  // メディア読み込みとビュー切替のメイン処理
  const loadMedia = async (src, isVideo, filename) => {
    if (!src) return;
    if (fileInput) fileInput.style.display = 'none';

    const { key, mode } = resolveViewModuleKey({ isVideo, filename, info: currentDirInfo });

    if (isVideo) {
      imageAsset.removeAttribute('src');
      videoAsset.setAttribute('src', src);
      rebindVideoUi();
      showVideoUi();
      if (playPauseBtn) playPauseBtn.textContent = 'Play';
    } else {
      videoAsset.pause();
      videoAsset.removeAttribute('src');
      imageAsset.setAttribute('src', src);
      releaseVideoUi();
      hideVideoUi();
    }

    try {
      await activateView(key, { src, filename, isVideo, mode, info: currentDirInfo });
    } catch (err) {
      console.error('[view] Failed to activate view', err);
    }
  };

  // WebGLコンテキスト喪失時に画面をリロードして復旧
  (function attachContextLossHandler() {
    const onRendererReady = () => {
      const renderer = sceneEl && sceneEl.renderer;
      if (!renderer || !renderer.domElement) return;
      const canvas = renderer.domElement;

      const onLost = (e) => {
        try { if (e && typeof e.preventDefault === 'function') e.preventDefault(); } catch (_) {}
        const inXR = !!(renderer.xr && renderer.xr.isPresenting) || (sceneEl && sceneEl.is && sceneEl.is('vr-mode'));
        try { if (inXR && sceneEl && typeof sceneEl.exitVR === 'function') sceneEl.exitVR(); } catch (_) {}
        setTimeout(() => { try { location.reload(); } catch(_) {} }, inXR ? 150 : 0);
      };

      canvas.addEventListener('webglcontextlost', onLost, false);
    };

    if (sceneEl && sceneEl.renderer) onRendererReady();
    else if (sceneEl) sceneEl.addEventListener('rendererinitialized', onRendererReady, { once: true });
  })();

  // VRセッション中は2Dキャンバスを隠し、終了後に復帰させる
  (function manageImmersiveCanvasVisibility() {
    if (!sceneEl) return;

    let cachedCanvas = null;
    const getCanvas = () => {
      if (cachedCanvas && cachedCanvas.isConnected) return cachedCanvas;
      const c = sceneEl.canvas || (sceneEl.renderer && sceneEl.renderer.domElement) || null;
      if (c) cachedCanvas = c;
      return c;
    };

    const setCanvasVisible = (visible) => {
      const canvas = getCanvas();
      if (!canvas) return;
      if (visible) {
        if (canvas.dataset.prevVisibility !== undefined) {
          canvas.style.visibility = canvas.dataset.prevVisibility;
          delete canvas.dataset.prevVisibility;
        } else {
          canvas.style.visibility = '';
        }
      } else {
        if (canvas.dataset.prevVisibility === undefined) {
          canvas.dataset.prevVisibility = canvas.style.visibility || '';
        }
        canvas.style.visibility = 'hidden';
      }
    };

    const requestSceneRedraw = () => {
      if (!(sceneEl && sceneEl.renderer && sceneEl.object3D && sceneEl.camera)) return;
      const renderer = sceneEl.renderer;
      const sceneObj = sceneEl.object3D;
      const cameraObj = sceneEl.camera;
      const schedule = window.requestAnimationFrame
        ? (fn) => window.requestAnimationFrame(fn)
        : (fn) => window.setTimeout(fn, 16);
      const draw = () => {
        if (!(renderer && sceneObj && cameraObj)) return;
        if (renderer.xr && renderer.xr.isPresenting) return;
        try {
          renderer.render(sceneObj, cameraObj);
        } catch (err) {
          console.warn('Failed to redraw scene after immersive exit', err);
        }
      };
      schedule(draw);
    };

    const updateImmersiveState = (() => {
      let immersiveActive = false;
      return (active) => {
        const next = !!active;
        if (next === immersiveActive) {
          setCanvasVisible(!next);
          return;
        }
        immersiveActive = next;
        setCanvasVisible(!next);
        if (!next) requestSceneRedraw();
      };
    })();

    const handleSessionStart = () => { updateImmersiveState(true); };
    const handleSessionEnd = () => { updateImmersiveState(false); };

    const attachRendererListeners = () => {
      if (!(sceneEl.renderer && sceneEl.renderer.xr)) return;
      const xr = sceneEl.renderer.xr;
      xr.addEventListener('sessionstart', handleSessionStart);
      xr.addEventListener('sessionend', handleSessionEnd);
      if (typeof xr.isPresenting === 'boolean' && xr.isPresenting) {
        updateImmersiveState(true);
      }
    };

    if (sceneEl.renderer) attachRendererListeners();
    else sceneEl.addEventListener('rendererinitialized', attachRendererListeners, { once: true });

    sceneEl.addEventListener('enter-vr', handleSessionStart);
    sceneEl.addEventListener('exit-vr', handleSessionEnd);
  })();

  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      currentDirInfo = null;
      if (infoEl) {
        infoEl.textContent = '';
        infoEl.style.display = 'none';
      }
      const isVideo = file.type && file.type.startsWith('video/');
      const url = URL.createObjectURL(file);
      void loadMedia(url, !!isVideo, file.name).catch(err => console.error('[view] Failed to load selected media', err));
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', togglePlayPause);
  }
  sceneEl.addEventListener('media:toggle', togglePlayPause);

  // 起動時にクエリパラメータまたはWS経由の制御を処理
  window.addEventListener('load', () => {
    const raw = window.location.search;
    const search = (raw && raw.length > 1) ? raw.substring(1) : '';
    let srcPath = '';
    let info = {};

    if (search) {
      if (search.includes('=')) {
        const usp = new URLSearchParams(search);
        srcPath = usp.get('src') || usp.get('file') || usp.get('path') || '';
        if (!srcPath) {
          for (const [k, v] of usp.entries()) {
            if (v === '' && k) { srcPath = k; break; }
          }
        }
        for (const [k, v] of usp.entries()) {
          if (k === 'src' || k === 'file' || k === 'path') continue;
          if (v === '' && k === srcPath) continue;
          info[k] = v;
        }
      } else {
        srcPath = search;
      }
    }

    if (srcPath) {
      currentDirInfo = Object.keys(info).length ? info : null;
      const fname = srcPath.split('/').pop();
      void loadMedia(srcPath, /\.(mp4|webm|ogg)$/i.test(srcPath), fname).catch(err => console.error('[view] Failed to load media from query', err));
      if (infoEl && currentDirInfo) {
        infoEl.style.display = 'block';
        try { infoEl.textContent = JSON.stringify(currentDirInfo, null, 2); } catch (_) {}
      }
    } else {
      const selectionUrl = new URL('./api/last-selection', window.location.href);
      void fetch(selectionUrl.toString(), { cache: 'no-store' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) handleSelectionPayload(data);
        })
        .catch(err => console.warn('[view] Failed to fetch last selection', err))
        .finally(() => { connect(); });
    }
  });

  const baseUrl = 'data/';
  let ws;
  const log = (msg) => {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  };

  const handleSelectionPayload = (payload) => {
    let files = [];
    let info = null;
    let relPath = '';
    if (Array.isArray(payload)) {
      files = payload;
    } else if (payload && typeof payload === 'object') {
      files = Array.isArray(payload.files) ? payload.files : [];
      info = payload.info || null;
      relPath = payload.path || '';
    }

    currentDirInfo = info || null;
    if (infoEl) {
      if (info) {
        infoEl.textContent = JSON.stringify({ path: relPath, info }, null, 2);
        infoEl.style.display = 'block';
      } else {
        infoEl.textContent = '';
        infoEl.style.display = 'none';
      }
    }

    if (files && files.length > 0) {
      const p = baseUrl + files[0];
      const fname = files[0].split('/').pop();
      void loadMedia(p, /\.(mp4|webm|ogg)$/i.test(p), fname).catch(err => console.error('[view] Failed to load media from selection', err));
    }
  };

  // WebSocketでフォルダ監視サーバーと接続し、更新を反映
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const basePath = location.pathname.replace(/\/[^\/]*$/, '');
    ws = new WebSocket(`${proto}://${location.host}${basePath || ''}/`);
    ws.onopen = () => { log('接続済み'); };
    ws.onerror = () => { log('接続エラー'); };
    ws.onmessage = e => {
      let payload;
      try { payload = JSON.parse(e.data); } catch (_) { payload = e.data; }
      handleSelectionPayload(payload);
    };
    ws.onclose = () => {
      setTimeout(connect, 1000);
    };
  }
})();
