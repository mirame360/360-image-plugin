import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Image360Player } from './index';

describe('Image360Player', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  it('should initialize Pannellum viewer with default options', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    expect((window as any).pannellum.viewer).toHaveBeenCalledWith(container, {
      type: 'equirectangular',
      panorama: 'test.jpg',
      autoLoad: true,
      showControls: true,
      compass: false,
      mouseZoom: true,
      doubleClickZoom: true,
      draggable: true,
    });
  });

  it('should pass custom options to Pannellum viewer', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg',
      autoLoad: false,
      showControls: false,
      compass: true,
      mouseZoom: false,
      doubleClickZoom: false,
      touchPanAndZoom: false,
    });

    expect((window as any).pannellum.viewer).toHaveBeenCalledWith(container, {
      type: 'equirectangular',
      panorama: 'test.jpg',
      autoLoad: false,
      showControls: false,
      compass: true,
      mouseZoom: false,
      doubleClickZoom: false,
      draggable: false,
    });
  });

  it('should proxy coordinate methods to the viewer', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });

    expect(player.getYaw()).toBe(45);
    expect(player.getPitch()).toBe(10);
    expect(player.getHfov()).toBe(90);
  });

  it('should destroy the viewer when destroy is called', () => {
    const player = new Image360Player({
      container,
      imageUrl: 'test.jpg'
    });
    
    player.destroy();
    
    // The mocked viewer object in setupTests has destroy mocked
    const mockViewer = (window as any).pannellum.viewer.mock.results[0].value;
    expect(mockViewer.destroy).toHaveBeenCalled();
  });
});
