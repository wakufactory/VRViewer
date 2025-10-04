const VR180_GEOMETRY = [
  'primitive: sphere',
  'radius: 20',
  'segmentsWidth: 100',
  'segmentsHeight: 50',
  'phiStart: 0',
  'phiLength: 180',
  'thetaStart: 0',
  'thetaLength: 180'
].join('; ');

export function createView({ viewRoot }) {
  let vr180Sphere = null;

  const ensureSphere = () => {
    if (!vr180Sphere) {
      const el = document.createElement('a-entity');
      el.id = 'vr180-sphere';
      el.setAttribute('geometry', VR180_GEOMETRY);
      el.setAttribute('position', '0 0 0');
      el.setAttribute('rotation', '0 0 0');
      el.setAttribute('scale', '1 -1 1');
      el.setAttribute('visible', 'false');
      el.setAttribute('stereo-sbs', 'monoEye: left; insideSphere: true');
      viewRoot.appendChild(el);
      vr180Sphere = el;
    }
    return vr180Sphere;
  };

  const updateSource = (isVideo) => {
    const sphere = ensureSphere();
    const src = isVideo ? '#videoAsset' : '#imageAsset';
    sphere.setAttribute('stereo-sbs', `src: ${src}; monoEye: left; insideSphere: true`);
  };

  return {
    async show({ isVideo }) {
      const sphere = ensureSphere();
      updateSource(isVideo);
      sphere.setAttribute('visible', 'true');
    },
    hide() {
      if (vr180Sphere) {
        vr180Sphere.setAttribute('visible', 'false');
      }
    }
  };
}
