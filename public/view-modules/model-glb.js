const TARGET_SIZE = 0.5;
const MODEL_POSITION = '0 1.2 1';
const MODEL_ROTATION = '0 180 0';
const ORIENTATION_ROTATIONS = {
  front: MODEL_ROTATION,
  back: '0 0 0',
  left: '0 90 0',
  right: '0 -90 0'
};
const DEFAULT_ORIENTATION = 'front';

export function createView({ viewRoot }) {
  let modelEntity = null;
  let activeToken = 0;
  let tokenCounter = 0;
  let baseScale = 1;
  let externalScale = 1;
  let currentOrientationKey = DEFAULT_ORIENTATION;
  const hasOwn = Object.prototype.hasOwnProperty;

  const getThree = () => (window.AFRAME && window.AFRAME.THREE) ? window.AFRAME.THREE : null;

  const getRotationForOrientation = (key) => {
    const normalized = typeof key === 'string' ? key.trim().toLowerCase() : '';
    return ORIENTATION_ROTATIONS[normalized] || MODEL_ROTATION;
  };

  const applyTransforms = () => {
    if (!modelEntity) return;
    const finalScale = Math.max(0.000001, baseScale * externalScale);
    modelEntity.object3D.scale.set(finalScale, finalScale, finalScale);
    modelEntity.setAttribute('rotation', getRotationForOrientation(currentOrientationKey));
  };

  const updateFromParameters = (params = {}) => {
    if (hasOwn.call(params, 'modelScale')) {
      const rawScale = Number(params.modelScale);
      externalScale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
    }
    if (hasOwn.call(params, 'modelOrientation')) {
      const key = typeof params.modelOrientation === 'string'
        ? params.modelOrientation.trim().toLowerCase()
        : '';
      currentOrientationKey = ORIENTATION_ROTATIONS[key] ? key : DEFAULT_ORIENTATION;
    }
    applyTransforms();
  };

  const handleModelLoaded = (event) => {
    if (!modelEntity || event.target !== modelEntity) return;
    if (!activeToken || String(activeToken) !== event.target.dataset.loadToken) return;

    const THREE = getThree();
    const model = event.detail && event.detail.model;
    if (!(THREE && model)) {
      modelEntity.setAttribute('visible', 'true');
      return;
    }

    modelEntity.object3D.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
      modelEntity.setAttribute('visible', 'true');
      return;
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
      model.position.set(-center.x, -center.y, -center.z);
    } else {
      model.position.set(0, 0, 0);
    }

    const maxDim = Math.max(size.x, size.y, size.z);
    // Fit the model so the largest dimension becomes 0.5m.
    baseScale = maxDim > 0 ? TARGET_SIZE / maxDim : 1;
    applyTransforms();

    modelEntity.setAttribute('visible', 'true');
  };

  const handleModelError = (event) => {
    if (!modelEntity || event.target !== modelEntity) return;
    if (!activeToken || String(activeToken) !== event.target.dataset.loadToken) return;
    console.error('[model-glb] Failed to load model', event.detail && event.detail.error ? event.detail.error : event.detail);
    modelEntity.setAttribute('visible', 'false');
  };

  const ensureEntity = () => {
    if (!modelEntity) {
      const el = document.createElement('a-entity');
      el.id = 'glb-model-view';
      el.dataset.loadToken = '0';
      el.setAttribute('visible', 'false');
      el.setAttribute('position', MODEL_POSITION);
      el.setAttribute('rotation', getRotationForOrientation(currentOrientationKey));
      el.addEventListener('model-loaded', handleModelLoaded);
      el.addEventListener('model-error', handleModelError);
      viewRoot.appendChild(el);
      modelEntity = el;
    }
    return modelEntity;
  };

  return {
    async show({ src }) {
      const el = ensureEntity();
      const token = String(++tokenCounter);
      activeToken = Number(token);
      baseScale = 1;
      el.dataset.loadToken = token;
      el.setAttribute('visible', 'false');
      el.object3D.scale.set(1, 1, 1);
      applyTransforms();
      el.removeAttribute('gltf-model');
      if (src) {
        el.setAttribute('gltf-model', src);
      }
    },
    hide() {
      activeToken = 0;
      baseScale = 1;
      if (modelEntity) {
        modelEntity.removeAttribute('gltf-model');
        modelEntity.setAttribute('visible', 'false');
      }
    },
    handleParameters(params) {
      updateFromParameters(params || {});
    }
  };
}
