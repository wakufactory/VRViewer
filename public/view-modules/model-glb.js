const TARGET_SIZE = 0.5;
const MODEL_POSITION = '0 1.2 1';
const MODEL_BASE_ROTATION_Y = 180;
const DEFAULT_ROTATE_Y = 0;

export function createView({ viewRoot }) {
  let modelEntity = null;
  let transformContainer = null;
  let meshEntity = null;
  let activeToken = 0;
  let tokenCounter = 0;
  let baseScale = 1;
  let externalScale = 1;
  let currentRotateY = DEFAULT_ROTATE_Y;

  const getThree = () => (window.AFRAME && window.AFRAME.THREE) ? window.AFRAME.THREE : null;

  const normalizedAngle = (value) => {
    if (!Number.isFinite(value)) return DEFAULT_ROTATE_Y;
    const mod = value % 360;
    return mod < 0 ? mod + 360 : mod;
  };

  const setVisibility = (visible) => {
    const value = visible ? 'true' : 'false';
    if (modelEntity) modelEntity.setAttribute('visible', value);
    if (transformContainer) transformContainer.setAttribute('visible', value);
    if (meshEntity) meshEntity.setAttribute('visible', value);
  };

  const applyTransforms = () => {
    if (!transformContainer || !transformContainer.object3D) return;
    const finalScale = Math.max(0.000001, baseScale * externalScale);
    transformContainer.object3D.scale.set(finalScale, finalScale, finalScale);
    transformContainer.setAttribute('scale', `${finalScale} ${finalScale} ${finalScale}`);
    const totalY = normalizedAngle(MODEL_BASE_ROTATION_Y + currentRotateY);
    transformContainer.setAttribute('rotation', `0 ${totalY} 0`);
  };

  const updateFromParameters = (params = {}) => {
    const { modelScale, rotateY } = params;

    if (modelScale !== undefined) {
      const rawScale = Number(modelScale);
      externalScale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
    }

    if (rotateY !== undefined) {
      const value = Number(rotateY);
      if (Number.isFinite(value)) {
        currentRotateY = normalizedAngle(value);
      }
    }
    applyTransforms();
  };

  const handleModelLoaded = (event) => {
    if (!meshEntity || event.target !== meshEntity) return;
    if (!activeToken || String(activeToken) !== meshEntity.dataset.loadToken) return;

    const THREE = getThree();
    const model = event.detail && event.detail.model;
    if (!(THREE && model)) {
      setVisibility(true);
      return;
    }

    const pivotObject = transformContainer && transformContainer.object3D;
    if (pivotObject) {
      pivotObject.scale.set(1, 1, 1);
      pivotObject.position.set(0, 0, 0);
      pivotObject.rotation.set(0, 0, 0);
      transformContainer.setAttribute('scale', '1 1 1');
      transformContainer.setAttribute('position', '0 0 0');
      transformContainer.setAttribute('rotation', '0 0 0');
    }

    if (meshEntity && meshEntity.object3D) {
      meshEntity.object3D.position.set(0, 0, 0);
    }
    if (meshEntity) {
      meshEntity.setAttribute('position', '0 0 0');
      meshEntity.setAttribute('rotation', '0 0 0');
      meshEntity.setAttribute('scale', '1 1 1');
    }

    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) {
      setVisibility(true);
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
    baseScale = maxDim > 0 ? TARGET_SIZE / maxDim : 1;
    applyTransforms();

    setVisibility(true);
  };

  const handleModelError = (event) => {
    if (!meshEntity || event.target !== meshEntity) return;
    if (!activeToken || String(activeToken) !== meshEntity.dataset.loadToken) return;
    console.error('[model-glb] Failed to load model', event.detail && event.detail.error ? event.detail.error : event.detail);
    setVisibility(false);
  };

  const ensureEntity = () => {
    if (!modelEntity) {
      modelEntity = document.createElement('a-entity');
      modelEntity.id = 'glb-model-view';
      modelEntity.setAttribute('visible', 'false');
      modelEntity.setAttribute('position', MODEL_POSITION);
      modelEntity.setAttribute('rotation', '0 0 0');
      viewRoot.appendChild(modelEntity);

      transformContainer = document.createElement('a-entity');
      transformContainer.id = 'glb-model-transform';
      transformContainer.setAttribute('visible', 'false');
      modelEntity.appendChild(transformContainer);

      meshEntity = document.createElement('a-entity');
      meshEntity.id = 'glb-model-mesh';
      meshEntity.dataset.loadToken = '0';
      meshEntity.setAttribute('visible', 'false');
      meshEntity.addEventListener('model-loaded', handleModelLoaded);
      meshEntity.addEventListener('model-error', handleModelError);
      transformContainer.appendChild(meshEntity);

      applyTransforms();
    }
    return { anchor: modelEntity, mesh: meshEntity };
  };

  return {
    async show({ src }) {
      const { mesh } = ensureEntity();
      const token = String(++tokenCounter);
      activeToken = Number(token);
      baseScale = 1;
      externalScale = 1;
      if (mesh) {
        mesh.dataset.loadToken = token;
        mesh.setAttribute('position', '0 0 0');
        mesh.setAttribute('rotation', '0 0 0');
        mesh.setAttribute('scale', '1 1 1');
      }
      setVisibility(false);
      if (transformContainer && transformContainer.object3D) {
        transformContainer.object3D.scale.set(1, 1, 1);
        transformContainer.object3D.position.set(0, 0, 0);
        transformContainer.object3D.rotation.set(0, 0, 0);
        transformContainer.setAttribute('scale', '1 1 1');
        transformContainer.setAttribute('position', '0 0 0');
        transformContainer.setAttribute('rotation', '0 0 0');
      }
      applyTransforms();
      mesh?.removeAttribute('gltf-model');
      if (src) {
        mesh?.setAttribute('gltf-model', src);
      }
    },
    hide() {
      activeToken = 0;
      baseScale = 1;
      if (meshEntity) {
        meshEntity.removeAttribute('gltf-model');
        meshEntity.dataset.loadToken = '0';
      }
      setVisibility(false);
    },
    handleParameters(params) {
      updateFromParameters(params || {});
    }
  };
}
