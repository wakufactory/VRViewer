const DEBUG_PIVOT_WIREFRAME = true; // pivot領域のワイヤーフレーム描画を有効化
const DEBUG_PIVOT_COLOR = '#ffffff'; // pivot領域ワイヤーフレームの色指定
const TARGET_SIZE = 0.5; // バウンディングボックスの最大辺をこのサイズに揃える
const MODEL_POSITION = '0 1.2 1'; // モデルアンカー（固定位置）の配置座標
const MODEL_BASE_ROTATION_Y = 180; // A-Frameの座標系に合わせるための初期Y回転
const DEFAULT_ROTATE_Y = 0;
const POSITION_OFFSET_MIN = -1.5;
const POSITION_OFFSET_MAX = 1.5;

export function createView({ viewRoot }) {
  let modelEntity = null; // ビュー内で保持するアンカー
  let transformContainer = null; // モデルを回転・スケールするpivotノード
  let meshEntity = null; // glTFデータをロードする実体
  let pivotDebugEntity = null; // pivot領域可視化用
  let pivotDebugMesh = null;
  let activeToken = 0;
  let tokenCounter = 0;
  let baseScale = 1;
  let externalScale = 1;
  let currentRotateY = DEFAULT_ROTATE_Y;
  const baseAnchorPosition = (() => {
    if (typeof MODEL_POSITION !== 'string') {
      return { x: 0, y: 0, z: 0 };
    }
    const parts = MODEL_POSITION.trim().split(/\s+/);
    const [rawX = '0', rawY = '0', rawZ = '0'] = parts;
    const toNumber = (value) => {
      const numeric = Number.parseFloat(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };
    return {
      x: toNumber(rawX),
      y: toNumber(rawY),
      z: toNumber(rawZ)
    };
  })();
  const positionOffsets = { x: 0, y: 0, z: 0 };
  let lastAppliedPositionKey = null;

  // A-Frameが内部で利用しているTHREEインスタンスを参照
  const getThree = () => (window.AFRAME && window.AFRAME.THREE) ? window.AFRAME.THREE : null;

  // 任意の角度を0〜360の範囲に正規化する
  const normalizedAngle = (value) => {
    if (!Number.isFinite(value)) return DEFAULT_ROTATE_Y;
    const mod = value % 360;
    return mod < 0 ? mod + 360 : mod;
  };

  const ZERO_VECTOR = '0 0 0';
  const UNIT_VECTOR = '1 1 1';

  const clampPositionOffset = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(Math.max(numeric, POSITION_OFFSET_MIN), POSITION_OFFSET_MAX);
  };

  const roundToPrecision = (value, precision = 4) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const factor = Math.pow(10, precision);
    return Math.round(numeric * factor) / factor;
  };

  const buildPositionKey = ({ x, y, z }) => `${x} ${y} ${z}`;

  const computeCombinedPosition = () => ({
    x: baseAnchorPosition.x + positionOffsets.x,
    y: baseAnchorPosition.y + positionOffsets.y,
    z: baseAnchorPosition.z + positionOffsets.z
  });

  const updateModelPosition = () => {
    if (!modelEntity) {
      lastAppliedPositionKey = null;
      return;
    }
    const combined = computeCombinedPosition();
    const rounded = {
      x: roundToPrecision(combined.x),
      y: roundToPrecision(combined.y),
      z: roundToPrecision(combined.z)
    };
    const positionKey = buildPositionKey(rounded);
    if (lastAppliedPositionKey === positionKey) {
      return;
    }
    modelEntity.setAttribute('position', positionKey);
    if (modelEntity.object3D) {
      modelEntity.object3D.position.set(rounded.x, rounded.y, rounded.z);
    }
    lastAppliedPositionKey = positionKey;
  };

  const resetEntityTransform = (entity) => {
    if (!entity) return;
    entity.setAttribute('position', ZERO_VECTOR);
    entity.setAttribute('rotation', ZERO_VECTOR);
    entity.setAttribute('scale', UNIT_VECTOR);
    const object3D = entity.object3D;
    if (!object3D) return;
    object3D.position.set(0, 0, 0);
    object3D.rotation.set(0, 0, 0);
    object3D.scale.set(1, 1, 1);
  };

  const computeBoundingBox = (object, referenceEntity = null) => {
    const THREE = getThree();
    if (!THREE || !object) return null;
    const box = new THREE.Box3();
    if (typeof object.updateMatrixWorld === 'function') {
      object.updateMatrixWorld(true);
    }
    const result = box.setFromObject(object);
    if (!referenceEntity) {
      return result;
    }
    const referenceObject3D = referenceEntity.object3D || referenceEntity;
    if (!referenceObject3D) {
      return result;
    }
    if (typeof referenceObject3D.updateMatrixWorld === 'function') {
      referenceObject3D.updateMatrixWorld(true);
    }
    if (!referenceObject3D.matrixWorld) {
      return result;
    }
    const inverseMatrix = new THREE.Matrix4();
    if (typeof inverseMatrix.copy === 'function') {
      inverseMatrix.copy(referenceObject3D.matrixWorld);
    } else {
      return result;
    }
    if (typeof inverseMatrix.invert === 'function') {
      inverseMatrix.invert();
    } else if (typeof inverseMatrix.getInverse === 'function') {
      inverseMatrix.getInverse(referenceObject3D.matrixWorld);
    } else {
      return result;
    }
    return result.applyMatrix4(inverseMatrix);
  };

  const getDebugColor = (THREE) => {
    if (!THREE) return null;
    if (typeof DEBUG_PIVOT_COLOR === 'string') {
      const trimmed = DEBUG_PIVOT_COLOR.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return new THREE.Color(trimmed);
      }
    }
    try {
      return new THREE.Color(DEBUG_PIVOT_COLOR);
    } catch (error) {
      console.warn('[model-glb] Invalid DEBUG_PIVOT_COLOR, fallback to default', DEBUG_PIVOT_COLOR, error);
      return new THREE.Color('#00ffff');
    }
  };

  const resetPivotDebug = () => {
    if (!DEBUG_PIVOT_WIREFRAME || !pivotDebugEntity) return;
    pivotDebugEntity.setAttribute('visible', 'false');
    const object3D = pivotDebugEntity.object3D;
    if (object3D) {
      object3D.position.set(0, 0, 0);
      object3D.rotation.set(0, 0, 0);
    }
    if (pivotDebugMesh) {
      disposePivotDebugMesh();
    }
  };

  const disposePivotDebugMesh = () => {
    if (!pivotDebugMesh || !pivotDebugEntity) return;
    const object3D = pivotDebugEntity.object3D;
    if (object3D && pivotDebugMesh.parent === object3D) {
      object3D.remove(pivotDebugMesh);
    }
    if (pivotDebugMesh.geometry) {
      pivotDebugMesh.geometry.dispose();
    }
    if (Array.isArray(pivotDebugMesh.material)) {
      pivotDebugMesh.material.forEach((material) => material.dispose?.());
    } else {
      pivotDebugMesh.material?.dispose?.();
    }
    pivotDebugMesh = null;
  };

  const updatePivotDebug = (box) => {
    if (!DEBUG_PIVOT_WIREFRAME || !pivotDebugEntity || !box || !box.isBox3) return;
    const THREE = getThree();
    if (!THREE) return;

    const safeBox = box.clone();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    safeBox.getSize(size);
    safeBox.getCenter(center);
    size.set(
      Math.max(0.0001, size.x || 0),
      Math.max(0.0001, size.y || 0),
      Math.max(0.0001, size.z || 0)
    );
    safeBox.setFromCenterAndSize(center, size);

    if (pivotDebugMesh) {
      disposePivotDebugMesh();
    }

    const debugColor = getDebugColor(THREE) || new THREE.Color('#00ffff');
    pivotDebugMesh = new THREE.Box3Helper(safeBox, debugColor);
    if (pivotDebugMesh.material) {
      pivotDebugMesh.material.transparent = true;
      pivotDebugMesh.material.opacity = 0.4;
      pivotDebugMesh.material.depthTest = false;
    }
    pivotDebugEntity.object3D.add(pivotDebugMesh);
    pivotDebugMesh.visible = true;
    pivotDebugEntity.setAttribute('visible', 'true');
  };

  // モデル関連エンティティをまとめて表示・非表示
  const setVisibility = (visible) => {
    const value = visible ? 'true' : 'false';
    if (modelEntity) modelEntity.setAttribute('visible', value);
    if (transformContainer) transformContainer.setAttribute('visible', value);
    if (meshEntity) meshEntity.setAttribute('visible', value);
    if (DEBUG_PIVOT_WIREFRAME && pivotDebugEntity) {
      pivotDebugEntity.setAttribute('visible', value);
      if (pivotDebugMesh) {
        pivotDebugMesh.visible = visible;
      }
    }
  };

  // pivotノードに対してスケールと回転を適用（モデル中心基準）
  const applyTransforms = () => {
    if (!transformContainer) return;
    const finalScale = Math.max(0.000001, baseScale * externalScale);
    const scaleText = `${finalScale} ${finalScale} ${finalScale}`;
    transformContainer.setAttribute('scale', scaleText);
    if (transformContainer.object3D) {
      transformContainer.object3D.scale.set(finalScale, finalScale, finalScale);
    }
    const totalY = normalizedAngle(MODEL_BASE_ROTATION_Y + currentRotateY);
    transformContainer.setAttribute('rotation', `0 ${totalY} 0`);
  };

  // パラメータストアからの更新を反映
  const updateFromParameters = (params = {}) => {
    const { modelScale, rotateY, posX, posY, posZ } = params;
    let positionChanged = false;

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
    const offsetMap = [
      { key: 'x', value: posX },
      { key: 'y', value: posY },
      { key: 'z', value: posZ }
    ];
    offsetMap.forEach(({ key, value }) => {
      if (value === undefined) return;
      const clamped = clampPositionOffset(value);
      if (positionOffsets[key] !== clamped) {
        positionOffsets[key] = clamped;
        positionChanged = true;
      }
    });
    if (positionChanged) {
      updateModelPosition();
    }
    applyTransforms();
  };

  // glTFモデルが読み込まれた際に一度中心化・スケールを算出する
  const handleModelLoaded = (event) => {
    if (!meshEntity || event.target !== meshEntity) return;
    if (!activeToken || String(activeToken) !== meshEntity.dataset.loadToken) return;

    const THREE = getThree();
    const model = event.detail && event.detail.model;
    if (!(THREE && model)) {
      setVisibility(true);
      return;
    }

    resetEntityTransform(transformContainer);
    resetEntityTransform(meshEntity);
    resetPivotDebug();

    const box = computeBoundingBox(model, meshEntity); // モデル全体の外接立方体を算出（アンカーの平行移動を除外）
    console.log('[model-glb] Model loaded', box);
    if (!box || box.isEmpty()) {
      setVisibility(true);
      return;
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
      // 中心座標を原点に一致させることで pivot 回転・スケールをモデル中心基準にする
      model.position.set(-center.x, -center.y, -center.z);
    } else {
      model.position.set(0, 0, 0);
    }

    const normalizedBox = computeBoundingBox(model, meshEntity) || box;
    normalizedBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    // モデル最大辺が TARGET_SIZE になる係数を算出し pivot に適用
    baseScale = maxDim > 0 ? TARGET_SIZE / maxDim : 1;
    updatePivotDebug(normalizedBox);
    applyTransforms();

    setVisibility(true);
  };

  const handleModelError = (event) => {
    if (!meshEntity || event.target !== meshEntity) return;
    if (!activeToken || String(activeToken) !== meshEntity.dataset.loadToken) return;
    console.error('[model-glb] Failed to load model', event.detail && event.detail.error ? event.detail.error : event.detail);
    setVisibility(false);
  };

  // ビューア初期化時に必要なa-entityを生成
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

      if (DEBUG_PIVOT_WIREFRAME) {
        pivotDebugEntity = document.createElement('a-entity');
        pivotDebugEntity.id = 'glb-model-pivot-debug';
        pivotDebugEntity.setAttribute('visible', 'false');
        transformContainer.appendChild(pivotDebugEntity);
      }

      meshEntity = document.createElement('a-entity');
      meshEntity.id = 'glb-model-mesh';
      meshEntity.dataset.loadToken = '0';
      meshEntity.setAttribute('visible', 'false');
      meshEntity.addEventListener('model-loaded', handleModelLoaded);
      meshEntity.addEventListener('model-error', handleModelError);
      transformContainer.appendChild(meshEntity);

      applyTransforms();
    }
    updateModelPosition();
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
        resetEntityTransform(mesh);
      }
      // 新しい読み込みが完了するまで一旦非表示にする
      setVisibility(false);
      resetEntityTransform(transformContainer);
      resetPivotDebug();
      applyTransforms();
      updateModelPosition();
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
      // 差し替え時に視界から消す
      setVisibility(false);
    },
    handleParameters(params) {
      updateFromParameters(params || {});
    }
  };
}
