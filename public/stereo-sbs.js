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
      halfTurn: { type: 'boolean', default: false }, // rotate sphere half by 180° for black/visible split
      planeMode: { type: 'boolean', default: false } // true when geometry is a flat plane (map each eye to half without blackout)
    },
    init: function () {
      const THREE = AFRAME.THREE;
      this.mediaEl = this.data.src || null;
      this.disposeFns = [];

      this.shader = null;
      this.currentTexture = null;
      // Build MeshBasicMaterial and inject custom map sampling
      this.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      this.material.onBeforeCompile = (shader) => {
        this.shader = shader;
        shader.uniforms.uEye = { value: 2 }; // 0: left, 1: right, 2: mono
        shader.uniforms.uHalfRot = { value: this.data.halfTurn ? 1 : 0 };
        shader.uniforms.uPlaneMode = { value: this.data.planeMode ? 1 : 0 };
        // Declare custom uniforms in GLSL
        shader.fragmentShader = `uniform int uEye;\nuniform int uHalfRot;\nuniform int uPlaneMode;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
             vec2 uvStereo;
             vec4 texelColor;
             if (uPlaneMode == 1) {
               float x = vMapUv.x;
               if (uEye == 1) {
                 x = 0.5 + x * 0.5; // right -> right half
               } else {
                 x = x * 0.5;      // left/mono -> left half
               }
               uvStereo = vec2(x, 1.0 - vMapUv.y);
               texelColor = texture2D( map, uvStereo );
             } else {
               vec2 uv2 = vMapUv;
               if (uHalfRot == 1) {
                 uv2.x = fract(uv2.x + 0.5);
               }
               if (uEye == 1) {
                 uv2.x = uv2.x <= 0.5 ? -1. : -0.5 + uv2.x; // right half or blackout
               } else {
                 uv2.x = uv2.x <= 0.5 ? -1. : uv2.x;       // left half or blackout
               }
               uvStereo = vec2(1.0 - uv2.x, 1.0 - uv2.y);
               if (uvStereo.x >= 1.0) {
                 texelColor = vec4(0.0, 0.0, 0.0, 1.0);
               } else {
                 texelColor = texture2D( map, uvStereo );
               }
             }
             diffuseColor *= texelColor;
           #endif`
        );
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
              if (this.shader && this.shader.uniforms) {
                this.shader.uniforms.uEye.value = eye;
                this.shader.uniforms.uHalfRot.value = this.data.halfTurn ? 1 : 0;
                this.shader.uniforms.uPlaneMode.value = this.data.planeMode ? 1 : 0;
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
          // Shader in map_fragment replacement flips Y; keep flipY=false
          tex.flipY = false;
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
          // Shader in map_fragment replacement flips Y; keep flipY=false
          tex.flipY = false;
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
      if (this.shader && this.shader.uniforms) {
        if (!oldData || oldData.halfTurn !== this.data.halfTurn) {
          this.shader.uniforms.uHalfRot.value = this.data.halfTurn ? 1 : 0;
        }
        if (!oldData || oldData.planeMode !== this.data.planeMode) {
          this.shader.uniforms.uPlaneMode.value = this.data.planeMode ? 1 : 0;
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
      if (this.currentTexture && this.currentTexture.dispose) {
        try { this.currentTexture.dispose(); } catch(e){}
      }
      this.disposeFns.forEach(fn => { try { fn(); } catch(e){} });
      this.disposeFns = [];
    }
  });
})();
