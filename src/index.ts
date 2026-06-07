import * as THREE from 'three';

export interface WebGL360ColorFilters {
  exposure?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  highlight?: number;
  shadow?: number;
}

export interface Image360PlayerOptions {
  container: HTMLElement;
  imageUrl: string;
  autoLoad?: boolean;
  showControls?: boolean;
  compass?: boolean;
  mouseZoom?: boolean;
  doubleClickZoom?: boolean;
  touchPanAndZoom?: boolean;
  colorFilters?: WebGL360ColorFilters;
}

export interface HotSpotOptions {
  yaw: number;
  pitch: number;
  id?: string;
  html: string;
  onClick?: (e: Event) => void;
}

interface ActiveHotSpot {
  options: HotSpotOptions;
  element: HTMLDivElement;
}

export class Image360Player {
  private container: HTMLElement;
  private options: Image360PlayerOptions;
  
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private geometry!: THREE.SphereGeometry;
  private material!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private resizeObserver?: ResizeObserver;
  private hotspotsOverlay!: HTMLDivElement;
  
  private yaw = 0;
  private pitch = 0;
  private hfov = 90;
  
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartYaw = 0;
  private dragStartPitch = 0;
  
  private activePointers = new Map<number, { clientX: number; clientY: number }>();
  private initialPinchDistance: number | null = null;
  private initialPinchHfov = 90;
  
  private hotspots: ActiveHotSpot[] = [];
  
  private filters: Required<WebGL360ColorFilters> = {
    exposure: 0,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
    highlight: 0,
    shadow: 0,
  };

  constructor(options: Image360PlayerOptions) {
    this.options = options;
    this.container = options.container;

    if (options.colorFilters) {
      this.filters = { ...this.filters, ...options.colorFilters };
    }

    if (!this.checkWebGLSupport()) {
      this.renderFallback();
      return;
    }

    this.initThree();
    this.initDOM();
    this.initListeners();
    
    this.loadTexture(options.imageUrl);
    
    // Trigger initial layout resize
    this.resize();
    
    // Start loop
    this.animate();
  }

  private initThree(): void {
    this.scene = new THREE.Scene();
    
    // Set up camera (aspect ratio will be adjusted on resize)
    this.camera = new THREE.PerspectiveCamera(this.hfov, 1, 0.1, 1000);
    this.updateCameraRotation();

    // Create inverted sphere geometry so texture renders on the inside
    this.geometry = new THREE.SphereGeometry(500, 60, 40);
    this.geometry.scale(-1, 1, 1);

    // Create shader material with our native WebGL color adjusting filters
    this.material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        map: { value: null },
        uExposure: { value: this.filters.exposure },
        uBrightness: { value: this.filters.brightness },
        uContrast: { value: this.filters.contrast },
        uSaturation: { value: this.filters.saturation },
        uTemperature: { value: this.filters.temperature },
        uTint: { value: this.filters.tint },
        uHighlight: { value: this.filters.highlight },
        uShadow: { value: this.filters.shadow },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float uExposure;
        uniform float uBrightness;
        uniform float uContrast;
        uniform float uSaturation;
        uniform float uTemperature;
        uniform float uTint;
        uniform float uHighlight;
        uniform float uShadow;

        varying vec2 vUv;

        vec3 applyFilters(vec3 color) {
          // Exposure
          color *= pow(2.0, uExposure);
          
          // Brightness
          color += uBrightness;
          
          // Contrast
          color = (color - 0.5) * uContrast + 0.5;
          
          // Saturation
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(luma), color, uSaturation);
          
          // Highlight & Shadow
          float shadowFactor = uShadow * (1.0 - smoothstep(0.0, 0.7, luma));
          color = color + color * shadowFactor;
          
          float highlightFactor = uHighlight * smoothstep(0.3, 1.0, luma);
          color = color + color * highlightFactor;
          
          // Temperature & Tint
          color.r += uTemperature * 0.08;
          color.b -= uTemperature * 0.08;
          color.g += uTint * 0.06;
          color.r -= uTint * 0.03;
          color.b -= uTint * 0.03;
          
          return clamp(color, 0.0, 1.0);
        }

        void main() {
          vec4 texel = texture2D(map, vUv);
          if (texel.a < 0.01) discard;
          gl_FragColor = vec4(applyFilters(texel.rgb), texel.a);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true, // Required for taking snapshots
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
  }

  private initDOM(): void {
    // Clear container
    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';

    // Style the canvas
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.container.appendChild(canvas);

    // Hotspots overlay container
    this.hotspotsOverlay = document.createElement('div');
    this.hotspotsOverlay.style.position = 'absolute';
    this.hotspotsOverlay.style.top = '0';
    this.hotspotsOverlay.style.left = '0';
    this.hotspotsOverlay.style.width = '100%';
    this.hotspotsOverlay.style.height = '100%';
    this.hotspotsOverlay.style.pointerEvents = 'none';
    this.hotspotsOverlay.style.overflow = 'hidden';
    this.hotspotsOverlay.style.zIndex = '5';
    this.container.appendChild(this.hotspotsOverlay);
  }

  private initListeners(): void {
    const canvas = this.renderer.domElement;
    
    // Mouse / Touch Dragging and Panning via PointerEvents
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    
    // Zoom via Wheel
    if (this.options.mouseZoom !== false) {
      canvas.addEventListener('wheel', this.onWheel, { passive: false });
    }
    
    // Double click to zoom
    if (this.options.doubleClickZoom !== false) {
      canvas.addEventListener('dblclick', this.onDoubleClick);
    }

    // Handle Resize
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.resize);
    }
  }

  private loadTexture(url: string): void {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        
        if (this.material) {
          const oldTexture = this.material.uniforms.map.value;
          if (oldTexture) {
            oldTexture.dispose();
          }
          this.material.uniforms.map.value = texture;
          this.material.needsUpdate = true;
          this.triggerRedraw();
        }
      },
      undefined,
      (err) => {
        console.error('Failed to load panorama image texture', err);
      }
    );
  }

  private updateCameraRotation(): void {
    const phi = THREE.MathUtils.degToRad(90 - this.pitch);
    const theta = THREE.MathUtils.degToRad(this.yaw);

    const target = new THREE.Vector3(
      500 * Math.sin(phi) * Math.cos(theta),
      500 * Math.cos(phi),
      500 * Math.sin(phi) * Math.sin(theta)
    );
    this.camera.lookAt(target);
  }

  private updateCameraFov(): void {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    const aspect = width / height;

    // Convert horizontal FOV (hfov) to vertical FOV for Three.js
    const hfovRad = THREE.MathUtils.degToRad(this.hfov);
    const vfovRad = 2 * Math.atan(Math.tan(hfovRad / 2) / aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(vfovRad);
    this.camera.updateProjectionMatrix();
  }

  private updateHotspots(): void {
    if (!this.camera || !this.container) return;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    this.hotspots.forEach(hs => {
      // Calculate 3D position vector on sphere of radius 500
      const phi = THREE.MathUtils.degToRad(90 - hs.options.pitch);
      const theta = THREE.MathUtils.degToRad(hs.options.yaw);
      const target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      
      const vector = target.clone();
      vector.project(this.camera);

      const hsDir = target.clone().normalize();
      const dot = cameraDir.dot(hsDir);

      if (dot < 0 || vector.z > 1) {
        hs.element.style.display = 'none';
      } else {
        hs.element.style.display = 'block';
        
        const x = (vector.x * 0.5 + 0.5) * width;
        const y = (-(vector.y * 0.5) + 0.5) * height;
        
        hs.element.style.left = `${x}px`;
        hs.element.style.top = `${y}px`;
      }
    });
  }

  private resize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.camera.aspect = width / height;
    this.updateCameraFov();
    this.renderer.setSize(width, height, false);
    this.updateHotspots();
  };

  private animate = (): void => {
    if (!this.renderer) return;
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  // --- Input Handlers ---

  private onPointerDown = (e: PointerEvent): void => {
    const canvas = this.renderer.domElement;
    canvas.setPointerCapture(e.pointerId);
    
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartYaw = this.yaw;
      this.dragStartPitch = this.pitch;
    } else if (this.activePointers.size === 2 && this.options.touchPanAndZoom !== false) {
      this.isDragging = false;
      const pointers = Array.from(this.activePointers.values());
      const dx = pointers[0].clientX - pointers[1].clientX;
      const dy = pointers[0].clientY - pointers[1].clientY;
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      this.initialPinchHfov = this.hfov;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;
    
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (this.isDragging && this.activePointers.size === 1) {
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      const sensitivity = this.hfov / 600; // Adjust speed based on FOV
      
      this.yaw = this.dragStartYaw - deltaX * sensitivity;
      this.pitch = this.dragStartPitch + deltaY * sensitivity;
      this.pitch = Math.max(-85, Math.min(85, this.pitch));
      
      this.updateCameraRotation();
      this.updateHotspots();
    } else if (this.activePointers.size === 2 && this.initialPinchDistance !== null) {
      const pointers = Array.from(this.activePointers.values());
      const dx = pointers[0].clientX - pointers[1].clientX;
      const dy = pointers[0].clientY - pointers[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const factor = this.initialPinchDistance / distance;
      this.hfov = this.initialPinchHfov * factor;
      this.hfov = Math.max(30, Math.min(120, this.hfov));
      
      this.updateCameraFov();
      this.updateHotspots();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    
    if (this.activePointers.size === 0) {
      this.isDragging = false;
      this.initialPinchDistance = null;
    } else if (this.activePointers.size === 1) {
      // Re-initialize dragging for the single remaining pointer
      const remainingPointerId = Array.from(this.activePointers.keys())[0];
      const pointer = this.activePointers.get(remainingPointerId)!;
      this.isDragging = true;
      this.dragStartX = pointer.clientX;
      this.dragStartY = pointer.clientY;
      this.dragStartYaw = this.yaw;
      this.dragStartPitch = this.pitch;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.hfov += e.deltaY * 0.05;
    this.hfov = Math.max(30, Math.min(120, this.hfov));
    
    this.updateCameraFov();
    this.updateHotspots();
  };

  private onDoubleClick = (): void => {
    if (this.hfov < 50) {
      this.hfov = 90;
    } else {
      this.hfov = 40;
    }
    this.updateCameraFov();
    this.updateHotspots();
  };

  // --- Public API ---

  public setImageUrl(url: string): void {
    this.options.imageUrl = url;
    this.loadTexture(url);
  }

  public setColorFilters(filters: WebGL360ColorFilters): void {
    this.filters = { ...this.filters, ...filters };
    if (this.material) {
      this.material.uniforms.uExposure.value = this.filters.exposure;
      this.material.uniforms.uBrightness.value = this.filters.brightness;
      this.material.uniforms.uContrast.value = this.filters.contrast;
      this.material.uniforms.uSaturation.value = this.filters.saturation;
      this.material.uniforms.uTemperature.value = this.filters.temperature;
      this.material.uniforms.uTint.value = this.filters.tint;
      this.material.uniforms.uHighlight.value = this.filters.highlight;
      this.material.uniforms.uShadow.value = this.filters.shadow;
      this.triggerRedraw();
    }
  }

  public getColorFilters(): Required<WebGL360ColorFilters> {
    return { ...this.filters };
  }

  public addHTMLOverlay(options: HotSpotOptions): void {
    const id = options.id || `hotspot-${Math.random().toString(36).substr(2, 9)}`;
    
    const element = document.createElement('div');
    element.className = 'custom-html-hotspot';
    element.style.position = 'absolute';
    element.style.pointerEvents = 'auto';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.cursor = options.onClick ? 'pointer' : 'default';
    element.innerHTML = options.html;
    
    if (options.onClick) {
      element.addEventListener('click', options.onClick);
    }
    
    // Stop propagation of pointer events to prevent panning when dragging/clicking on hotspots
    element.addEventListener('pointerdown', (e) => e.stopPropagation());
    element.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });

    this.hotspotsOverlay.appendChild(element);
    
    this.hotspots.push({
      options: { ...options, id },
      element,
    });

    this.updateHotspots();
  }

  public removeHTMLOverlay(id: string): void {
    const index = this.hotspots.findIndex(hs => hs.options.id === id);
    if (index !== -1) {
      const hs = this.hotspots[index];
      this.hotspotsOverlay.removeChild(hs.element);
      this.hotspots.splice(index, 1);
    }
  }

  public getYaw(): number {
    // Normalize yaw between -180 and 180 degrees
    let normYaw = this.yaw % 360;
    if (normYaw > 180) normYaw -= 360;
    if (normYaw < -180) normYaw += 360;
    return normYaw;
  }

  public getPitch(): number {
    return this.pitch;
  }

  public getHfov(): number {
    return this.hfov;
  }

  public takeSnapshot(): Promise<Blob> {
    if (!this.renderer) return Promise.reject(new Error('Renderer not initialized'));
    
    // Render immediately to ensure the drawing buffer contains the latest frame
    this.renderer.render(this.scene, this.camera);
    
    return new Promise((resolve, reject) => {
      this.renderer.domElement.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to capture canvas snapshot'));
        }
      }, 'image/png');
    });
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.resize);
    }

    // Clean up DOM
    this.container.innerHTML = '';

    // Dispose Three.js objects
    if (this.geometry) this.geometry.dispose();
    if (this.material) {
      if (this.material.uniforms.map.value) {
        this.material.uniforms.map.value.dispose();
      }
      this.material.dispose();
    }
    if (this.renderer) this.renderer.dispose();
  }

  private triggerRedraw(): void {
    // With requestAnimationFrame loop running continuously, redraw is implicit.
  }

  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  private renderFallback(): void {
    this.container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: #1a1a1a; color: white; font-family: sans-serif; text-align: center; padding: 20px; box-sizing: border-box;">
        <div>
          <h3 style="margin-top: 0;">WebGL Not Supported</h3>
          <p style="font-size: 14px; color: #ccc;">Your browser or device does not support WebGL, which is required to display interactive 360° panoramas.</p>
        </div>
      </div>
    `;
  }
}

export * from './react/ReactImage360Player';
