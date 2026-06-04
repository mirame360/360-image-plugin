import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.pannellum since it's a global dependency
(window as any).pannellum = {
  viewer: vi.fn().mockReturnValue({
    getYaw: vi.fn().mockReturnValue(45),
    getPitch: vi.fn().mockReturnValue(10),
    getHfov: vi.fn().mockReturnValue(90),
    addHotSpot: vi.fn(),
    removeHotSpot: vi.fn(),
    destroy: vi.fn(),
  }),
};

// Mock WebGL support for JSDOM
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
  if (contextType === 'webgl' || contextType === 'experimental-webgl') {
    return {}; // Mock a valid context
  }
  return null;
});

(window as any).WebGLRenderingContext = {};
