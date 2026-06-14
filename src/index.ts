import * as THREE from 'three';
import { strToU8, zipSync } from 'fflate';

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
  initialView?: Partial<Viewport>;
  brandingMode?: BrandingMode;
  allowExternalLinks?: boolean;
  sanitizeHTML?: (html: string) => string;
  nadir?: NadirCoverOptions;
  snapshotEndpoint?: string;
  snapshotHeaders?: Record<string, string>;
}

export interface Viewport {
  yaw: number;
  pitch: number;
  hfov: number;
}

export type BrandingMode = 'branded' | 'unbranded';
export type HotSpotType = 'info' | 'link' | 'quiz' | 'clue' | 'locked' | 'product';

export interface NadirCoverOptions {
  imageUrl: string;
  radius?: number;
  rotation?: number;
  opacity?: number;
}

export interface QuizChoice {
  id: string;
  label: string;
  correct?: boolean;
}

export interface ProductOptions {
  id: string;
  title: string;
  price?: string;
  imageUrl?: string;
  variantId?: string;
  vendor?: 'shopify' | 'prestashop' | 'custom';
  metadata?: Record<string, unknown>;
}

export interface HotSpotOptions {
  yaw: number;
  pitch: number;
  id?: string;
  type?: HotSpotType;
  html?: string;
  text?: string;
  title?: string;
  url?: string;
  target?: string;
  cssClass?: string;
  branded?: boolean;
  quizChoices?: QuizChoice[];
  clueId?: string;
  unlocks?: string[];
  requires?: string[];
  product?: ProductOptions;
  onClick?: (e: Event) => void;
}

interface ActiveHotSpot {
  options: HotSpotOptions;
  element: HTMLDivElement;
}

export interface SnapshotRequestOptions {
  endpoint?: string;
  mediaId?: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface OfflineExportOptions {
  fileName?: string;
  playerScriptUrl?: string;
  fetchAssets?: boolean;
}

export interface SerializablePlayerConfig {
  imageUrl: string;
  autoLoad: boolean;
  showControls: boolean;
  compass: boolean;
  mouseZoom: boolean;
  doubleClickZoom: boolean;
  touchPanAndZoom: boolean;
  colorFilters: Required<WebGL360ColorFilters>;
  initialView: Viewport;
  brandingMode: BrandingMode;
  allowExternalLinks: boolean;
  nadir?: NadirCoverOptions;
  hotspots: HotSpotOptions[];
}

export interface GameState {
  discoveredClues: string[];
  unlockedHotspots: string[];
  answeredQuizzes: Record<string, string>;
}

export type PlayerEvent =
  | 'load'
  | 'viewchange'
  | 'zoom'
  | 'error'
  | 'click'
  | 'hotspotclick'
  | 'quizanswer'
  | 'cluediscovered'
  | 'unlock'
  | 'addtocart'
  | 'snapshotstart'
  | 'snapshotcomplete';

export interface PlayerEventMap {
  'load': undefined;
  'viewchange': { yaw: number; pitch: number; hfov: number };
  'zoom': { hfov: number };
  'error': Error;
  'click': { yaw: number; pitch: number; event: PointerEvent };
  'hotspotclick': HotSpotOptions;
  'quizanswer': { hotspot: HotSpotOptions; choice: QuizChoice; correct: boolean };
  'cluediscovered': { hotspot: HotSpotOptions; clueId: string };
  'unlock': { hotspotIds: string[] };
  'addtocart': { hotspot: HotSpotOptions; product: ProductOptions };
  'snapshotstart': { viewport: Viewport };
  'snapshotcomplete': { viewport: Viewport; url?: string; blob?: Blob };
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
  private controlsOverlay?: HTMLDivElement;
  private compassElement?: HTMLDivElement;
  private vrButton?: HTMLButtonElement;
  private xrSession: any = null;
  private nadirMesh?: THREE.Mesh;
  private nadirMaterial?: THREE.MeshBasicMaterial;
  private nadirTexture?: THREE.Texture;
  private isDestroyed = false;
  
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
  private gameState: GameState = {
    discoveredClues: [],
    unlockedHotspots: [],
    answeredQuizzes: {},
  };
  
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
    this.options = {
      ...options,
      autoLoad: options.autoLoad !== false,
      showControls: options.showControls !== false,
      compass: options.compass === true,
      mouseZoom: options.mouseZoom !== false,
      doubleClickZoom: options.doubleClickZoom !== false,
      touchPanAndZoom: options.touchPanAndZoom !== false,
      brandingMode: options.brandingMode || 'branded',
      allowExternalLinks: options.allowExternalLinks !== false,
    };
    this.container = options.container;
    this.yaw = options.initialView?.yaw ?? 0;
    this.pitch = this.clampPitch(options.initialView?.pitch ?? 0);
    this.hfov = this.clampHfov(options.initialView?.hfov ?? 90);

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

    if (this.options.nadir) {
      this.setNadirCover(this.options.nadir);
    }

    if (this.options.autoLoad) {
      this.loadTexture(options.imageUrl);
    }
    
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

    if (this.options.showControls) {
      this.createControls();
    }
    if (this.options.compass) {
      this.createCompass();
    }
  }

  private createControls(): void {
    const controls = document.createElement('div');
    controls.className = 'image360-controls';
    Object.assign(controls.style, {
      position: 'absolute',
      left: '16px',
      bottom: '16px',
      zIndex: '10',
      display: 'flex',
      gap: '8px',
    });

    const controlsConfig = [
      { label: 'Zoom in', text: '+', action: () => this.setHfov(this.hfov - 10) },
      { label: 'Zoom out', text: '−', action: () => this.setHfov(this.hfov + 10) },
      { label: 'Reset view', text: '↺', action: () => this.setView({ yaw: 0, pitch: 0, hfov: 90 }) },
    ];

    controlsConfig.forEach(({ label, text, action }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'image360-control-button';
      button.setAttribute('aria-label', label);
      button.textContent = text;
      Object.assign(button.style, {
        width: '36px',
        height: '36px',
        border: '1px solid rgba(255,255,255,0.35)',
        borderRadius: '8px',
        background: 'rgba(18,18,18,0.65)',
        color: 'white',
        cursor: 'pointer',
        fontSize: '20px',
      });
      button.addEventListener('click', action);
      controls.appendChild(button);
    });

    this.controlsOverlay = controls;
    this.container.appendChild(controls);
  }

  private createCompass(): void {
    const compass = document.createElement('div');
    compass.className = 'image360-compass';
    compass.setAttribute('aria-label', 'Panorama heading');
    Object.assign(compass.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: '10',
      width: '42px',
      height: '42px',
      borderRadius: '50%',
      border: '1px solid rgba(255,255,255,0.45)',
      background: 'rgba(18,18,18,0.65)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      font: '600 12px system-ui, sans-serif',
      transformOrigin: 'center',
    });
    compass.textContent = 'N';
    this.compassElement = compass;
    this.container.appendChild(compass);
    this.updateCompass();
  }

  private updateCompass(): void {
    if (this.compassElement) {
      this.compassElement.style.transform = `rotate(${-this.getYaw()}deg)`;
    }
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
        if (this.isDestroyed) {
          texture.dispose();
          return;
        }
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
    this.camera.updateMatrixWorld(true);
    this.updateCompass();
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
      if (!this.isHotspotAvailable(hs.options)) {
        hs.element.style.display = 'none';
        return;
      }
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
        hs.element.style.display = '';
        
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
          const yaw = THREE.MathUtils.radToDeg(Math.atan2(point.z, point.x));
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

  private clampPitch(value: number): number {
    return Math.max(-85, Math.min(85, value));
  }

  private clampHfov(value: number): number {
    return Math.max(30, Math.min(120, value));
  }

  private sanitizeHTML(html: string): string {
    if (this.options.sanitizeHTML) {
      return this.options.sanitizeHTML(html);
    }
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script, iframe, object, embed, link, meta').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith('on') || (['href', 'src', 'xlink:href'].includes(name) && value.startsWith('javascript:'))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }

  private isHotspotAvailable(options: HotSpotOptions): boolean {
    if (this.options.brandingMode === 'unbranded' && options.branded !== false) {
      return false;
    }
    const requirements = options.requires || [];
    return requirements.every(id =>
      this.gameState.discoveredClues.includes(id) || this.gameState.unlockedHotspots.includes(id)
    );
  }

  public load(): void {
    this.loadTexture(this.options.imageUrl);
  }

  public setImageUrl(url: string): void {
    if (this.options.imageUrl === url) return;
    this.options.imageUrl = url;
    this.loadTexture(url);
  }

  public getView(): Viewport {
    return { yaw: this.getYaw(), pitch: this.pitch, hfov: this.hfov };
  }

  public setView(view: Partial<Viewport>): void {
    if (view.yaw !== undefined) this.yaw = view.yaw;
    if (view.pitch !== undefined) this.pitch = this.clampPitch(view.pitch);
    if (view.hfov !== undefined) this.hfov = this.clampHfov(view.hfov);
    this.updateCameraRotation();
    this.updateCameraFov();
    this.updateHotspots();
  }

  public setYaw(yaw: number): void {
    this.setView({ yaw });
  }

  public setPitch(pitch: number): void {
    this.setView({ pitch });
  }

  public setHfov(hfov: number): void {
    this.setView({ hfov });
  }

  public setBrandingMode(mode: BrandingMode): void {
    this.options.brandingMode = mode;
    this.hotspots.forEach(hotspot => {
      hotspot.element.style.display = this.isHotspotAvailable(hotspot.options) ? '' : 'none';
    });
    this.updateHotspots();
  }

  public setNadirCover(options?: NadirCoverOptions): void {
    if (this.nadirMesh) {
      this.scene.remove(this.nadirMesh);
      this.nadirMesh.geometry.dispose();
      this.nadirMaterial?.dispose();
      this.nadirTexture?.dispose();
      this.nadirMesh = undefined;
      this.nadirMaterial = undefined;
      this.nadirTexture = undefined;
    }
    this.options.nadir = options;
    if (!options || !this.scene) return;

    new THREE.TextureLoader().load(options.imageUrl, texture => {
      if (this.isDestroyed || this.options.nadir !== options) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      const radius = Math.max(5, Math.min(200, options.radius ?? 55));
      const geometry = new THREE.CircleGeometry(radius, 64);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: Math.max(0, Math.min(1, options.opacity ?? 1)),
        side: THREE.DoubleSide,
        depthTest: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, -490, 0);
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = THREE.MathUtils.degToRad(options.rotation ?? 0);
      this.nadirTexture = texture;
      this.nadirMaterial = material;
      this.nadirMesh = mesh;
      this.scene.add(mesh);
    });
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
    if (options.html) {
      element.className = 'custom-html-hotspot';
    } else {
      element.className = 'default-hotspot-container';
    }
    if (options.cssClass) {
      element.className += ` ${options.cssClass}`;
    }
    element.style.position = 'absolute';
    element.style.pointerEvents = 'auto';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.cursor = (options.onClick || options.url) ? 'pointer' : 'default';
    
    if (options.html) {
      element.innerHTML = this.sanitizeHTML(options.html);
    } else {
      // Default premium hotspot style (info marker with dynamic tooltip)
      element.innerHTML = `
        <div class="default-hotspot-marker" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(8px); border: 2px solid rgba(255, 255, 255, 0.85); box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-family: system-ui, sans-serif; font-size: 14px; user-select: none; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-sizing: border-box; line-height: 1;">
          i
        </div>
        ${options.text ? `
          <div class="default-hotspot-tooltip" style="position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%) translateY(4px); background: rgba(18, 18, 18, 0.85); backdrop-filter: blur(12px); color: white; font-family: system-ui, sans-serif; font-size: 12px; padding: 6px 10px; border-radius: 6px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s, transform 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1);">
          </div>
        ` : ''}
      `;
      const tooltip = element.querySelector('.default-hotspot-tooltip');
      if (tooltip) tooltip.textContent = options.text || '';
      const marker = element.querySelector('.default-hotspot-marker');
      if (marker && options.type === 'locked') marker.textContent = 'L';
      if (marker && options.type === 'product') marker.textContent = '$';
      if (marker && options.type === 'quiz') marker.textContent = '?';

      if (tooltip && options.type === 'product' && options.product) {
        tooltip.textContent = '';
        const product = options.product;
        if (product.imageUrl) {
          const image = document.createElement('img');
          image.src = product.imageUrl;
          image.alt = '';
          Object.assign(image.style, {
            display: 'block',
            width: '160px',
            maxHeight: '100px',
            objectFit: 'cover',
            borderRadius: '4px',
            marginBottom: '6px',
          });
          tooltip.appendChild(image);
        }
        const title = document.createElement('strong');
        title.textContent = product.title;
        tooltip.appendChild(title);
        if (product.price) {
          const price = document.createElement('div');
          price.textContent = product.price;
          tooltip.appendChild(price);
        }
      }

      if (tooltip && options.type === 'quiz' && options.quizChoices?.length) {
        tooltip.textContent = '';
        if (options.title || options.text) {
          const question = document.createElement('strong');
          question.textContent = options.title || options.text || '';
          tooltip.appendChild(question);
        }
        options.quizChoices.forEach(choice => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = choice.label;
          button.style.display = 'block';
          button.style.marginTop = '6px';
          button.addEventListener('click', event => {
            event.stopPropagation();
            this.answerQuiz(id, choice.id);
          });
          tooltip.appendChild(button);
        });
        (tooltip as HTMLElement).style.pointerEvents = 'auto';
      }
      
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
        if (!this.options.allowExternalLinks || this.options.brandingMode === 'unbranded') return;
        const opened = window.open(options.url, options.target || '_blank');
        if (opened) opened.opener = null;
      });
    }

    // Emit global hotspotclick event when clicked
    element.addEventListener('click', () => {
      const hotspot = { ...options, id };
      if (hotspot.type === 'clue' && hotspot.clueId) {
        this.discoverClue(hotspot.clueId, hotspot);
      }
      if (hotspot.type === 'product' && hotspot.product) {
        this.emit('addtocart', { hotspot, product: hotspot.product });
      }
      this.emit('hotspotclick', hotspot);
    });
    
    // Stop propagation of pointer events to prevent panning when dragging/clicking on hotspots
    element.addEventListener('pointerdown', (e) => e.stopPropagation());
    element.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });

    this.hotspotsOverlay.appendChild(element);
    
    this.hotspots.push({
      options: { ...options, id },
      element,
    });

    if (!this.isHotspotAvailable({ ...options, id })) {
      element.style.display = 'none';
    }
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

  public answerQuiz(hotspotId: string, choiceId: string): boolean {
    const active = this.hotspots.find(item => item.options.id === hotspotId);
    const choice = active?.options.quizChoices?.find(item => item.id === choiceId);
    if (!active || !choice) return false;
    const correct = choice.correct === true;
    this.gameState.answeredQuizzes[hotspotId] = choiceId;
    this.emit('quizanswer', { hotspot: active.options, choice, correct });
    if (correct && active.options.unlocks?.length) {
      this.unlockHotspots(active.options.unlocks);
    }
    return correct;
  }

  public discoverClue(clueId: string, hotspot?: HotSpotOptions): void {
    if (this.gameState.discoveredClues.includes(clueId)) return;
    this.gameState.discoveredClues.push(clueId);
    if (hotspot) this.emit('cluediscovered', { hotspot, clueId });
    if (hotspot?.unlocks?.length) this.unlockHotspots(hotspot.unlocks);
    this.updateHotspots();
  }

  public unlockHotspots(ids: string[]): void {
    const unlocked = ids.filter(id => !this.gameState.unlockedHotspots.includes(id));
    if (!unlocked.length) return;
    this.gameState.unlockedHotspots.push(...unlocked);
    this.emit('unlock', { hotspotIds: unlocked });
    this.updateHotspots();
  }

  public getGameState(): GameState {
    return {
      discoveredClues: [...this.gameState.discoveredClues],
      unlockedHotspots: [...this.gameState.unlockedHotspots],
      answeredQuizzes: { ...this.gameState.answeredQuizzes },
    };
  }

  public setGameState(state: Partial<GameState>): void {
    this.gameState = {
      discoveredClues: [...(state.discoveredClues || [])],
      unlockedHotspots: [...(state.unlockedHotspots || [])],
      answeredQuizzes: { ...(state.answeredQuizzes || {}) },
    };
    this.updateHotspots();
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

  public async requestSnapshot(options: SnapshotRequestOptions = {}): Promise<{ blob?: Blob; url?: string }> {
    const endpoint = options.endpoint || this.options.snapshotEndpoint;
    if (!endpoint) throw new Error('A snapshot endpoint is required');
    const viewport = this.getView();
    this.emit('snapshotstart', { viewport });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.snapshotHeaders,
        ...options.headers,
      },
      body: JSON.stringify({
        media_id: options.mediaId,
        ...viewport,
        width: options.width ?? 3840,
        height: options.height ?? 2160,
        quality: options.quality ?? 0.92,
        format: options.format ?? 'jpeg',
      }),
      signal: options.signal,
    });
    if (!response.ok) {
      let detail = `Snapshot request failed (${response.status})`;
      try {
        const payload = await response.json();
        detail = payload.detail || detail;
      } catch {
        // Keep the HTTP status fallback.
      }
      throw new Error(detail);
    }
    const contentType = response.headers.get('content-type') || '';
    let result: { blob?: Blob; url?: string };
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      if (payload.status_url && !payload.url) {
        result = await this.pollSnapshot(payload.status_url, {
          ...this.options.snapshotHeaders,
          ...options.headers,
        }, options.signal);
      } else {
        result = { url: payload.url as string };
      }
    } else {
      result = { blob: await response.blob() };
    }
    this.emit('snapshotcomplete', { viewport, ...result });
    return result;
  }

  private async pollSnapshot(
    statusUrl: string,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ url?: string }> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (signal?.aborted) {
        throw new DOMException('Snapshot request aborted', 'AbortError');
      }
      if (attempt > 0) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(resolve, 1000);
          signal?.addEventListener('abort', () => {
            window.clearTimeout(timeout);
            reject(new DOMException('Snapshot request aborted', 'AbortError'));
          }, { once: true });
        });
      }
      const response = await fetch(statusUrl, { headers, signal });
      if (signal?.aborted) {
        throw new DOMException('Snapshot request aborted', 'AbortError');
      }
      const payload = await response.json();
      if (!response.ok || payload.status === 'failed') {
        throw new Error(payload.detail || `Snapshot generation failed (${response.status})`);
      }
      if (payload.status === 'complete') return { url: payload.url };
    }
    throw new Error('Snapshot generation timed out');
  }

  public getSerializableConfig(): SerializablePlayerConfig {
    return {
      imageUrl: this.options.imageUrl,
      autoLoad: this.options.autoLoad !== false,
      showControls: this.options.showControls !== false,
      compass: this.options.compass === true,
      mouseZoom: this.options.mouseZoom !== false,
      doubleClickZoom: this.options.doubleClickZoom !== false,
      touchPanAndZoom: this.options.touchPanAndZoom !== false,
      colorFilters: this.getColorFilters(),
      initialView: this.getView(),
      brandingMode: this.options.brandingMode || 'branded',
      allowExternalLinks: this.options.allowExternalLinks !== false,
      nadir: this.options.nadir,
      hotspots: this.hotspots.map(({ options }) => {
        const serializable = { ...options };
        delete serializable.onClick;
        return serializable;
      }),
    };
  }

  public async exportOffline(options: OfflineExportOptions = {}): Promise<Blob> {
    const config = this.getSerializableConfig();
    const files: Record<string, Uint8Array> = {};
    const scriptUrl = options.playerScriptUrl || './360-image-player.standalone.umd.min.js';
    let offlineImageUrl = config.imageUrl;
    let offlineNadirUrl = config.nadir?.imageUrl;

    if (options.fetchAssets !== false) {
      const assets = [
        { url: config.imageUrl, name: `assets/panorama${this.extensionFromUrl(config.imageUrl, '.jpg')}` },
        ...(config.nadir?.imageUrl
          ? [{ url: config.nadir.imageUrl, name: `assets/nadir${this.extensionFromUrl(config.nadir.imageUrl, '.png')}` }]
          : []),
        { url: scriptUrl, name: '360-image-player.standalone.umd.min.js' },
      ];
      for (const asset of assets) {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error(`Unable to export asset: ${asset.url}`);
        files[asset.name] = new Uint8Array(await response.arrayBuffer());
        if (asset.url === config.imageUrl) offlineImageUrl = asset.name;
        if (asset.url === config.nadir?.imageUrl) offlineNadirUrl = asset.name;
      }
    }

    const exportedConfig: SerializablePlayerConfig = {
      ...config,
      imageUrl: offlineImageUrl,
      nadir: config.nadir
        ? { ...config.nadir, imageUrl: offlineNadirUrl || config.nadir.imageUrl }
        : undefined,
    };
    const configJson = JSON.stringify(exportedConfig, null, 2);
    files['config.json'] = strToU8(configJson);
    files['index.html'] = strToU8(this.buildOfflineHTML(exportedConfig, options.fetchAssets === false ? scriptUrl : './360-image-player.standalone.umd.min.js'));
    return new Blob([zipSync(files)], { type: 'application/zip' });
  }

  private extensionFromUrl(url: string, fallback: string): string {
    try {
      const extension = new URL(url, window.location.href).pathname.match(/\.[a-z0-9]+$/i)?.[0];
      return extension || fallback;
    } catch {
      return fallback;
    }
  }

  private buildOfflineHTML(config: SerializablePlayerConfig, scriptUrl: string): string {
    const serialized = JSON.stringify(config).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>360 Tour</title>
<style>html,body,#viewer{width:100%;height:100%;margin:0;background:#111}</style></head>
<body><div id="viewer"></div><script src="${scriptUrl}"></script><script>
const config=${serialized};
const player=new Image360Player.Image360Player({...config,container:document.getElementById('viewer')});
(config.hotspots||[]).forEach(hotspot=>player.addHTMLOverlay(hotspot));
</script></body></html>`;
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
    }
    if (this.xrSession) {
      void this.xrSession.end();
      this.xrSession = null;
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
    if (this.nadirMesh) this.nadirMesh.geometry.dispose();
    if (this.nadirMaterial) this.nadirMaterial.dispose();
    if (this.nadirTexture) this.nadirTexture.dispose();
    if (this.renderer) this.renderer.dispose();
    this.listeners = {};
    this.hotspots = [];
  }

  private triggerRedraw(): void {
    // With requestAnimationFrame / setAnimationLoop loop running continuously, redraw is implicit.
  }

  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch {
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
