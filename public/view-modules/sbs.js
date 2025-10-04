const BASE_HEIGHT = 3;
const PLANE_POSITION = '0 1.2 2.5';
const PLANE_ROTATION = '0 180 0';

export function createView({ viewRoot, videoAsset, imageAsset }) {
  let stereoPlane = null;
  let onVideoMetadata = null;
  let onImageLoad = null;

  const ensurePlane = () => {
    if (!stereoPlane) {
      const el = document.createElement('a-entity');
      el.id = 'stereo-plane';
      el.setAttribute('geometry', 'primitive: plane; width: 3; height: 3');
      el.setAttribute('position', PLANE_POSITION);
      el.setAttribute('rotation', PLANE_ROTATION);
      el.setAttribute('visible', 'false');
      el.setAttribute('stereo-sbs', 'monoEye: left; planeMode: true');
      viewRoot.appendChild(el);
      stereoPlane = el;
    }
    return stereoPlane;
  };

  const updateVideoSize = () => {
    if (!videoAsset) return;
    const vw = videoAsset.videoWidth || 0;
    const vh = videoAsset.videoHeight || 0;
    if (vw <= 0 || vh <= 0) return;
    const aspect = (vw / 2) / vh;
    if (aspect <= 0) return;
    const width = BASE_HEIGHT * aspect;
    ensurePlane().setAttribute('geometry', `primitive: plane; width: ${width}; height: ${BASE_HEIGHT}`);
  };

  const updateImageSize = () => {
    if (!imageAsset) return;
    const iw = imageAsset.naturalWidth || 0;
    const ih = imageAsset.naturalHeight || 0;
    if (iw <= 0 || ih <= 0) return;
    const aspect = (iw / 2) / ih;
    if (aspect <= 0) return;
    const width = BASE_HEIGHT * aspect;
    ensurePlane().setAttribute('geometry', `primitive: plane; width: ${width}; height: ${BASE_HEIGHT}`);
  };

  const detachHandlers = () => {
    if (onVideoMetadata) {
      videoAsset.removeEventListener('loadedmetadata', onVideoMetadata);
      onVideoMetadata = null;
    }
    if (onImageLoad) {
      imageAsset.removeEventListener('load', onImageLoad);
      onImageLoad = null;
    }
  };

  return {
    async show({ isVideo }) {
      const plane = ensurePlane();
      detachHandlers();
      plane.setAttribute('visible', 'false');

      if (isVideo) {
        plane.setAttribute('stereo-sbs', 'src: #videoAsset; monoEye: left; planeMode: true');
        updateVideoSize();
        onVideoMetadata = () => { updateVideoSize(); };
        videoAsset.addEventListener('loadedmetadata', onVideoMetadata);
      } else {
        plane.setAttribute('stereo-sbs', 'src: #imageAsset; monoEye: left; planeMode: true');
        if (imageAsset.complete && imageAsset.naturalWidth > 0) {
          updateImageSize();
        } else {
          onImageLoad = () => {
            updateImageSize();
            imageAsset.removeEventListener('load', onImageLoad);
            onImageLoad = null;
          };
          imageAsset.addEventListener('load', onImageLoad);
        }
      }

      plane.setAttribute('visible', 'true');
    },
    hide() {
      detachHandlers();
      if (stereoPlane) {
        stereoPlane.setAttribute('visible', 'false');
      }
    }
  };
}
