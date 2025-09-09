// A-Frame component: stereo-sbs
// Renders a side-by-side (SBS) stereo source to left/right eyes.
// Accepts an <img> or <video> element via `src` (selector).
// In mono (non-XR), shows `monoEye` side.
(function(){
  if (!window.AFRAME) return;
  AFRAME.registerComponent('stereo-sbs', {
    schema: {
      src: { type: 'selector' },
      monoEye: { type: 'string', default: 'left' }, // 'left' or 'right'
      halfTurn: { type: 'boolean', default: false }, // reserved; not used after refactor
      planeMode: { type: 'boolean', default: false }, // flat plane mode
      insideSphere: { type: 'boolean', default: false } // true when texture is viewed from sphere inside (VR180/VR360)
    },
    init: function () {
      const THREE = AFRAME.THREE;
      this.mediaEl = this.data.src || null;
      this.disposeFns = [];

      this.shader = null;
      this.currentTexture = null;
      // Build MeshBasicMaterial; keep Three.js standard sampling/color pipeline
      this.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      this.material.onBeforeCompile = (shader) => {
        this.shader = shader; // not strictly required now, but kept for potential future tweaks
      };

      this.applyMaterial = () => {
        const mesh = this.el.getObject3D('mesh');
        if (!mesh) return;
        mesh.traverse((obj) => {
          if (obj.isMesh) {
            obj.material = this.material;
            obj.onBeforeRender = (renderer, scene, camera) => {
              let eye = 2; // mono default
              const vp = camera && camera.viewport;
              if (vp && typeof vp.x === 'number') {
                // When XR presents both eyes with different viewports,
                // right eye often has vp.x > 0.
                eye = (vp.x > 0) ? 1 : 0;
              } else if (!(renderer && renderer.xr && renderer.xr.isPresenting)) {
                // Non-XR: follow monoEye
                eye = (this.data.monoEye === 'right') ? 1 : 0;
              }
              // Adjust texture transform to pick left/right half via repeat/offset.
              const mat = obj.material;
              const tex = mat && mat.map;
              if (tex) {
                // Decide repeat sign by viewing context
                const useNegRepeat = (!this.data.planeMode) && this.data.insideSphere;
                const targetRepeat = useNegRepeat ? -0.5 : 0.5;
                if (tex.repeat.x !== targetRepeat) tex.repeat.x = targetRepeat;
                // SBS: select half via offset.x (keep halves same; only mirror when insideSphere)
                const targetOffset = useNegRepeat
                  ? ((eye === 1) ? 1.0 : 0.5) // right: [1.0..0.5], left: [0.5..0.0]
                  : ((eye === 1) ? 0.5 : 0.0);
                if (tex.offset.x !== targetOffset) tex.offset.x = targetOffset;
                // Note: changing offset/repeat updates UV transform uniform; no GPU re-upload needed.
              }
            };
          }
        });
      };

      this.makeTextureFromEl = (el) => {
        if (!el) return null;
        const THREE = AFRAME.THREE;
        if (el.tagName && el.tagName.toLowerCase() === 'video') {
          const tex = new THREE.VideoTexture(el);
          if (THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
          } else if (THREE.sRGBEncoding) {
            tex.encoding = THREE.sRGBEncoding;
          }
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          // Use standard color/UV pipeline; for planes keep upright, for spheres A-Frame mapping expects flipY=false
          tex.flipY = this.data.planeMode ? true : false;
          tex.needsUpdate = true;
          // VideoTexture updates automatically as the video plays
          return tex;
        } else {
          const tex = new THREE.Texture(el);
          if (THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
          } else if (THREE.sRGBEncoding) {
            // Fallback for older three.js versions used by some A-Frame builds
            tex.encoding = THREE.sRGBEncoding;
          }
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          // Use standard color/UV pipeline; for planes keep upright, for spheres A-Frame mapping expects flipY=false
          tex.flipY = this.data.planeMode ? true : false;
          tex.needsUpdate = true;
          return tex;
        }
      };

      this.setTextureFromMedia = (el) => {
        if (!el) return;
        // Dispose old texture if any
        if (this.currentTexture && this.currentTexture.dispose) {
          try { this.currentTexture.dispose(); } catch(e){}
        }
        const tex = this.makeTextureFromEl(el);
        // Initialize SBS transform once; per-eye offset is adjusted on render
        if (tex) {
          const useNegRepeat = (!this.data.planeMode) && this.data.insideSphere;
          tex.repeat.x = useNegRepeat ? -0.5 : 0.5;
          // Initial mono view according to monoEye; keep half, mirror only if inside sphere
          tex.offset.x = useNegRepeat
            ? ((this.data.monoEye === 'right') ? 1.0 : 0.5)
            : ((this.data.monoEye === 'right') ? 0.5 : 0.0);
        }
        this.currentTexture = tex;
        if (this.material) {
          this.material.map = tex;
          this.material.needsUpdate = true;
        }
      };

      // Listen for changes on <img> element's content
      this.attachImageListener = (img) => {
        if (!img || img.tagName.toLowerCase() !== 'img') return;
        const onLoad = () => this.setTextureFromMedia(img);
        img.addEventListener('load', onLoad);
        this.disposeFns.push(() => img.removeEventListener('load', onLoad));
      };

      // Initialize with provided src element
      if (this.mediaEl) {
        if (this.mediaEl.tagName && this.mediaEl.tagName.toLowerCase() === 'img') {
          this.attachImageListener(this.mediaEl);
          if (this.mediaEl.complete) this.setTextureFromMedia(this.mediaEl);
        } else {
          // <video> or others
          this.setTextureFromMedia(this.mediaEl);
        }
      }

      if (this.el.getObject3D('mesh')) {
        this.applyMaterial();
      } else {
        this.el.addEventListener('object3dset', (e) => {
          if (e.detail.type === 'mesh') this.applyMaterial();
        });
      }
    },
    update: function (oldData) {
      // If `src` element changed, re-bind
      if (!oldData || oldData.src !== this.data.src) {
        // cleanup old listeners
        this.disposeFns.forEach(fn => { try { fn(); } catch(e){} });
        this.disposeFns = [];
        this.mediaEl = this.data.src || null;
        if (this.mediaEl) {
          if (this.mediaEl.tagName && this.mediaEl.tagName.toLowerCase() === 'img') {
            this.attachImageListener(this.mediaEl);
            if (this.mediaEl.complete) this.setTextureFromMedia(this.mediaEl);
          } else {
            this.setTextureFromMedia(this.mediaEl);
          }
        }
      }
      // No geometry changes needed here after refactor
    },
    remove: function () {
      const mesh = this.el.getObject3D('mesh');
      if (mesh) {
        mesh.traverse((obj) => {
          if (obj.isMesh && obj.onBeforeRender) obj.onBeforeRender = null;
        });
      }
      if (this.material) this.material.dispose();
      if (this.currentTexture && this.currentTexture.dispose) {
        try { this.currentTexture.dispose(); } catch(e){}
      }
      this.disposeFns.forEach(fn => { try { fn(); } catch(e){} });
      this.disposeFns = [];
    }
  });
})();
