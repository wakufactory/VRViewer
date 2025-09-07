// Main viewer logic as ES module
(() => {
  // UI elements
  const fileInput = document.getElementById('file-input');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const seekBar = document.getElementById('seek-bar');
  const infoEl = document.getElementById('folder-info');

  // A-Frame elements
  const sceneEl = document.querySelector('a-scene');
  const skyEl = document.getElementById('sky');
  const videoSphere = document.getElementById('video-sphere');
  const stereoSphere = document.getElementById('stereo-sphere');
  const imageAsset = document.getElementById('imageAsset');
  const videoAsset = document.getElementById('videoAsset');

  let currentDirInfo = null; // holds info from folder (.info.json)

  // Handlers cached to avoid duplicate listeners
  const onLoadedMetadata = () => { seekBar.max = videoAsset.duration || 0; };
  const onTimeUpdate = () => { seekBar.value = videoAsset.currentTime || 0; };
  const onSeekInput = () => { try { videoAsset.currentTime = Number(seekBar.value) || 0; } catch(_) {} };

  function togglePlayPause() {
    if (!videoAsset.src) return;
    if (videoAsset.paused) {
      videoAsset.play();
      playPauseBtn.textContent = 'Pause';
    } else {
      videoAsset.pause();
      playPauseBtn.textContent = 'Play';
    }
  }

  // filename: original file name (used to detect _sbs for VR180)
  function loadMedia(src, isVideo, filename) {
    fileInput.style.display = 'none';
    const nameForDetect = filename || src || '';
    const isVR180 = (currentDirInfo && currentDirInfo.type === 'vr180') || /_sbs\.|VR180/i.test(nameForDetect);

    if (isVideo) {
      imageAsset.removeAttribute('src');
      skyEl.setAttribute('visible', 'false');
      videoAsset.setAttribute('src', src);
      if (isVR180) {
        // Use stereo-sbs component for VR180 video
        stereoSphere.setAttribute('stereo-sbs', 'src: #videoAsset; monoEye: left; halfTurn: true');
        stereoSphere.setAttribute('visible', 'true');
        videoSphere.setAttribute('visible', 'false');
      } else {
        videoSphere.setAttribute('visible', 'true');
        stereoSphere.setAttribute('visible', 'false');
      }
      playPauseBtn.style.display = 'block';
      seekBar.style.display = 'block';

      // rebind media listeners (prevent duplicates)
      videoAsset.removeEventListener('loadedmetadata', onLoadedMetadata);
      videoAsset.removeEventListener('timeupdate', onTimeUpdate);
      seekBar.removeEventListener('input', onSeekInput);
      videoAsset.addEventListener('loadedmetadata', onLoadedMetadata);
      videoAsset.addEventListener('timeupdate', onTimeUpdate);
      seekBar.addEventListener('input', onSeekInput);
    } else {
      videoAsset.pause();
      videoAsset.removeAttribute('src');
      videoSphere.setAttribute('visible', 'false');
      if (isVR180) {
        // Use stereo-sbs for VR180 image
        stereoSphere.setAttribute('stereo-sbs', 'src: #imageAsset; monoEye: left; halfTurn: true');
        stereoSphere.setAttribute('visible', 'true');
      } else {
        stereoSphere.setAttribute('visible', 'false');
      }
      imageAsset.setAttribute('src', src);
      imageAsset.addEventListener('load', () => {
        if (!isVR180) {
          // 非VR180: a-skyに反映（カバー調整）
          skyEl.setAttribute('src', '#imageAsset');

          const replaceSkyTexture = () => {
            const mesh = skyEl.getObject3D('mesh');
            if (!(mesh && mesh.material)) return false;
            const THREE = AFRAME.THREE;
            const newTex = new THREE.Texture(imageAsset);
            if (THREE.SRGBColorSpace) {
              newTex.colorSpace = THREE.SRGBColorSpace;
            } else if (THREE.sRGBEncoding) {
              newTex.encoding = THREE.sRGBEncoding;
            }
            newTex.minFilter = THREE.LinearFilter;
            newTex.magFilter = THREE.LinearFilter;
            newTex.generateMipmaps = false;
            newTex.flipY = true;
            newTex.wrapS = THREE.ClampToEdgeWrapping;
            newTex.wrapT = THREE.ClampToEdgeWrapping;

            const iw = imageAsset.naturalWidth || (newTex.image && newTex.image.width) || 0;
            const ih = imageAsset.naturalHeight || (newTex.image && newTex.image.height) || 1;
            const A = iw / ih;
            const D = 2; // 2:1
            let rx = 1, ry = 1, ox = 0, oy = 0;
            if (A > D) { rx = D / A; ox = (1 - rx) / 2; }
            else if (A < D) { ry = A / D; oy = (1 - ry) / 2; }
            newTex.repeat.set(rx, ry);
            newTex.offset.set(ox, oy);
            newTex.needsUpdate = true;

            if (mesh.material.map && mesh.material.map.dispose) {
              try { mesh.material.map.dispose(); } catch (e) {}
            }
            mesh.material.map = newTex;
            mesh.material.needsUpdate = true;
            return true;
          };

          if (!replaceSkyTexture()) {
            const onReady = () => { replaceSkyTexture(); };
            skyEl.addEventListener('materialtextureloaded', onReady, { once: true });
          }

          skyEl.setAttribute('visible', 'true');
        } else {
          skyEl.setAttribute('visible', 'false');
        }
      }, { once: true });
      playPauseBtn.style.display = 'none';
      seekBar.style.display = 'none';
    }
  }

  // File input handler
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    currentDirInfo = null;
    loadMedia(URL.createObjectURL(file), file.type.startsWith('video/'), file.name);
  });

  // Toggle via UI button
  playPauseBtn.addEventListener('click', togglePlayPause);
  // Toggle via A-Frame components
  sceneEl.addEventListener('media:toggle', togglePlayPause);

  // URL query handler and conditional WS connect
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
      loadMedia(srcPath, /\.(mp4|webm|ogg)$/i.test(srcPath), fname);
      if (infoEl && currentDirInfo) {
        infoEl.style.display = 'block';
        try { infoEl.textContent = JSON.stringify(currentDirInfo, null, 2); } catch (_) {}
      }
    } else {
      connect();
    }
  });

  // WebSocket bridge
  const baseUrl = 'data/';
  let ws;
  function log(msg) {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // Detect basePath from current page (directory of view.html)
    const basePath = location.pathname.replace(/\/[^\/]*$/, '');
    ws = new WebSocket(`${proto}://${location.host}${basePath || ''}/`);
    ws.onopen = () => { log('接続済み'); };
    ws.onerror = () => { log('接続エラー'); };
    ws.onmessage = e => {
      let payload;
      try { payload = JSON.parse(e.data); } catch (_) { payload = e.data; }

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
      if (info) {
        infoEl.textContent = JSON.stringify({ path: relPath, info }, null, 2);
        infoEl.style.display = 'block';
      } else {
        infoEl.textContent = '';
        infoEl.style.display = 'none';
      }

      if (files && files.length > 0) {
        const p = baseUrl + files[0];
        const fname = files[0].split('/').pop();
        loadMedia(p, /\.(mp4|webm|ogg)$/i.test(p), fname);
      }
    };
    ws.onclose = () => {
      setTimeout(connect, 1000);
    };
  }
})();
