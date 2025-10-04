const BASE_HEIGHT = 3;
const PLANE_POSITION = '0 1.2 2.5';
const PLANE_ROTATION = '0 180 0';

export function createView({ viewRoot, imageAsset }) {
  let imagePlane = null;
  let onImageLoad = null;
  let lastTexture = null;

  const ensurePlane = () => {
    if (!imagePlane) {
      const el = document.createElement('a-entity');
      el.id = 'image-plane';
      el.setAttribute('geometry', 'primitive: plane; width: 3; height: 3');
      el.setAttribute('position', PLANE_POSITION);
      el.setAttribute('rotation', PLANE_ROTATION);
      el.setAttribute('visible', 'false');
      el.setAttribute('material', 'src: #imageAsset; shader: flat; side: double');
      viewRoot.appendChild(el);
      imagePlane = el;
    }
    return imagePlane;
  };

  const disposeTexture = () => {
    if (lastTexture && typeof lastTexture.dispose === 'function') {
      try { lastTexture.dispose(); } catch (err) { console.warn('[flat-image] Failed to dispose texture', err); }
    }
    lastTexture = null;
  };

  const refreshTexture = () => {
    const plane = ensurePlane();
    const mesh = plane.getObject3D('mesh');
    const THREE = (window.AFRAME && window.AFRAME.THREE) ? window.AFRAME.THREE : null;
    if (!(mesh && mesh.material && THREE)) {
      plane.setAttribute('material', 'src: #imageAsset; shader: flat; side: double');
      return;
    }

    disposeTexture();

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
    tex.needsUpdate = true;

    if (mesh.material.map && mesh.material.map !== tex && typeof mesh.material.map.dispose === 'function') {
      try { mesh.material.map.dispose(); } catch (err) { console.warn('[flat-image] Failed to dispose previous map', err); }
    }
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
    lastTexture = tex;
  };

  const updateSize = () => {
    if (!imageAsset) return;
    const iw = imageAsset.naturalWidth || 0;
    const ih = imageAsset.naturalHeight || 0;
    if (iw <= 0 || ih <= 0) return;
    const aspect = iw / ih;
    if (aspect <= 0) return;
    const width = BASE_HEIGHT * aspect;
    ensurePlane().setAttribute('geometry', `primitive: plane; width: ${width}; height: ${BASE_HEIGHT}`);
  };

  const applyImage = () => {
    updateSize();
    refreshTexture();
  };

  const detachHandler = () => {
    if (onImageLoad) {
      imageAsset.removeEventListener('load', onImageLoad);
      onImageLoad = null;
    }
  };

  return {
    async show() {
      const plane = ensurePlane();
      detachHandler();
      plane.setAttribute('visible', 'false');

      if (imageAsset.complete && imageAsset.naturalWidth > 0) {
        applyImage();
      } else {
        onImageLoad = () => {
          applyImage();
          imageAsset.removeEventListener('load', onImageLoad);
          onImageLoad = null;
        };
        imageAsset.addEventListener('load', onImageLoad);
      }

      plane.setAttribute('visible', 'true');
    },
    hide() {
      detachHandler();
      if (imagePlane) {
        imagePlane.setAttribute('visible', 'false');
      }
    }
  };
}
