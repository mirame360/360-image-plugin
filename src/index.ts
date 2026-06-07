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
  html?: string;
  text?: string;
  url?: string;
  target?: string;
  cssClass?: string;
  onClick?: (e: Event) => void;
}

interface ActiveHotSpot {
  options: HotSpotOptions;
  element: HTMLDivElement;
}

export type PlayerEvent = 'load' | 'viewchange' | 'zoom' | 'error' | 'click';

export interface PlayerEventMap {
  'load': undefined;
  'viewchange': { yaw: number; pitch: number; hfov: number };
  'zoom': { hfov: number };
  'error': Error;
  'click': { yaw: number; pitch: number; event: PointerEvent };
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
  private vrButton?: HTMLButtonElement;
  private xrSession: any = null;
  
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

  // Inertia and Event emitter variables
  private listeners: { [key in PlayerEvent]?: ((data: any) => void)[] } = {};
  private velocityYaw = 0;
  private velocityPitch = 0;
  private isInertialGliding = false;
  private lastPointerTime = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastFrameTime = 0;

  // Click detection variables
  private clickStartX = 0;
  private clickStartY = 0;
  private clickStartTime = 0;

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
    this.initXR();
    
    this.loadTexture(options.imageUrl);
    
    // Trigger initial layout resize
    this.resize();
    
    // Start loop
    this.lastFrameTime = Date.now();
    this.renderer.setAnimationLoop(this.animate);
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

  private initXR(): void {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      this.renderer.xr.enabled = true;
      navigator.xr?.isSessionSupported('immersive-vr').then((supported) => {
        if (supported) {
          this.createVRButton();
        }
      });
    }
  }

  private createVRButton(): void {
    this.vrButton = document.createElement('button');
    this.vrButton.className = 'webxr-vr-button';
    this.vrButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: block;"><path d="M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0"></path><path d="M6 12c.5 1.5 2 2.5 3.5 2.5s3-1 3.5-2.5"></path><path d="M11 12c.5 1.5 2 2.5 3.5 2.5s3-1 3.5-2.5"></path></svg>
      <span>Enter VR</span>
    `;
    
    // Premium glassmorphism styles
    Object.assign(this.vrButton.style, {
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      padding: '10px 16px',
      borderRadius: '8px',
      background: 'rgba(255, 255, 255, 0.15)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      color: 'white',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      zIndex: '10',
      transition: 'background-color 0.2s, transform 0.2s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    });

    this.vrButton.addEventListener('mouseenter', () => {
      if (this.vrButton) {
        this.vrButton.style.background = 'rgba(255, 255, 255, 0.25)';
        this.vrButton.style.transform = 'translateY(-1px)';
      }
    });

    this.vrButton.addEventListener('mouseleave', () => {
      if (this.vrButton) {
        this.vrButton.style.background = 'rgba(255, 255, 255, 0.15)';
        this.vrButton.style.transform = 'translateY(0)';
      }
    });

    this.vrButton.addEventListener('click', () => this.toggleVR());
    
    this.container.appendChild(this.vrButton);
  }

  private toggleVR(): void {
    if (!this.xrSession) {
      navigator.xr?.requestSession('immersive-vr').then((session) => {
        this.xrSession = session;
        this.renderer.xr.setSession(session);
        
        if (this.vrButton) {
          this.vrButton.querySelector('span')!.textContent = 'Exit VR';
        }
        
        const onSessionEnd = () => {
          this.xrSession = null;
          if (this.vrButton) {
            this.vrButton.querySelector('span')!.textContent = 'Enter VR';
          }
          session.removeEventListener('end', onSessionEnd);
        };
        session.addEventListener('end', onSessionEnd);
      }).catch((err) => {
        console.error('Failed to start WebXR session:', err);
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      });
    } else {
      this.xrSession.end();
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
        this.emit('load', undefined);
      },
      undefined,
      (err) => {
        console.error('Failed to load panorama image texture', err);
        const errorObj = err instanceof Error ? err : new Error('Failed to load texture');
        this.emit('error', errorObj);
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
    this.emit('viewchange', { yaw: this.getYaw(), pitch: this.pitch, hfov: this.hfov });
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
    this.emit('zoom', { hfov: this.hfov });
    this.emit('viewchange', { yaw: this.getYaw(), pitch: this.pitch, hfov: this.hfov });
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

    const now = Date.now();
    const dt = Math.min(50, now - this.lastFrameTime);
    this.lastFrameTime = now;

    if (this.isInertialGliding) {
      const friction = Math.pow(0.92, dt / 16.6);
      
      this.yaw += this.velocityYaw * dt;
      this.pitch += this.velocityPitch * dt;
      this.pitch = Math.max(-85, Math.min(85, this.pitch));

      this.velocityYaw *= friction;
      this.velocityPitch *= friction;

      this.updateCameraRotation();
      this.updateHotspots();

      const speed = Math.sqrt(this.velocityYaw * this.velocityYaw + this.velocityPitch * this.velocityPitch);
      if (speed < 0.005) {
        this.isInertialGliding = false;
        this.velocityYaw = 0;
        this.velocityPitch = 0;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  // --- Input Handlers ---

  private onPointerDown = (e: PointerEvent): void => {
    const canvas = this.renderer.domElement;
    canvas.setPointerCapture(e.pointerId);
    
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    this.velocityYaw = 0;
    this.velocityPitch = 0;
    this.isInertialGliding = false;
    this.lastPointerTime = Date.now();
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartYaw = this.yaw;
      this.dragStartPitch = this.pitch;

      this.clickStartX = e.clientX;
      this.clickStartY = e.clientY;
      this.clickStartTime = Date.now();
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
    
    const now = Date.now();
    const dt = Math.max(1, now - this.lastPointerTime);
    
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (this.isDragging && this.activePointers.size === 1) {
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      const sensitivity = this.hfov / 600; // Adjust speed based on FOV
      
      const targetYaw = this.dragStartYaw - deltaX * sensitivity;
      const targetPitch = Math.max(-85, Math.min(85, this.dragStartPitch + deltaY * sensitivity));
      
      this.velocityYaw = (targetYaw - this.yaw) / dt;
      this.velocityPitch = (targetPitch - this.pitch) / dt;

      this.yaw = targetYaw;
      this.pitch = targetPitch;
      
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

    this.lastPointerTime = now;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    
    if (this.activePointers.size === 0) {
      // Trigger click event if within thresholds
      const clickDuration = Date.now() - this.clickStartTime;
      const dx = e.clientX - this.clickStartX;
      const dy = e.clientY - this.clickStartY;
      const clickDist = Math.sqrt(dx * dx + dy * dy);

      if (this.isDragging && clickDuration < 250 && clickDist < 5) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        const rect = this.container.getBoundingClientRect();

        mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObject(this.mesh);

        if (intersects.length > 0) {
          const point = intersects[0].point.clone().normalize();
          const phi = Math.acos(point.y);
          const pitch = 90 - THREE.MathUtils.radToDeg(phi);
          let yaw = THREE.MathUtils.radToDeg(Math.atan2(point.z, point.x));
          let normYaw = yaw % 360;
          if (normYaw > 180) normYaw -= 360;
          if (normYaw < -180) normYaw += 360;

          this.emit('click', { yaw: normYaw, pitch, event: e });
        } else {
          this.emit('click', { yaw: this.getYaw(), pitch: this.pitch, event: e });
        }
      }

      this.isDragging = false;
      this.initialPinchDistance = null;

      // Start inertia glide phase
      const speed = Math.sqrt(this.velocityYaw * this.velocityYaw + this.velocityPitch * this.velocityPitch);
      if (speed > 0.05) {
        this.isInertialGliding = true;
      }
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

  // --- Event Emitter ---

  public on<K extends PlayerEvent>(event: K, callback: (data: PlayerEventMap[K]) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
  }

  public off<K extends PlayerEvent>(event: K, callback: (data: PlayerEventMap[K]) => void): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(cb => cb !== callback);
  }

  private emit<K extends PlayerEvent>(event: K, data: PlayerEventMap[K]): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(cb => cb(data));
    }
  }

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
    if (options.cssClass) {
      element.className += ` ${options.cssClass}`;
    }
    element.style.position = 'absolute';
    element.style.pointerEvents = 'auto';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.cursor = (options.onClick || options.url) ? 'pointer' : 'default';
    
    if (options.html) {
      element.innerHTML = options.html;
    } else {
      // Default premium hotspot style (info marker with dynamic tooltip)
      element.innerHTML = `
        <div class="default-hotspot-marker" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(8px); border: 2px solid rgba(255, 255, 255, 0.85); box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-family: system-ui, sans-serif; font-size: 14px; user-select: none; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
          i
        </div>
        ${options.text ? `
          <div class="default-hotspot-tooltip" style="position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%) translateY(4px); background: rgba(18, 18, 18, 0.85); backdrop-filter: blur(12px); color: white; font-family: system-ui, sans-serif; font-size: 12px; padding: 6px 10px; border-radius: 6px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s, transform 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1);">
            ${options.text}
          </div>
        ` : ''}
      `;
      
      // Hover animations for default hotspot
      element.addEventListener('mouseenter', () => {
        const marker = element.querySelector('.default-hotspot-marker') as HTMLElement;
        const tooltip = element.querySelector('.default-hotspot-tooltip') as HTMLElement;
        if (marker) marker.style.transform = 'scale(1.15)';
        if (tooltip) {
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'translateX(-50%) translateY(0px)';
        }
      });
      element.addEventListener('mouseleave', () => {
        const marker = element.querySelector('.default-hotspot-marker') as HTMLElement;
        const tooltip = element.querySelector('.default-hotspot-tooltip') as HTMLElement;
        if (marker) marker.style.transform = 'scale(1)';
        if (tooltip) {
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'translateX(-50%) translateY(4px)';
        }
      });
    }
    
    if (options.onClick) {
      element.addEventListener('click', options.onClick);
    }
    
    if (options.url) {
      element.addEventListener('click', () => {
        window.open(options.url, options.target || '_blank');
      });
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
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }

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
    // With requestAnimationFrame / setAnimationLoop loop running continuously, redraw is implicit.
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
