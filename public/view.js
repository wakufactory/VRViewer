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
  const stereoPlane = document.getElementById('stereo-plane');
  const imagePlane = document.getElementById('image-plane');
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

  // filename: original file name (used to detect _sbs and VR tags)
  function loadMedia(src, isVideo, filename) {
    fileInput.style.display = 'none';
    const nameForDetect = filename || src || '';
    const isVR180 = (currentDirInfo && /vr180/i.test(currentDirInfo.type || '')) || /VR180/i.test(nameForDetect);
    const isVR360 = (currentDirInfo && currentDirInfo.type === 'vr360');
    const isSBS2D = (!isVR180 && !isVR360) && (
      (currentDirInfo && /sbs/i.test(currentDirInfo.type || '')) || /_sbs(?=\.)/i.test(nameForDetect)
    );

    // Reset visibility before switching
    skyEl.setAttribute('visible', 'false');
    videoSphere.setAttribute('visible', 'false');
    stereoSphere.setAttribute('visible', 'false');
    if (stereoPlane) stereoPlane.setAttribute('visible', 'false');
    if (imagePlane) imagePlane.setAttribute('visible', 'false');

    if (isVideo) {
      imageAsset.removeAttribute('src');
      videoAsset.setAttribute('src', src);
      if (isVR180) {
        // Use stereo-sbs component for VR180 video
        stereoSphere.setAttribute('stereo-sbs', 'src: #videoAsset; monoEye: left; halfTurn: true');
        stereoSphere.setAttribute('visible', 'true');
      } else if (isVR360) {
        videoSphere.setAttribute('visible', 'true');
      } else if (isSBS2D) {
        // 2D SBS video on plane using stereo-sbs in plane mode
        if (stereoPlane) {
          stereoPlane.setAttribute('stereo-sbs', 'src: #videoAsset; monoEye: left; planeMode: true');
          // set size after metadata loads
          const setVideoPlaneSize = () => {
            const vw = videoAsset.videoWidth || 0;
            const vh = videoAsset.videoHeight || 0;
            if (vw > 0 && vh > 0) {
              const aspect = (vw / 2) / vh; // half width for SBS
              const h = 3;
              const w = h * aspect;
              stereoPlane.setAttribute('geometry', `primitive: plane; width: ${w}; height: ${h}`);
            }
          };
          // update once metadata is available
          if (videoAsset.readyState >= 1) setVideoPlaneSize();
          else videoAsset.addEventListener('loadedmetadata', setVideoPlaneSize, { once: true });
          stereoPlane.setAttribute('visible', 'true');
        } else {
          // fallback to normal videosphere if stereoPlane missing
          videoSphere.setAttribute('visible', 'true');
        }
      } else {
        // Non-VR video: keep simple support with videosphere for now
        videoSphere.setAttribute('visible', 'true');
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
      if (isVR180) {
        // Use stereo-sbs for VR180 image
        stereoSphere.setAttribute('stereo-sbs', 'src: #imageAsset; monoEye: left; halfTurn: true');
        stereoSphere.setAttribute('visible', 'true');
      } else if (isVR360) {
        // VR360 image -> a-sky
        skyEl.setAttribute('visible', 'true');
      } else if (isSBS2D) {
        // 2D SBS image on plane using stereo-sbs in plane mode
        if (stereoPlane) stereoPlane.setAttribute('visible', 'true');
      } else {
        // Flat image -> plane (aspect-correct)
        if (imagePlane) imagePlane.setAttribute('visible', 'true');
      }
      imageAsset.setAttribute('src', src);
      imageAsset.addEventListener('load', () => {
        if (isVR360) {
          // VR360: a-sky に反映（2:1 カバー調整）
          skyEl.setAttribute('src', '#imageAsset');

          const replaceSkyTexture = () => {
            const mesh = skyEl.getObject3D('mesh');
            if (!(mesh && mesh.material)) return false;
            const THREE = AFRAME.THREE;
            const newTex = new THREE.Texture(imageAsset);
            if (THREE.SRGBColorSpace) {
              newTex.colorSpace = THREE.SRGBColorSpace;
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
        } else if (!isVR180) {
          // 平面画像: アスペクトを維持してplaneサイズを調整（最大辺≈2m）
          const iw = imageAsset.naturalWidth || 1;
          const ih = imageAsset.naturalHeight || 1;
          const aspect = isSBS2D ? (iw / 2) / ih : (iw / ih);
          // 高さを基準に横幅を計算（常に高さ一定）
          const h = 3; // 基準高さ（m）
          const w = h * aspect;
          if (isSBS2D && stereoPlane) {
            // Use stereo plane with shader (no need to set material manually)
            stereoPlane.setAttribute('geometry', `primitive: plane; width: ${w}; height: ${h}`);
            stereoPlane.setAttribute('stereo-sbs', 'src: #imageAsset; monoEye: left; planeMode: true');
            stereoPlane.setAttribute('visible', 'true');
          } else if (imagePlane) {
            imagePlane.setAttribute('geometry', `primitive: plane; width: ${w}; height: ${h}`);
            // Force-refresh texture so repeated 2D changes update reliably
            try {
              const THREE = AFRAME.THREE;
              const mesh = imagePlane.getObject3D('mesh');
              if (mesh && mesh.material) {
                const mat = mesh.material;
                if (mat.map && mat.map.dispose) { try { mat.map.dispose(); } catch(e){} }
                const tex = new THREE.Texture(imageAsset);
                if (THREE.SRGBColorSpace) { tex.colorSpace = THREE.SRGBColorSpace; }
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.generateMipmaps = false;
                // For standard 2D plane rendering, texture Y should be flipped
                tex.flipY = true;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.needsUpdate = true;
                mat.map = tex;
                mat.needsUpdate = true;
              } else {
                // Fallback to resetting material src which also triggers update
                imagePlane.setAttribute('material', 'src: #imageAsset; shader: flat; side: double');
              }
            } catch (_) {
              imagePlane.setAttribute('material', 'src: #imageAsset; shader: flat; side: double');
            }
            imagePlane.setAttribute('visible', 'true');
          }
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
