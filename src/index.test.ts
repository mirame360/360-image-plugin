import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { strFromU8, unzipSync } from 'fflate';
import { Image360Player } from './index';

describe('Image360Player', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    container.remove();
    vi.unstubAllGlobals();
  });

  it('should initialize and append canvas with default options', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    // Check that WebGLRenderer was constructed
    expect(THREE.WebGLRenderer).toHaveBeenCalled();

    // Check that canvas is appended to container
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    // Check default values
    expect(player.getYaw()).toBe(0);
    expect(player.getPitch()).toBe(0);
    expect(player.getHfov()).toBe(90);
  });

  it('claims touch gestures so mobile drags pan the panorama instead of the page', () => {
    new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const canvas = container.querySelector('canvas');
    expect(container.style.touchAction).toBe('none');
    expect(canvas?.style.touchAction).toBe('none');
  });

  it('resets to the configured initial view', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      initialView: { yaw: 15, pitch: -5, hfov: 105 },
    });
    player.setView({ yaw: 60, pitch: 20, hfov: 50 });

    const resetButton = container.querySelector<HTMLButtonElement>('[aria-label="Reset view"]');
    resetButton?.click();

    expect(player.getView()).toEqual({ yaw: 15, pitch: -5, hfov: 105 });
  });

  it('should pass custom options and initialize color filters', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      colorFilters: {
        exposure: 0.5,
        brightness: 0.1,
      }
    });

    expect(player.getColorFilters()).toEqual({
      exposure: 0.5,
      brightness: 0.1,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
      highlight: 0,
      shadow: 0,
    });
  });

  it('should update color filters correctly via setColorFilters', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
    });

    player.setColorFilters({
      exposure: -0.2,
      contrast: 1.2,
    });

    expect(player.getColorFilters()).toEqual({
      exposure: -0.2,
      brightness: 0,
      contrast: 1.2,
      saturation: 1,
      temperature: 0,
      tint: 0,
      highlight: 0,
      shadow: 0,
    });
  });

  it('should update the image URL and load the new texture', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test1.jpg'
    });

    const loaderMock = vi.mocked(THREE.TextureLoader);
    expect(loaderMock).toHaveBeenCalledTimes(1);
    const firstLoaderInstance = loaderMock.mock.results[0].value;
    expect(firstLoaderInstance.load).toHaveBeenCalledWith(
      'test1.jpg',
      expect.any(Function),
      undefined,
      expect.any(Function)
    );

    player.setImageUrl('test2.jpg');
    expect(loaderMock).toHaveBeenCalledTimes(2);
    const secondLoaderInstance = loaderMock.mock.results[1].value;
    expect(secondLoaderInstance.load).toHaveBeenCalledWith(
      'test2.jpg',
      expect.any(Function),
      undefined,
      expect.any(Function)
    );
  });

  it('tries ordered panorama sources until one loads', () => {
    const attemptedUrls: string[] = [];
    vi.mocked(THREE.TextureLoader).mockImplementationOnce(function (this: any) {
      this.setCrossOrigin = vi.fn().mockReturnThis();
      this.load = vi.fn((url, onLoad, _onProgress, onError) => {
        attemptedUrls.push(url);
        if (url.endsWith('.webp')) {
          onError?.(new Error('unsupported image'));
        } else {
          onLoad?.({
            dispose: vi.fn(),
            colorSpace: '',
            minFilter: 0,
            magFilter: 0,
            generateMipmaps: true,
          });
        }
      });
      return this;
    } as any);

    new Image360Player({
      container,
      imageUrl: [' panorama.webp ', 'panorama.webp', '', 'panorama.jpeg'],
    });

    expect(attemptedUrls).toEqual(['panorama.webp', 'panorama.jpeg']);
  });

  it('emits one error only after every panorama source fails', () => {
    vi.mocked(THREE.TextureLoader).mockImplementationOnce(function (this: any) {
      this.setCrossOrigin = vi.fn().mockReturnThis();
      this.load = vi.fn((_url, _onLoad, _onProgress, onError) => {
        onError?.(new Error('load failed'));
      });
      return this;
    } as any);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const player = new Image360Player({
      container,
      imageUrl: ['first.webp', 'second.jpeg'],
      autoLoad: false,
    });
    const errorListener = vi.fn();
    player.on('error', errorListener);

    player.load();

    expect(errorListener).toHaveBeenCalledOnce();
    expect(errorListener.mock.calls[0][0]).toMatchObject({
      message: 'Failed to load panorama texture from 2 image sources',
    });
    consoleError.mockRestore();
  });

  it('ignores a late texture result after the ordered source list changes', () => {
    const completions: Array<(texture: any) => void> = [];
    const deferredLoader = function (this: any) {
        this.setCrossOrigin = vi.fn().mockReturnThis();
        this.load = vi.fn((_url, onLoad) => {
          completions.push(onLoad);
        });
        return this;
      } as any;
    vi.mocked(THREE.TextureLoader)
      .mockImplementationOnce(deferredLoader)
      .mockImplementationOnce(deferredLoader);
    const player = new Image360Player({ container, imageUrl: ['old.webp', 'old.jpeg'], autoLoad: false });
    const oldTexture = { dispose: vi.fn(), colorSpace: '', minFilter: 0, magFilter: 0, generateMipmaps: true };
    const newTexture = { dispose: vi.fn(), colorSpace: '', minFilter: 0, magFilter: 0, generateMipmaps: true };

    player.load();
    player.setImageUrl(['new.webp', 'new.jpeg']);
    completions[1](newTexture);
    completions[0](oldTexture);

    expect((player as any).material.uniforms.map.value).toBe(newTexture);
    expect(oldTexture.dispose).toHaveBeenCalledOnce();
  });

  it('keeps panorama textures in raw color space for neutral rendering', () => {
    new Image360Player({
      container,
      imageUrl: 'color-managed.jpg'
    });

    const loaderMock = vi.mocked(THREE.TextureLoader);
    const loaderInstance = loaderMock.mock.results[0].value;
    const loadedTexture = loaderInstance.load.mock.results[0].value;

    expect(loadedTexture.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('should add and remove HTML hotspot overlays', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const onClickMock = vi.fn();
    player.addHTMLOverlay({
      id: 'hotspot-1',
      yaw: 45,
      pitch: 10,
      html: '<div class="my-hotspot">Hello</div>',
      onClick: onClickMock
    });

    // Check that hotspot HTML is in the DOM
    const hotspotEl = container.querySelector('.my-hotspot');
    expect(hotspotEl).toBeInTheDocument();
    expect(hotspotEl?.textContent).toBe('Hello');

    // Remove hotspot
    player.removeHTMLOverlay('hotspot-1');
    expect(container.querySelector('.my-hotspot')).not.toBeInTheDocument();
  });

  it('should generate default styled info hotspot if html option is omitted', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    player.addHTMLOverlay({
      id: 'hotspot-default',
      yaw: -30,
      pitch: -5,
      text: 'Click here for details'
    });

    // Default hotspot has class 'default-hotspot-marker'
    const marker = container.querySelector('.default-hotspot-marker');
    expect(marker).toBeInTheDocument();
    
    const tooltip = container.querySelector('.default-hotspot-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip?.textContent?.trim()).toBe('Click here for details');
  });

  it('should trigger events via the Event Emitter system', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const loadCallback = vi.fn();
    const viewchangeCallback = vi.fn();
    const zoomCallback = vi.fn();

    player.on('load', loadCallback);
    player.on('viewchange', viewchangeCallback);
    player.on('zoom', zoomCallback);

    // Trigger texture load manually or through API
    player.setImageUrl('new-image.jpg');
    expect(loadCallback).toHaveBeenCalled();

    // Dispatch a wheel event to trigger viewchange and zoom events
    const canvas = container.querySelector('canvas')!;
    const wheelEvent = new WheelEvent('wheel', { deltaY: 20 });
    canvas.dispatchEvent(wheelEvent);

    expect(zoomCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        hfov: 91
      })
    );
    expect(viewchangeCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        yaw: 0,
        pitch: 0,
        hfov: 91
      })
    );

    // Unregister callback
    player.off('load', loadCallback);
    loadCallback.mockClear();

    player.setImageUrl('another-image.jpg');
    expect(loadCallback).not.toHaveBeenCalled();
  });

  it('should enable XR on the renderer and create a VR button if WebXR is supported', async () => {
    vi.mocked(navigator.xr!.isSessionSupported).mockResolvedValue(true);

    new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    // Allow promise resolution for isSessionSupported
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(navigator.xr!.isSessionSupported).toHaveBeenCalledWith('immersive-vr');
    const vrButton = container.querySelector('.webxr-vr-button');
    expect(vrButton).toBeInTheDocument();
    expect(vrButton?.textContent?.trim()).toBe('Enter VR');

    vi.mocked(navigator.xr!.isSessionSupported).mockResolvedValue(false);
  });

  it('should update velocity and trigger inertial glide on pointer release', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const canvas = container.querySelector('canvas')!;

    // Simulate drag interaction
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 100 }));

    expect((player as any).isInertialGliding).toBe(true);
    expect((player as any).velocityYaw).not.toBe(0);
  });

  it('elastically caps extreme flick velocity', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const canvas = container.querySelector('canvas')!;

    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 10000, clientY: 10000 }));

    expect(Math.abs((player as any).velocityYaw)).toBeLessThanOrEqual(0.18);
    expect(Math.abs((player as any).velocityPitch)).toBeLessThanOrEqual(0.12);

    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 10000, clientY: 10000 }));
    expect((player as any).isInertialGliding).toBe(true);
  });

  it('stops auto-rotation as soon as the user interacts', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const canvas = container.querySelector('canvas')!;

    player.startAutoRotate(2);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
    expect((player as any).autoRotateSpeed).toBe(0);
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }));

    player.startAutoRotate(2);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    expect((player as any).autoRotateSpeed).toBe(0);

    player.startAutoRotate(2);
    canvas.dispatchEvent(new MouseEvent('dblclick'));
    expect((player as any).autoRotateSpeed).toBe(0);
  });

  it('should emit click event with raycast coordinates on click', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const clickCallback = vi.fn();
    player.on('click', clickCallback);

    const canvas = container.querySelector('canvas')!;

    // Simulate pointer click (pointerdown and pointerup at same location quickly)
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 }));

    expect(clickCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        yaw: expect.any(Number),
        pitch: expect.any(Number),
        event: expect.any(PointerEvent)
      })
    );
  });

  it('should render fallback message if WebGL is not supported', () => {
    const originalWebGL = window.WebGLRenderingContext;
    delete (window as any).WebGLRenderingContext;

    const fallbackContainer = document.createElement('div');
    document.body.appendChild(fallbackContainer);

    new Image360Player({
      container: fallbackContainer,
      imageUrl: 'test.jpg'
    });

    expect(fallbackContainer.textContent).toContain('WebGL Not Supported');

    fallbackContainer.remove();
    (window as any).WebGLRenderingContext = originalWebGL;
  });

  it('should toggle HFOV on double click', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    expect(player.getHfov()).toBe(90);

    const canvas = container.querySelector('canvas')!;
    canvas.dispatchEvent(new MouseEvent('dblclick'));

    expect(player.getHfov()).toBe(40);

    canvas.dispatchEvent(new MouseEvent('dblclick'));
    expect(player.getHfov()).toBe(90);
  });

  it('should open URL when default styled hyperlink hotspot is clicked', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    player.addHTMLOverlay({
      id: 'hotspot-link',
      yaw: 45,
      pitch: 0,
      text: 'Link',
      url: 'https://example.com',
      target: '_blank'
    });

    const marker = container.querySelector('.default-hotspot-container')!;
    expect(marker).toBeInTheDocument();

    marker.dispatchEvent(new MouseEvent('click'));

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank');
    openSpy.mockRestore();
  });

  it('should emit hotspotclick event when a hotspot is clicked', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const clickSpy = vi.fn();
    player.on('hotspotclick', clickSpy);

    player.addHTMLOverlay({
      id: 'test-hotspot-event',
      yaw: 45,
      pitch: 0,
      text: 'Click tracking',
      url: 'https://example.com'
    });

    const marker = container.querySelector('.default-hotspot-container')!;
    marker.dispatchEvent(new MouseEvent('click'));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'test-hotspot-event',
      yaw: 45,
      pitch: 0,
      text: 'Click tracking',
      url: 'https://example.com'
    }));
  });

  it('should update ShaderMaterial uniforms when setColorFilters is called', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    player.setColorFilters({
      exposure: 1.5,
      brightness: -0.5,
    });

    const uniforms = (player as any).material.uniforms;
    expect(uniforms.uExposure.value).toBe(1.5);
    expect(uniforms.uBrightness.value).toBe(-0.5);
  });

  it('should request and end WebXR session when VR button is toggled', async () => {
    vi.mocked(navigator.xr!.isSessionSupported).mockResolvedValue(true);

    const mockSession = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(navigator.xr!.requestSession).mockResolvedValue(mockSession as any);

    new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const vrButton = container.querySelector('.webxr-vr-button') as HTMLButtonElement;
    expect(vrButton).toBeInTheDocument();

    vrButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(navigator.xr!.requestSession).toHaveBeenCalledWith('immersive-vr');
    expect(vrButton.querySelector('span')?.textContent).toBe('Exit VR');

    vrButton.click();
    expect(mockSession.end).toHaveBeenCalled();

    const onEndCallback = mockSession.addEventListener.mock.calls.find((call: any) => call[0] === 'end')?.[1];
    expect(onEndCallback).toBeDefined();
    onEndCallback();

    expect(vrButton.querySelector('span')?.textContent).toBe('Enter VR');

    vi.mocked(navigator.xr!.isSessionSupported).mockResolvedValue(false);
  });

  it('should resolve takeSnapshot with a Blob', async () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const canvas = container.querySelector('canvas')!;
    const mockBlob = new Blob([''], { type: 'image/png' });
    canvas.toBlob = vi.fn().mockImplementation((callback) => {
      callback(mockBlob);
    });

    const blob = await player.takeSnapshot();
    expect(blob).toBe(mockBlob);
  });

  it('should clean up and dispose Three.js objects on destroy', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    const rendererMock = vi.mocked(THREE.WebGLRenderer);
    const rendererInstance = rendererMock.mock.results[0].value;

    player.destroy();

    // Check that container was cleared
    expect(container.innerHTML).toBe('');
    // Check that renderer.dispose was called
    expect(rendererInstance.dispose).toHaveBeenCalled();
  });

  it('honors autoLoad=false and supports explicit loading', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'lazy.jpg',
      autoLoad: false,
    });

    expect(THREE.TextureLoader).not.toHaveBeenCalled();
    player.load();
    expect(THREE.TextureLoader).toHaveBeenCalledTimes(1);
  });

  it('renders controls and compass when enabled', () => {
    new Image360Player({
      container,
      imageUrl: 'test.jpg',
      showControls: true,
      compass: true,
    });

    expect(container.querySelectorAll('.image360-control-button')).toHaveLength(3);
    expect(container.querySelector('.image360-compass')).toBeInTheDocument();
  });

  it('sets and clamps the viewport through the public API', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    player.setView({ yaw: 240, pitch: 100, hfov: 5 });

    expect(player.getView()).toEqual({ yaw: -120, pitch: 85, hfov: 30 });
  });

  it('reprojects hotspots with the latest camera matrix after setView', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    player.addHTMLOverlay({
      id: 'target',
      yaw: 90,
      pitch: 10,
      text: 'Target',
    });

    player.setView({ yaw: 90, pitch: 10 });

    const hotspot = container.querySelector<HTMLElement>('.default-hotspot-container');
    expect(Number.parseFloat(hotspot?.style.left || '')).toBeCloseTo(400);
    expect(Number.parseFloat(hotspot?.style.top || '')).toBeCloseTo(300);
  });

  it('sanitizes custom hotspot HTML', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    player.addHTMLOverlay({
      id: 'unsafe',
      yaw: 0,
      pitch: 0,
      html: '<button onclick="alert(1)">Safe</button><script>alert(2)</script>',
    });

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('button')?.hasAttribute('onclick')).toBe(false);
  });

  it('supports quiz unlocks and product cart events', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const quizSpy = vi.fn();
    const cartSpy = vi.fn();
    player.on('quizanswer', quizSpy);
    player.on('addtocart', cartSpy);
    player.addHTMLOverlay({
      id: 'quiz',
      type: 'quiz',
      yaw: 0,
      pitch: 0,
      unlocks: ['product'],
      quizChoices: [{ id: 'yes', label: 'Yes', correct: true }],
    });
    player.addHTMLOverlay({
      id: 'product',
      type: 'product',
      yaw: 10,
      pitch: 0,
      requires: ['product'],
      product: { id: 'sku-1', title: 'Chair', price: '$99' },
    });

    expect(player.answerQuiz('quiz', 'yes')).toBe(true);
    expect(quizSpy).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
    expect(player.getGameState().unlockedHotspots).toContain('product');

    const productHotspots = Array.from(container.querySelectorAll('.default-hotspot-container'));
    const product = productHotspots[productHotspots.length - 1];
    product.dispatchEvent(new MouseEvent('click'));
    expect(cartSpy).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({ id: 'sku-1' }),
    }));
  });

  it('requests a server snapshot with the current viewport', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ url: '/media/snapshot.jpg' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    player.setView({ yaw: 20, pitch: -5, hfov: 70 });

    await expect(player.requestSnapshot({ endpoint: '/api/media/1/snapshot/' }))
      .resolves.toEqual({ url: '/media/snapshot.jpg' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      yaw: 20,
      pitch: -5,
      hfov: 70,
      width: 3840,
      height: 2160,
    }));
  });

  it('serializes configuration without callback functions', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    player.addHTMLOverlay({
      id: 'serializable',
      yaw: 0,
      pitch: 0,
      onClick: vi.fn(),
    });

    const config = player.getSerializableConfig();
    expect(config.hotspots[0].onClick).toBeUndefined();
    expect(JSON.stringify(config)).toContain('serializable');
  });

  it('renders and removes a nadir cover', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      nadir: { imageUrl: 'logo.png', radius: 40 },
    });

    expect((player as any).nadirMesh).toBeDefined();
    player.setNadirCover(undefined);
    expect((player as any).nadirMesh).toBeUndefined();
  });

  it('hides branded hotspots in unbranded mode', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      brandingMode: 'unbranded',
    });
    player.addHTMLOverlay({ id: 'branded', yaw: 0, pitch: 0, text: 'Brand' });
    player.addHTMLOverlay({ id: 'mls-safe', yaw: 0, pitch: 0, text: 'Safe', branded: false });

    const hotspots = container.querySelectorAll('.default-hotspot-container');
    expect((hotspots[0] as HTMLElement).style.display).toBe('none');
    expect((hotspots[1] as HTMLElement).style.display).not.toBe('none');
  });

  it('creates an offline ZIP blob from serializable state', async () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const zip = await player.exportOffline({ fetchAssets: false });

    expect(zip).toBeInstanceOf(Blob);
    expect(zip.type).toBe('application/zip');
    expect(zip.size).toBeGreaterThan(0);
  });

  it('uses zoom and reset controls and rotates the compass', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      showControls: true,
      compass: true,
    });
    const buttons = container.querySelectorAll<HTMLButtonElement>('.image360-control-button');

    buttons[0].click();
    expect(player.getHfov()).toBe(80);
    buttons[1].click();
    expect(player.getHfov()).toBe(90);

    player.setView({ yaw: 45, pitch: 10, hfov: 60 });
    expect((container.querySelector('.image360-compass') as HTMLElement).style.transform)
      .toBe('rotate(-45deg)');
    buttons[2].click();
    expect(player.getView()).toEqual({ yaw: 0, pitch: 0, hfov: 90 });
  });

  it('uses a custom HTML sanitizer when provided', () => {
    const sanitizer = vi.fn().mockReturnValue('<strong>clean</strong>');
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      sanitizeHTML: sanitizer,
    });

    player.addHTMLOverlay({ yaw: 0, pitch: 0, html: '<script>bad()</script>' });

    expect(sanitizer).toHaveBeenCalledWith('<script>bad()</script>');
    expect(container.querySelector('strong')?.textContent).toBe('clean');
  });

  it('blocks external links when disabled or while unbranded', () => {
    const openSpy = vi.spyOn(window, 'open');
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      allowExternalLinks: false,
    });
    player.addHTMLOverlay({ id: 'link', yaw: 0, pitch: 0, url: 'https://example.com' });
    (container.querySelector('.default-hotspot-container') as HTMLElement).click();
    expect(openSpy).not.toHaveBeenCalled();

    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    const unbranded = new Image360Player({
      container: secondContainer,
      imageUrl: 'test.jpg',
      brandingMode: 'unbranded',
    });
    unbranded.addHTMLOverlay({
      id: 'safe-link',
      yaw: 0,
      pitch: 0,
      url: 'https://example.com',
      branded: false,
    });
    (secondContainer.querySelector('.default-hotspot-container') as HTMLElement).click();
    expect(openSpy).not.toHaveBeenCalled();
    unbranded.destroy();
    secondContainer.remove();
  });

  it('handles incorrect quiz answers, clues, duplicate unlocks, and restored state', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const clueSpy = vi.fn();
    const unlockSpy = vi.fn();
    player.on('cluediscovered', clueSpy);
    player.on('unlock', unlockSpy);
    player.addHTMLOverlay({
      id: 'quiz',
      type: 'quiz',
      yaw: 0,
      pitch: 0,
      quizChoices: [{ id: 'wrong', label: 'Wrong' }],
      unlocks: ['door'],
    });
    player.addHTMLOverlay({
      id: 'clue',
      type: 'clue',
      yaw: 5,
      pitch: 0,
      clueId: 'key',
      unlocks: ['door'],
    });

    expect(player.answerQuiz('missing', 'wrong')).toBe(false);
    expect(player.answerQuiz('quiz', 'missing')).toBe(false);
    expect(player.answerQuiz('quiz', 'wrong')).toBe(false);
    expect(player.getGameState().unlockedHotspots).toEqual([]);

    const clue = container.querySelectorAll<HTMLElement>('.default-hotspot-container')[1];
    clue.click();
    clue.click();
    expect(clueSpy).toHaveBeenCalledTimes(1);
    expect(unlockSpy).toHaveBeenCalledTimes(1);

    player.setGameState({
      discoveredClues: ['saved-clue'],
      unlockedHotspots: ['saved-door'],
      answeredQuizzes: { quiz: 'wrong' },
    });
    expect(player.getGameState()).toEqual({
      discoveredClues: ['saved-clue'],
      unlockedHotspots: ['saved-door'],
      answeredQuizzes: { quiz: 'wrong' },
    });
  });

  it('returns binary snapshot responses and emits lifecycle events', async () => {
    const blob = new Blob(['snapshot'], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      blob: vi.fn().mockResolvedValue(blob),
    }));
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const startSpy = vi.fn();
    const completeSpy = vi.fn();
    player.on('snapshotstart', startSpy);
    player.on('snapshotcomplete', completeSpy);

    await expect(player.requestSnapshot({ endpoint: '/snapshot' })).resolves.toEqual({ blob });
    expect(startSpy).toHaveBeenCalledWith({ viewport: player.getView() });
    expect(completeSpy).toHaveBeenCalledWith({ viewport: player.getView(), blob });
  });

  it('reports snapshot HTTP and JSON errors', async () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    await expect(player.requestSnapshot()).rejects.toThrow('A snapshot endpoint is required');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ detail: 'Invalid viewport' }),
    }));
    await expect(player.requestSnapshot({ endpoint: '/snapshot' }))
      .rejects.toThrow('Invalid viewport');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new Error('not json')),
    }));
    await expect(player.requestSnapshot({ endpoint: '/snapshot' }))
      .rejects.toThrow('Snapshot request failed (500)');
  });

  it('polls pending snapshot tasks until completion', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ status_url: '/snapshot/status' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'pending' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'complete', url: '/done.jpg' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });

    const request = player.requestSnapshot({ endpoint: '/snapshot' });
    await vi.runAllTimersAsync();
    await expect(request).resolves.toEqual({ url: '/done.jpg' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('rejects failed, aborted, and timed-out snapshot polling', async () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ status: 'failed', detail: 'Worker failed' }),
    }));
    await expect((player as any).pollSnapshot('/status', {})).rejects.toThrow('Worker failed');

    vi.useFakeTimers();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'pending' }),
    }));
    const aborted = (player as any).pollSnapshot('/status', {}, controller.signal);
    const abortedExpectation = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await vi.runAllTimersAsync();
    await abortedExpectation;

    const timedOut = (player as any).pollSnapshot('/status', {});
    const timeoutExpectation = expect(timedOut).rejects.toThrow('Snapshot generation timed out');
    await vi.runAllTimersAsync();
    await timeoutExpectation;
    vi.useRealTimers();
  });

  it('exports fetched assets and reports asset failures', async () => {
    const player = new Image360Player({
      container,
      imageUrl: 'https://cdn.example.com/pano.webp',
      nadir: { imageUrl: 'https://cdn.example.com/logo.png' },
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(url).buffer),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const blob = await player.exportOffline({
      playerScriptUrl: 'https://cdn.example.com/player.js',
      fetchAssets: true,
    });
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(archive).sort()).toEqual([
      '360-image-player.standalone.umd.min.js',
      'assets/nadir.png',
      'assets/panorama.webp',
      'config.json',
      'index.html',
    ]);
    const config = JSON.parse(strFromU8(archive['config.json']));
    expect(config.imageUrl).toBe('assets/panorama.webp');
    expect(config.nadir.imageUrl).toBe('assets/nadir.png');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(player.exportOffline({ playerScriptUrl: '/player.js' }))
      .rejects.toThrow('Unable to export panorama');
  });

  it('exports the first reachable panorama source from an ordered list', async () => {
    const player = new Image360Player({
      container,
      imageUrl: ['https://cdn.example.com/pano.webp', 'https://cdn.example.com/pano.jpeg'],
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({
      ok: !url.endsWith('.webp'),
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(url).buffer),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const blob = await player.exportOffline({
      playerScriptUrl: 'https://cdn.example.com/player.js',
      fetchAssets: true,
    });
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const config = JSON.parse(strFromU8(archive['config.json']));

    expect(Object.keys(archive)).toContain('assets/panorama.jpeg');
    expect(config.imageUrl).toBe('assets/panorama.jpeg');
  });

  it('disposes asynchronously loaded textures after destruction', () => {
    let finishLoad: ((texture: any) => void) | undefined;
    const texture = { dispose: vi.fn() };
    vi.mocked(THREE.TextureLoader).mockImplementationOnce(function (this: any) {
      this.setCrossOrigin = vi.fn().mockReturnThis();
      this.load = vi.fn((_url, onLoad) => {
        finishLoad = onLoad;
        return texture;
      });
      return this;
    } as any);
    const player = new Image360Player({ container, imageUrl: 'late.jpg' });
    player.destroy();
    finishLoad?.(texture);
    expect(texture.dispose).toHaveBeenCalled();
  });

  it('ends an active XR session and disposes nadir resources on destroy', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      nadir: { imageUrl: 'logo.png' },
    });
    const session = { end: vi.fn().mockResolvedValue(undefined) };
    (player as any).xrSession = session;
    const nadirTexture = (player as any).nadirTexture;
    const nadirMaterial = (player as any).nadirMaterial;
    const nadirGeometry = (player as any).nadirMesh.geometry;
    const materialDispose = vi.spyOn(nadirMaterial, 'dispose');
    const geometryDispose = vi.spyOn(nadirGeometry, 'dispose');

    player.destroy();

    expect(session.end).toHaveBeenCalled();
    expect(nadirTexture.dispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    expect(geometryDispose).toHaveBeenCalled();
  });

  it('covers individual viewport setters and optional UI disablement', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      showControls: false,
      compass: false,
    });
    player.setYaw(-30);
    player.setPitch(-100);
    player.setHfov(200);

    expect(player.getView()).toEqual({ yaw: -30, pitch: -85, hfov: 120 });
    expect(container.querySelector('.image360-controls')).not.toBeInTheDocument();
    expect(container.querySelector('.image360-compass')).not.toBeInTheDocument();
  });

  it('suspends rendering and supports controlled auto rotation', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const rendererMock = vi.mocked(THREE.WebGLRenderer);
    const rendererInstance = rendererMock.mock.results[0].value;
    const animationLoop = rendererInstance.setAnimationLoop.mock.calls[0][0];

    player.setRenderingActive(false);
    expect(rendererInstance.setAnimationLoop).toHaveBeenLastCalledWith(null);

    player.startAutoRotate(3);
    expect(rendererInstance.setAnimationLoop).toHaveBeenLastCalledWith(animationLoop);

    const initialYaw = player.getYaw();
    (player as any).lastFrameTime = Date.now() - 50;
    (player as any).lastRenderTime = 0;
    animationLoop();
    expect(player.getYaw()).toBeGreaterThan(initialYaw);

    player.stopAutoRotate();
    const stoppedYaw = player.getYaw();
    (player as any).lastFrameTime = Date.now() - 50;
    animationLoop();
    expect(player.getYaw()).toBe(stoppedYaw);
  });

  it('disposes stale nadir loads and clamps nadir rendering options', () => {
    const callbacks: Array<(texture: any) => void> = [];
    vi.mocked(THREE.TextureLoader).mockImplementation(function (this: any) {
      this.setCrossOrigin = vi.fn().mockReturnThis();
      this.load = vi.fn((_url, onLoad) => {
        callbacks.push(onLoad);
      });
      return this;
    } as any);
    const player = new Image360Player({ container, imageUrl: 'test.jpg', autoLoad: false });
    const firstTexture = { dispose: vi.fn() };
    const secondTexture = { dispose: vi.fn(), colorSpace: '' };

    player.setNadirCover({ imageUrl: 'first.png' });
    player.setNadirCover({ imageUrl: 'second.png', radius: 500, opacity: 2, rotation: 45 });
    callbacks[0](firstTexture);
    callbacks[1](secondTexture);

    expect(firstTexture.dispose).toHaveBeenCalled();
    expect(secondTexture.dispose).not.toHaveBeenCalled();
    expect((player as any).nadirMesh.rotation.z).toBeCloseTo(Math.PI / 4);
    expect((player as any).nadirMaterial.opacity).toBe(1);
  });

  it('renders product and quiz UI including hover and answer interaction', () => {
    const player = new Image360Player({ container, imageUrl: 'test.jpg' });
    const quizSpy = vi.fn();
    player.on('quizanswer', quizSpy);
    player.addHTMLOverlay({
      id: 'product-ui',
      type: 'product',
      yaw: 0,
      pitch: 0,
      text: 'Product',
      product: {
        id: 'sku',
        title: 'Lamp',
        price: '$20',
        imageUrl: 'lamp.jpg',
      },
    });
    player.addHTMLOverlay({
      id: 'quiz-ui',
      type: 'quiz',
      yaw: 10,
      pitch: 0,
      title: 'Choose',
      text: 'Question',
      quizChoices: [{ id: 'a', label: 'Answer', correct: true }],
    });

    const product = container.querySelectorAll<HTMLElement>('.default-hotspot-container')[0];
    expect(product.querySelector('img')?.getAttribute('src')).toBe('lamp.jpg');
    expect(product.textContent).toContain('Lamp');
    expect(product.textContent).toContain('$20');
    product.dispatchEvent(new MouseEvent('mouseenter'));
    expect((product.querySelector('.default-hotspot-tooltip') as HTMLElement).style.opacity).toBe('1');
    product.dispatchEvent(new MouseEvent('mouseleave'));
    expect((product.querySelector('.default-hotspot-tooltip') as HTMLElement).style.opacity).toBe('0');

    const quiz = container.querySelectorAll<HTMLElement>('.default-hotspot-container')[1];
    (quiz.querySelector('button') as HTMLButtonElement).click();
    expect(quizSpy).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });

  it('merges snapshot headers and sends custom output options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ url: '/snapshot.webp' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      snapshotEndpoint: '/default-snapshot',
      snapshotHeaders: { Authorization: 'Bearer token', 'X-Shared': 'default' },
    });

    await player.requestSnapshot({
      mediaId: 'media-1',
      width: 1000,
      height: 500,
      quality: 0.5,
      format: 'webp',
      headers: { 'X-Shared': 'override' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/default-snapshot', expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
        'X-Shared': 'override',
      },
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      media_id: 'media-1',
      width: 1000,
      height: 500,
      quality: 0.5,
      format: 'webp',
    }));
  });

  it('creates safe offline HTML with a custom external script URL', async () => {
    const player = new Image360Player({ container, imageUrl: 'not a valid url%' });
    player.addHTMLOverlay({ yaw: 0, pitch: 0, text: '</script><script>bad()</script>' });
    const zip = await player.exportOffline({
      fetchAssets: false,
      playerScriptUrl: 'https://cdn.example.com/player.js',
    });
    const archive = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    const html = strFromU8(archive['index.html']);

    expect(html).not.toContain('</script><script>bad()');
    expect(html).toContain('https://cdn.example.com/player.js');
  });
});
