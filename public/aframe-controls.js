// A-Frame custom input components (module-friendly)
// - pinch-handler: pinch flick to rotate, tap-like pinch to toggle playback via event
// - controller-listener: thumbstick horizontal to rotate, trigger to toggle playback via event
(() => {
  if (!window.AFRAME) return;

  // Helper: resolve active target (sky or video/stereo sphere)
  function getActiveTarget(sceneEl) {
    const sky = sceneEl.querySelector('#sky');
    const vid = sceneEl.querySelector('#video-sphere');
    const vr180 = sceneEl.querySelector('#vr180-sphere');
    if (sky && sky.getAttribute('visible')) return sky;
    if (vid && vid.getAttribute('visible')) return vid;
    if (vr180 && vr180.getAttribute('visible')) return vr180;
    return sky || vid || vr180 || sceneEl; // safe fallback
  }

  // Helper: get currently visible 2D plane (stereo, video, or image) if any
  function getVisiblePlane(sceneEl) {
    const p1 = sceneEl.querySelector('#stereo-plane');
    const p2 = sceneEl.querySelector('#video-plane');
    const p3 = sceneEl.querySelector('#image-plane');
    if (p1 && p1.getAttribute('visible')) return p1;
    if (p2 && p2.getAttribute('visible')) return p2;
    if (p3 && p3.getAttribute('visible')) return p3;
    return null;
  }

  AFRAME.registerComponent('pinch-handler', {
    init: function() {
      this.startX = null;
      this.startY = null;
      this.flicked = false;
      this.sceneEl = this.el.sceneEl;

      this.onPinchStart = this.onPinchStart.bind(this);
      this.onPinchMove  = this.onPinchMove.bind(this);
      this.onPinchEnd   = this.onPinchEnd.bind(this);

      this.el.addEventListener('pinchstarted', this.onPinchStart);
      this.el.addEventListener('pinchmoved',   this.onPinchMove);
      this.el.addEventListener('pinchended',   this.onPinchEnd);
    },
    remove: function () {
      this.el.removeEventListener('pinchstarted', this.onPinchStart);
      this.el.removeEventListener('pinchmoved',   this.onPinchMove);
      this.el.removeEventListener('pinchended',   this.onPinchEnd);
    },
    onPinchStart: function(evt) {
      this.startX = evt.detail.position.x;
      this.startY = evt.detail.position.y;
      this.flicked = false;
    },
    onPinchMove: function(evt) {
      if (this.startX === null || this.startY === null) return;
      const currentX = evt.detail.position.x;
      const currentY = evt.detail.position.y;
      const deltaX = currentX - this.startX;
      const deltaY = currentY - this.startY;
      const horizThreshold = 0.1;
      const vertThreshold = 0.02;
      if (Math.abs(deltaX) > horizThreshold && Math.abs(deltaY) < vertThreshold) {
        const targetEl = getActiveTarget(this.sceneEl);
        const rotation = targetEl.getAttribute('rotation');
        rotation.y += (deltaX > 0 ? -30 : 30);
        targetEl.setAttribute('rotation', rotation);
        this.flicked = true;
        this.startX = currentX;
        this.startY = currentY;
      }
    },
    onPinchEnd: function() {
      if (this.startX === null) return;
      if (!this.flicked) {
        // delegate toggle to main logic
        this.sceneEl.emit('media:toggle');
      }
      this.startX = null;
    }
  });

  AFRAME.registerComponent('controller-listener', {
    init: function() {
      this.prevAxis = [0,0,0,0];
      this.sceneEl = this.el.sceneEl;
      this.onAxisMove = this.onAxisMove.bind(this);
      this.onTriggerDown = this.onTriggerDown.bind(this);
      this.el.addEventListener('axismove', this.onAxisMove);
      this.el.addEventListener('triggerdown', this.onTriggerDown);
    },
    remove: function () {
      this.el.removeEventListener('axismove', this.onAxisMove);
      this.el.removeEventListener('triggerdown', this.onTriggerDown);
    },
    onAxisMove: function(evt) {
      const axis = evt.detail.axis || [0,0,0,0];

      // When a 2D plane is visible, map stick: LR=uniform scale, UD=depth
      const planeEl = getVisiblePlane(this.sceneEl);
      if (planeEl) {
        // Axes: keep consistency with prior use (2: horizontal, 3: vertical)
        const h = axis[2] || 0; // left/right
        const v = axis[3] || 0; // up/down (up is negative on many controllers)

        // Deadzone to avoid jitter
        const dead = 0.05;

        // Uniform scale preserving aspect by changing geometry width/height
        if (Math.abs(h) > dead) {
          const geom = planeEl.getAttribute('geometry') || {};
          const w0 = Number(geom.width) || 1;
          const h0 = Number(geom.height) || 1;
          const aspect = (h0 !== 0) ? (w0 / h0) : 1;
          // scale speed per event; small to feel smooth
          const k = 0.03; // sensitivity
          const factor = 1 + h * k;
          // Propose new height from factor, then clamp height only and derive width to keep aspect
          let newH = h0 * factor;
          const MIN_H = 0.1;
          const MAX_H = 50;
          newH = Math.min(MAX_H, Math.max(MIN_H, newH));
          const newW = newH * aspect;
          planeEl.setAttribute('geometry', `primitive: plane; width: ${newW}; height: ${newH}`);
        }

        // Depth adjust: move along Z (scene uses +Z forward); up should push further
        if (Math.abs(v) > dead) {
          const pos = planeEl.getAttribute('position') || {x:0,y:0,z:0};
          const kz = 0.08; // depth sensitivity
          // Up is negative on many sticks; invert so up increases distance
          let newZ = Number(pos.z) + (-v) * kz;
          // Clamp distance from camera
          const MIN_Z = 0.2;
          const MAX_Z = 30;
          newZ = Math.min(MAX_Z, Math.max(MIN_Z, newZ));
          planeEl.setAttribute('position', { x: pos.x, y: pos.y, z: newZ });
        }

        this.prevAxis = [...axis];
        return; // handled in plane mode
      }

      // Default behavior for spherical targets: discrete yaw rotation on LR flicks
      const currX = axis[2];
      const prevX = this.prevAxis[2];
      const threshold = 0.9;
      if (prevX <= threshold && currX > threshold) {
        this.rotateBy(30);
      } else if (prevX >= -threshold && currX < -threshold) {
        this.rotateBy(-30);
      }
      this.prevAxis = [...axis];
    },
    rotateBy: function(deg) {
      const targetEl = getActiveTarget(this.sceneEl);
      const rotation = targetEl.getAttribute('rotation');
      targetEl.setAttribute('rotation', { x: rotation.x, y: rotation.y + deg, z: rotation.z });
    },
    onTriggerDown: function() {
      this.sceneEl.emit('media:toggle');
    }
  });
})();
