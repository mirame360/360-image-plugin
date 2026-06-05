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
  touchPanAndZoom?: boolean; // Pannellum handles touch natively
  colorFilters?: WebGL360ColorFilters;
}

export interface HotSpotOptions {
  yaw: number;
  pitch: number;
  id?: string;
  html: string;
  onClick?: (e: Event) => void;
}

export class Image360Player {
  private viewer: any;
  private container: HTMLElement;
  private options: Image360PlayerOptions;
  private gl: WebGLRenderingContext | null = null;
  private activeProgram: WebGLProgram | null = null;
  private programsWithFilters = new Map<WebGLProgram, any>();
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

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const self = this;
    HTMLCanvasElement.prototype.getContext = function (this: any, contextId: any, contextOptions?: any): any {
      const gl = originalGetContext.call(this, contextId, contextOptions);
      if (gl && (contextId === 'webgl' || contextId === 'experimental-webgl')) {
        self.setupWebGLInterceptors(gl as WebGLRenderingContext);
      }
      return gl;
    } as any;

    try {
      if (typeof (window as any).pannellum !== 'undefined') {
        this.viewer = (window as any).pannellum.viewer(this.container, {
          type: 'equirectangular',
          panorama: options.imageUrl,
          autoLoad: options.autoLoad ?? true,
          showControls: options.showControls ?? true,
          compass: options.compass ?? false,
          mouseZoom: options.mouseZoom ?? true,
          doubleClickZoom: options.doubleClickZoom ?? true,
          // Pinch-to-zoom and touch panning are enabled by default in Pannellum,
          // but we can ensure multi-res and smooth touch are handled well.
          draggable: options.touchPanAndZoom ?? true,
        });
      } else {
        console.error('Pannellum is not loaded.');
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  }

  /**
   * Updates the 360 image URL and reinitializes the viewer.
   */
  public setImageUrl(url: string): void {
    this.options.imageUrl = url;
    if (!this.checkWebGLSupport()) {
      this.renderFallback();
      return;
    }

    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    this.container.innerHTML = '';

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const self = this;
    HTMLCanvasElement.prototype.getContext = function (this: any, contextId: any, contextOptions?: any): any {
      const gl = originalGetContext.call(this, contextId, contextOptions);
      if (gl && (contextId === 'webgl' || contextId === 'experimental-webgl')) {
        self.setupWebGLInterceptors(gl as WebGLRenderingContext);
      }
      return gl;
    } as any;

    try {
      if (typeof (window as any).pannellum !== 'undefined') {
        this.viewer = (window as any).pannellum.viewer(this.container, {
          type: 'equirectangular',
          panorama: url,
          autoLoad: this.options.autoLoad ?? true,
          showControls: this.options.showControls ?? true,
          compass: this.options.compass ?? false,
          mouseZoom: this.options.mouseZoom ?? true,
          doubleClickZoom: this.options.doubleClickZoom ?? true,
          draggable: this.options.touchPanAndZoom ?? true,
        });
      } else {
        console.error('Pannellum is not loaded.');
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  }

  /**
   * Updates the color filters in real-time.
   */
  public setColorFilters(filters: WebGL360ColorFilters): void {
    this.filters = { ...this.filters, ...filters };
    if (this.gl && this.activeProgram && this.programsWithFilters.has(this.activeProgram)) {
      this.applyCurrentFilters(this.gl, this.activeProgram);
      this.triggerRedraw();
    }
  }

  /**
   * Gets the active color filters.
   */
  public getColorFilters(): Required<WebGL360ColorFilters> {
    return { ...this.filters };
  }

  private triggerRedraw(): void {
    if (this.viewer) {
      const renderer = this.viewer.getRenderer();
      if (renderer && typeof renderer.render === 'function') {
        try {
          const yaw = this.viewer.getYaw() * Math.PI / 180;
          const pitch = this.viewer.getPitch() * Math.PI / 180;
          const hfov = this.viewer.getHfov() * Math.PI / 180;
          renderer.render(yaw, pitch, hfov);
        } catch (e) {
          console.warn('Failed to trigger manual redraw on Pannellum renderer', e);
        }
      }
    }
  }

  private setupWebGLInterceptors(gl: WebGLRenderingContext): void {
    this.gl = gl;
    const self = this;
    
    // Intercept shaderSource to inject our filter code into the fragment shader
    const originalShaderSource = gl.shaderSource;
    if (originalShaderSource) {
      gl.shaderSource = function (shader, source) {
        const isFragmentShader = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER;
        if (isFragmentShader && (source.indexOf('texture2d') !== -1 || source.indexOf('texture2D') !== -1 || source.indexOf('textureCube') !== -1)) {
          const filterDef = `
            uniform float uExposure;
            uniform float uBrightness;
            uniform float uContrast;
            uniform float uSaturation;
            uniform float uTemperature;
            uniform float uTint;
            uniform float uHighlight;
            uniform float uShadow;

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
          `;
          
          let lastBrace = source.lastIndexOf('}');
          if (lastBrace !== -1) {
            source = filterDef + source.substring(0, lastBrace) + `
              gl_FragColor.rgb = applyFilters(gl_FragColor.rgb);
            }` + source.substring(lastBrace + 1);
          }
        }
        originalShaderSource.call(this, shader, source);
      };
    }

    // Intercept linkProgram to grab uniform locations
    const originalLinkProgram = gl.linkProgram;
    if (originalLinkProgram) {
      gl.linkProgram = function (program) {
        originalLinkProgram.call(this, program);
        
        const locExposure = gl.getUniformLocation(program, 'uExposure');
        if (locExposure !== null) {
          self.programsWithFilters.set(program, {
            locExposure,
            locBrightness: gl.getUniformLocation(program, 'uBrightness'),
            locContrast: gl.getUniformLocation(program, 'uContrast'),
            locSaturation: gl.getUniformLocation(program, 'uSaturation'),
            locTemperature: gl.getUniformLocation(program, 'uTemperature'),
            locTint: gl.getUniformLocation(program, 'uTint'),
            locHighlight: gl.getUniformLocation(program, 'uHighlight'),
            locShadow: gl.getUniformLocation(program, 'uShadow'),
          });
        }
      };
    }

    // Intercept useProgram to keep track of the active program and apply current filter values
    const originalUseProgram = gl.useProgram;
    if (originalUseProgram) {
      gl.useProgram = function (program) {
        originalUseProgram.call(this, program);
        self.activeProgram = program;
        if (program && self.programsWithFilters.has(program)) {
          self.applyCurrentFilters(gl, program);
        }
      };
    }
  }

  private applyCurrentFilters(gl: WebGLRenderingContext, program: WebGLProgram): void {
    const locs = this.programsWithFilters.get(program);
    if (!locs) return;

    gl.uniform1f(locs.locExposure, this.filters.exposure);
    gl.uniform1f(locs.locBrightness, this.filters.brightness);
    gl.uniform1f(locs.locContrast, this.filters.contrast);
    gl.uniform1f(locs.locSaturation, this.filters.saturation);
    gl.uniform1f(locs.locTemperature, this.filters.temperature);
    gl.uniform1f(locs.locTint, this.filters.tint);
    gl.uniform1f(locs.locHighlight, this.filters.highlight);
    gl.uniform1f(locs.locShadow, this.filters.shadow);
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

  /**
   * Injects a custom HTML element into the player at specific coordinates
   */
  public addHTMLOverlay(options: HotSpotOptions): void {
    if (!this.viewer) return;

    const id = options.id || `hotspot-${Math.random().toString(36).substr(2, 9)}`;

    const createTooltipFunc = (hotSpotDiv: HTMLElement, args: any) => {
      hotSpotDiv.innerHTML = args.html;
      hotSpotDiv.style.cursor = args.onClick ? 'pointer' : 'default';
      hotSpotDiv.classList.add('custom-html-hotspot');
      
      if (args.onClick) {
        hotSpotDiv.addEventListener('click', args.onClick);
      }
      
      // Stop events from propagating to the viewer so we don't accidentally pan when interacting with HTML
      hotSpotDiv.addEventListener('pointerdown', (e) => e.stopPropagation());
      hotSpotDiv.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
    };

    this.viewer.addHotSpot({
      id: id,
      pitch: options.pitch,
      yaw: options.yaw,
      createTooltipFunc: createTooltipFunc,
      createTooltipArgs: { html: options.html, onClick: options.onClick },
    });
  }

  public removeHTMLOverlay(id: string): void {
    if (this.viewer) {
      this.viewer.removeHotSpot(id);
    }
  }

  public getYaw(): number {
    return this.viewer ? this.viewer.getYaw() : 0;
  }

  public getPitch(): number {
    return this.viewer ? this.viewer.getPitch() : 0;
  }

  public getHfov(): number {
    return this.viewer ? this.viewer.getHfov() : 0;
  }

  public takeSnapshot(): Promise<Blob> {
    return Promise.resolve(new Blob());
  }

  public destroy(): void {
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    this.container.innerHTML = '';
  }
}

export * from './react/ReactImage360Player';
