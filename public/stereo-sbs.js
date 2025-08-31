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
      halfTurn: { type: 'boolean', default: false } // rotate sphere half by 180° for black/visible split
    },
    init: function () {
      const THREE = AFRAME.THREE;
      this.mediaEl = this.data.src || null;
      this.disposeFns = [];

      this.uniforms = {
        uEye: { value: 2 }, // 0: left, 1: right, 2: mono
        uHalfRot: { value: this.data.halfTurn ? 1 : 0 }, // 0: normal, 1: rotate half by 180°
        map:  { value: null }
      };

      this.material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform int uEye; // 0: left, 1: right, 2: mono(=left)
          uniform int uHalfRot; // 0/1 rotate the half by 180°
          varying vec2 vUv;
          void main(){
            vec2 uv2 = vUv;
            if (uHalfRot == 1) {
              uv2.x = fract(uv2.x + 0.5);
            }
            if (uEye == 1) {
              // right eye uses right half of texture; black out opposite sphere half
              uv2.x = uv2.x <= 0.5 ? -1. : -0.5 + uv2.x;
            } else {
              // left eye (or mono) uses left half of texture; black out opposite sphere half
              uv2.x = uv2.x <= 0.5 ? -1. : uv2.x;
            }
            vec2 uvStereo = vec2(1.0 - uv2.x, 1.0 - uv2.y);
            gl_FragColor = uvStereo.x >= 1.0 ? vec4(0.0, 0.0, 0.0, 1.0) : texture2D(map, uvStereo);
          }
        `,
        side: THREE.DoubleSide
      });

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
              this.material.uniforms.uEye.value = eye;
              // keep half rotation uniform up-to-date
              this.material.uniforms.uHalfRot.value = this.data.halfTurn ? 1 : 0;
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
          tex.needsUpdate = true;
          // VideoTexture updates automatically as the video plays
          return tex;
        } else {
          const tex = new THREE.Texture(el);
          if (THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
          } else if (THREE.sRGBEncoding) {
            tex.encoding = THREE.sRGBEncoding;
          }
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.flipY = false;
          tex.needsUpdate = true;
          return tex;
        }
      };

      this.setTextureFromMedia = (el) => {
        if (!el) return;
        // Dispose old texture
        if (this.uniforms.map.value && this.uniforms.map.value.dispose) {
          try { this.uniforms.map.value.dispose(); } catch(e){}
        }
        const tex = this.makeTextureFromEl(el);
        this.uniforms.map.value = tex;
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
      if (!oldData || oldData.halfTurn !== this.data.halfTurn) {
        if (this.material && this.material.uniforms && this.material.uniforms.uHalfRot) {
          this.material.uniforms.uHalfRot.value = this.data.halfTurn ? 1 : 0;
        }
      }
    },
    remove: function () {
      const mesh = this.el.getObject3D('mesh');
      if (mesh) {
        mesh.traverse((obj) => {
          if (obj.isMesh && obj.onBeforeRender) obj.onBeforeRender = null;
        });
      }
      if (this.material) this.material.dispose();
      if (this.uniforms && this.uniforms.map && this.uniforms.map.value) {
        try { this.uniforms.map.value.dispose(); } catch(e){}
      }
      this.disposeFns.forEach(fn => { try { fn(); } catch(e){} });
      this.disposeFns = [];
    }
  });
})();
