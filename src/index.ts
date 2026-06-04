export interface Image360PlayerOptions {
  container: HTMLElement;
  imageUrl: string;
  autoLoad?: boolean;
  showControls?: boolean;
  compass?: boolean;
}

export class Image360Player {
  private viewer: any;
  private container: HTMLElement;

  constructor(options: Image360PlayerOptions) {
    this.container = options.container;
    // Assuming pannellum is available globally for now, or we can import it later
    if (typeof (window as any).pannellum !== 'undefined') {
      this.viewer = (window as any).pannellum.viewer(this.container, {
        type: 'equirectangular',
        panorama: options.imageUrl,
        autoLoad: options.autoLoad ?? true,
        showControls: options.showControls ?? true,
        compass: options.compass ?? false,
      });
    } else {
      console.error('Pannellum is not loaded.');
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
    // This is where we will integrate the snapshot feature
    // For now, it just returns a mock promise
    return Promise.resolve(new Blob());
  }

  public destroy(): void {
    if (this.viewer) {
      this.viewer.destroy();
    }
  }
}

export * from './react/ReactImage360Player';
