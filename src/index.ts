export interface Image360PlayerOptions {
  container: HTMLElement;
  imageUrl: string;
  autoLoad?: boolean;
  showControls?: boolean;
  compass?: boolean;
  mouseZoom?: boolean;
  doubleClickZoom?: boolean;
  touchPanAndZoom?: boolean; // Pannellum handles touch natively
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

  constructor(options: Image360PlayerOptions) {
    this.container = options.container;

    if (!this.checkWebGLSupport()) {
      this.renderFallback();
      return;
    }

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
