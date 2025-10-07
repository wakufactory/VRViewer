const TARGET_SIZE = 0.5;
const MODEL_POSITION = '0 1.2 1';
const MODEL_ROTATION = '0 180 0';

export function createView({ viewRoot }) {
  let modelEntity = null;
  let activeToken = 0;
  let tokenCounter = 0;

  const getThree = () => (window.AFRAME && window.AFRAME.THREE) ? window.AFRAME.THREE : null;

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
    const scaleFactor = maxDim > 0 ? TARGET_SIZE / maxDim : 1;
    modelEntity.object3D.scale.set(scaleFactor, scaleFactor, scaleFactor);

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
      el.setAttribute('rotation', MODEL_ROTATION);
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
      el.dataset.loadToken = token;
      el.setAttribute('visible', 'false');
      el.object3D.scale.set(1, 1, 1);
      el.removeAttribute('gltf-model');
      if (src) {
        el.setAttribute('gltf-model', src);
      }
    },
    hide() {
      activeToken = 0;
      if (modelEntity) {
        modelEntity.removeAttribute('gltf-model');
        modelEntity.setAttribute('visible', 'false');
      }
    }
  };
}
