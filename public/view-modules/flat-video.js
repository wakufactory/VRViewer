const BASE_HEIGHT = 3;
const PLANE_POSITION = '0 1.2 2.5';
const PLANE_ROTATION = '0 180 0';

export function createView({ viewRoot, videoAsset }) {
  let videoPlane = null;
  let onMetadata = null;

  const ensurePlane = () => {
    if (!videoPlane) {
      const el = document.createElement('a-entity');
      el.id = 'video-plane';
      el.setAttribute('geometry', 'primitive: plane; width: 3; height: 3');
      el.setAttribute('position', PLANE_POSITION);
      el.setAttribute('rotation', PLANE_ROTATION);
      el.setAttribute('visible', 'false');
      el.setAttribute('material', 'src: #videoAsset; shader: flat; side: double');
      viewRoot.appendChild(el);
      videoPlane = el;
    }
    return videoPlane;
  };

  const updateSize = () => {
    if (!videoAsset) return;
    const vw = videoAsset.videoWidth || 0;
    const vh = videoAsset.videoHeight || 0;
    if (vw <= 0 || vh <= 0) return;
    const aspect = vw / vh;
    if (aspect <= 0) return;
    const width = BASE_HEIGHT * aspect;
    ensurePlane().setAttribute('geometry', `primitive: plane; width: ${width}; height: ${BASE_HEIGHT}`);
  };

  const detachHandlers = () => {
    if (onMetadata) {
      videoAsset.removeEventListener('loadedmetadata', onMetadata);
      onMetadata = null;
    }
  };

  return {
    async show() {
      const plane = ensurePlane();
      detachHandlers();
      plane.setAttribute('visible', 'false');
      plane.setAttribute('material', 'src: #videoAsset; shader: flat; side: double');
      updateSize();
      onMetadata = () => { updateSize(); };
      videoAsset.addEventListener('loadedmetadata', onMetadata);
      plane.setAttribute('visible', 'true');
    },
    hide() {
      detachHandlers();
      if (videoPlane) {
        videoPlane.setAttribute('visible', 'false');
      }
    }
  };
}
