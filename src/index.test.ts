import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
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
});

