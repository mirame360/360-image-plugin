import '@testing-library/jest-dom';
import { vi } from 'vitest';
import * as THREE from 'three';

(window as any).WebGLRenderingContext = {};

if (typeof window !== 'undefined') {
  Object.defineProperty(window.navigator, 'xr', {
    value: {
      isSessionSupported: vi.fn().mockResolvedValue(false),
      requestSession: vi.fn().mockResolvedValue({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
      }),
    },
    writable: true,
    configurable: true,
  });
}

HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
  if (contextType === 'webgl' || contextType === 'experimental-webgl') {
    return {};
  }
  return null;
});

// We mock the parts of 'three' that require WebGL/Canvas rendering, while keeping the rest.
vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof THREE>();

  const MockWebGLRenderer = vi.fn().mockImplementation(function (this: any) {
    const canvas = document.createElement('canvas');
    // Mock getContext on the canvas to avoid WebGL context issues
    canvas.getContext = vi.fn().mockImplementation((contextType: string) => {
      if (contextType === 'webgl' || contextType === 'experimental-webgl') {
        return {};
      }
      return null;
    });
    this.domElement = canvas;
    this.setSize = vi.fn();
    this.render = vi.fn();
    this.dispose = vi.fn();
    this.setPixelRatio = vi.fn();
    this.setAnimationLoop = vi.fn();
    this.xr = {
      enabled: false,
      setSession: vi.fn(),
      getSession: vi.fn().mockReturnValue(null),
    };
    return this;
  });

  const MockTextureLoader = vi.fn().mockImplementation(function (this: any) {
    this.setCrossOrigin = vi.fn().mockReturnThis();
    this.load = vi.fn().mockImplementation((url: string, onLoad?: (texture: any) => void) => {
      const mockTexture = {
        dispose: vi.fn(),
        colorSpace: '',
        minFilter: 0,
        magFilter: 0,
        generateMipmaps: false,
      };
      if (onLoad) {
        // Invoke synchronously for deterministic test execution
        onLoad(mockTexture);
      }
      return mockTexture;
    });
    return this;
  });

  return {
    ...original,
    WebGLRenderer: MockWebGLRenderer,
    TextureLoader: MockTextureLoader,
  };
});
