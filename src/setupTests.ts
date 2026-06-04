import '@testing-library/jest-dom';

// Mock window.pannellum since it's a global dependency
(window as any).pannellum = {
  viewer: vi.fn().mockReturnValue({
    getYaw: vi.fn().mockReturnValue(45),
    getPitch: vi.fn().mockReturnValue(10),
    getHfov: vi.fn().mockReturnValue(90),
    destroy: vi.fn(),
  }),
};
