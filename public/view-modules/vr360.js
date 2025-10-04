const SKY_SEGMENTS_HEIGHT = 50;
const SKY_SEGMENTS_WIDTH = 100;
const TARGET_ASPECT = 2; // 360 imagery expects 2:1 aspect

export function createView({ viewRoot, imageAsset }) {
  let skyEl = null;
  let videoSphereEl = null;
  let pendingImageHandler = null;
  let lastSkyTexture = null;

  const ensureSky = () => {
    if (!skyEl) {
      const el = document.createElement('a-sky');
      el.id = 'sky';
      el.setAttribute('segments-height', String(SKY_SEGMENTS_HEIGHT));
      el.setAttribute('segments-width', String(SKY_SEGMENTS_WIDTH));
      el.setAttribute('visible', 'false');
      el.setAttribute('src', '#imageAsset');
      viewRoot.appendChild(el);
      skyEl = el;
    }
    return skyEl;
  };

  const ensureVideoSphere = () => {
    if (!videoSphereEl) {
      const el = document.createElement('a-videosphere');
      el.id = 'video-sphere';
      el.setAttribute('loop', 'true');
      el.setAttribute('visible', 'false');
      el.setAttribute('src', '#videoAsset');
      viewRoot.appendChild(el);
      videoSphereEl = el;
    }
    return videoSphereEl;
  };

  const disposeSkyTexture = () => {
    if (lastSkyTexture && typeof lastSkyTexture.dispose === 'function') {
      try { lastSkyTexture.dispose(); } catch (err) { console.warn('[vr360] Failed to dispose texture', err); }
    }
    lastSkyTexture = null;
  };

  const applySkyTexture = () => {
    const sky = ensureSky();
    sky.setAttribute('src', '#imageAsset');

    const updateTexture = () => {
      const mesh = sky.getObject3D('mesh');
      if (!(mesh && mesh.material)) return false;
      const THREE = (window.AFRAME && window.AFRAME.THREE) ? window.AFRAME.THREE : null;
      if (!THREE) return false;

      disposeSkyTexture();

      const tex = new THREE.Texture(imageAsset);
      if (THREE.SRGBColorSpace) {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.flipY = true;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      const iw = imageAsset.naturalWidth || (tex.image && tex.image.width) || 0;
      const ih = imageAsset.naturalHeight || (tex.image && tex.image.height) || 1;
      const aspect = ih === 0 ? TARGET_ASPECT : iw / ih;
      let rx = 1;
      let ry = 1;
      let ox = 0;
      let oy = 0;
      if (aspect > TARGET_ASPECT) {
        rx = TARGET_ASPECT / aspect;
        ox = (1 - rx) / 2;
      } else if (aspect < TARGET_ASPECT) {
        ry = aspect / TARGET_ASPECT;
        oy = (1 - ry) / 2;
      }
      tex.repeat.set(rx, ry);
      tex.offset.set(ox, oy);
      tex.needsUpdate = true;

      if (mesh.material.map && mesh.material.map !== tex && typeof mesh.material.map.dispose === 'function') {
        try { mesh.material.map.dispose(); } catch (err) { console.warn('[vr360] Failed to dispose previous map', err); }
      }
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
      lastSkyTexture = tex;
      return true;
    };

    if (!updateTexture()) {
      const onReady = () => {
        sky.removeEventListener('materialtextureloaded', onReady);
        updateTexture();
      };
      sky.addEventListener('materialtextureloaded', onReady, { once: true });
    }
  };

  const showImage = () => {
    applySkyTexture();
    const sky = ensureSky();
    sky.setAttribute('visible', 'true');
  };

  const showVideo = () => {
    const sphere = ensureVideoSphere();
    sphere.setAttribute('src', '#videoAsset');
    sphere.setAttribute('visible', 'true');
  };

  return {
    async show({ isVideo }) {
      const sky = ensureSky();
      const sphere = ensureVideoSphere();
      sky.setAttribute('visible', 'false');
      sphere.setAttribute('visible', 'false');

      if (pendingImageHandler) {
        imageAsset.removeEventListener('load', pendingImageHandler);
        pendingImageHandler = null;
      }

      if (isVideo) {
        showVideo();
        return;
      }

      if (imageAsset.complete && imageAsset.naturalWidth > 0) {
        showImage();
        return;
      }

      pendingImageHandler = () => {
        pendingImageHandler = null;
        showImage();
      };
      imageAsset.addEventListener('load', pendingImageHandler, { once: true });
    },
    hide() {
      if (pendingImageHandler) {
        imageAsset.removeEventListener('load', pendingImageHandler);
        pendingImageHandler = null;
      }
      if (skyEl) skyEl.setAttribute('visible', 'false');
      if (videoSphereEl) videoSphereEl.setAttribute('visible', 'false');
    }
  };
}
