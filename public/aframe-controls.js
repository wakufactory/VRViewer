// A-Frame custom input components (module-friendly)
// - pinch-handler: pinch flick to rotate, tap-like pinch to toggle playback via event
// - controller-listener: thumbstick horizontal to rotate, trigger to toggle playback via event
(() => {
  if (!window.AFRAME) return;

  // Helper: resolve active target (sky or video/stereo sphere)
  function getActiveTarget(sceneEl) {
    const sky = sceneEl.querySelector('#sky');
    const vid = sceneEl.querySelector('#video-sphere');
    const st  = sceneEl.querySelector('#stereo-sphere');
    return sky.getAttribute('visible') ? sky : (vid.getAttribute('visible') ? vid : st);
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
      const axis = evt.detail.axis;
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

