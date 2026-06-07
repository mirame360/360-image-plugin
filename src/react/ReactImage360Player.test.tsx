import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReactImage360Player } from './ReactImage360Player';
import { Image360Player } from '../index';

// Mock the Image360Player class to test the React wrapper in isolation
vi.mock('../index', async (importOriginal) => {
  const original = await importOriginal<typeof import('../index')>();
  const MockImage360Player = vi.fn().mockImplementation(function (this: any) {
    this.destroy = vi.fn();
    this.setColorFilters = vi.fn();
    this.setImageUrl = vi.fn();
    this.addHTMLOverlay = vi.fn();
    this.removeHTMLOverlay = vi.fn();
    this.getYaw = vi.fn().mockReturnValue(0);
    this.getPitch = vi.fn().mockReturnValue(0);
    this.getHfov = vi.fn().mockReturnValue(90);
    this.on = vi.fn();
    this.off = vi.fn();
    return this;
  });
  return {
    ...original,
    Image360Player: MockImage360Player,
  };
});

describe('ReactImage360Player', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a container div', () => {
    const { container } = render(
      <ReactImage360Player imageUrl="test.jpg" className="test-class" />
    );
    expect(container.querySelector('div')).toBeInTheDocument();
    expect(container.querySelector('.test-class')).toBeInTheDocument();
  });

  it('initializes Image360Player on mount', () => {
    render(<ReactImage360Player imageUrl="test.jpg" autoLoad={false} />);
    
    expect(Image360Player).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'test.jpg',
        autoLoad: false,
      })
    );
  });

  it('destroys Image360Player instance on unmount', () => {
    const { unmount } = render(<ReactImage360Player imageUrl="test.jpg" />);
    
    const mockPlayerInstance = vi.mocked(Image360Player).mock.results[0].value;
    unmount();
    
    expect(mockPlayerInstance.destroy).toHaveBeenCalled();
  });

  it('updates color filters without recreating the player', () => {
    const ref = React.createRef<any>();
    const { rerender } = render(
      <ReactImage360Player ref={ref} imageUrl="test.jpg" colorFilters={{ exposure: 0 }} />
    );

    const playerInstance = ref.current;
    expect(playerInstance).toBeDefined();

    rerender(
      <ReactImage360Player ref={ref} imageUrl="test.jpg" colorFilters={{ exposure: 0.5 }} />
    );

    expect(playerInstance.setColorFilters).toHaveBeenCalledWith({ exposure: 0.5 });
    expect(Image360Player).toHaveBeenCalledTimes(1);
  });

  it('manages declarative hotspots dynamically', () => {
    const hotspots1 = [
      { id: 'hs1', yaw: 10, pitch: 20, html: '<span>1</span>' },
    ];
    const hotspots2 = [
      { id: 'hs2', yaw: 30, pitch: 40, html: '<span>2</span>' },
    ];

    const { rerender } = render(
      <ReactImage360Player imageUrl="test.jpg" hotspots={hotspots1} />
    );

    const mockPlayerInstance = vi.mocked(Image360Player).mock.results[0].value;
    expect(mockPlayerInstance.addHTMLOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hs1', yaw: 10, pitch: 20 })
    );

    // Update hotspots
    rerender(<ReactImage360Player imageUrl="test.jpg" hotspots={hotspots2} />);
    expect(mockPlayerInstance.removeHTMLOverlay).toHaveBeenCalledWith('hs1');
    expect(mockPlayerInstance.addHTMLOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'hs2', yaw: 30, pitch: 40 })
    );
  });

  it('forwards player events to React component callback props', () => {
    const onLoadMock = vi.fn();
    const onViewChangeMock = vi.fn();
    const onZoomMock = vi.fn();
    const onErrorMock = vi.fn();
    const onClickMock = vi.fn();
    const onHotspotClickMock = vi.fn();

    render(
      <ReactImage360Player
        imageUrl="test.jpg"
        onLoad={onLoadMock}
        onViewChange={onViewChangeMock}
        onZoom={onZoomMock}
        onError={onErrorMock}
        onClick={onClickMock}
        onHotspotClick={onHotspotClickMock}
      />
    );

    const mockPlayerInstance = vi.mocked(Image360Player).mock.results[0].value;
    expect(mockPlayerInstance.on).toHaveBeenCalledWith('load', expect.any(Function));
    expect(mockPlayerInstance.on).toHaveBeenCalledWith('viewchange', expect.any(Function));
    expect(mockPlayerInstance.on).toHaveBeenCalledWith('zoom', expect.any(Function));
    expect(mockPlayerInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockPlayerInstance.on).toHaveBeenCalledWith('click', expect.any(Function));
    expect(mockPlayerInstance.on).toHaveBeenCalledWith('hotspotclick', expect.any(Function));

    // Retrieve and trigger load callback
    const loadCall = vi.mocked(mockPlayerInstance.on).mock.calls.find((call: any) => call[0] === 'load');
    expect(loadCall).toBeDefined();
    const loadCallback = loadCall![1];
    loadCallback();
    expect(onLoadMock).toHaveBeenCalled();

    // Retrieve and trigger viewchange callback
    const viewchangeCall = vi.mocked(mockPlayerInstance.on).mock.calls.find((call: any) => call[0] === 'viewchange');
    expect(viewchangeCall).toBeDefined();
    const viewchangeCallback = viewchangeCall![1];
    viewchangeCallback({ yaw: 15, pitch: -5, hfov: 90 });
    expect(onViewChangeMock).toHaveBeenCalledWith({ yaw: 15, pitch: -5, hfov: 90 });

    // Retrieve and trigger hotspotclick callback
    const hotspotclickCall = vi.mocked(mockPlayerInstance.on).mock.calls.find((call: any) => call[0] === 'hotspotclick');
    expect(hotspotclickCall).toBeDefined();
    const hotspotclickCallback = hotspotclickCall![1];
    const dummyHotspot = { id: 'hs-test', yaw: 45, pitch: 10 };
    hotspotclickCallback(dummyHotspot);
    expect(onHotspotClickMock).toHaveBeenCalledWith(dummyHotspot);
  });

  it('updates imageUrl without recreating the player', () => {
    const { rerender } = render(
      <ReactImage360Player imageUrl="test1.jpg" />
    );

    const mockPlayerInstance = vi.mocked(Image360Player).mock.results[0].value;
    expect(Image360Player).toHaveBeenCalledTimes(1);

    // Update imageUrl prop
    rerender(<ReactImage360Player imageUrl="test2.jpg" />);

    expect(mockPlayerInstance.setImageUrl).toHaveBeenCalledWith('test2.jpg');
    // Verify constructor wasn't called again
    expect(Image360Player).toHaveBeenCalledTimes(1);
  });
});
