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
    this.setNadirCover = vi.fn();
    this.setBrandingMode = vi.fn();
    this.setGameState = vi.fn();
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
    const colorFilters = { exposure: 0.25 };
    const initialView = { yaw: 10, pitch: 5, hfov: 75 };
    const nadir = { imageUrl: 'logo.png' };
    const snapshotHeaders = { Authorization: 'Bearer token' };
    const sanitizer = vi.fn((html: string) => html);
    render(
      <ReactImage360Player
        imageUrl="test.jpg"
        autoLoad={false}
        colorFilters={colorFilters}
        initialView={initialView}
        nadir={nadir}
        brandingMode="unbranded"
        allowExternalLinks={false}
        sanitizeHTML={sanitizer}
        snapshotEndpoint="/api/snapshot/"
        snapshotHeaders={snapshotHeaders}
      />
    );
    
    expect(Image360Player).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'test.jpg',
        autoLoad: false,
        colorFilters,
        initialView,
        nadir,
        brandingMode: 'unbranded',
        allowExternalLinks: false,
        sanitizeHTML: sanitizer,
        snapshotEndpoint: '/api/snapshot/',
        snapshotHeaders,
      })
    );

    const mockPlayerInstance = vi.mocked(Image360Player).mock.results[0].value;
    expect(mockPlayerInstance.setImageUrl).not.toHaveBeenCalled();
    expect(mockPlayerInstance.setColorFilters).not.toHaveBeenCalled();
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

    rerender(<ReactImage360Player imageUrl="test1.jpg" />);
    expect(mockPlayerInstance.setImageUrl).toHaveBeenLastCalledWith('test1.jpg');
  });

  it('updates an ordered image URL list only when its contents change', () => {
    const { rerender } = render(
      <ReactImage360Player imageUrl={['primary.webp', 'fallback.jpeg']} />
    );
    const mockPlayerInstance = vi.mocked(Image360Player).mock.results[0].value;

    rerender(<ReactImage360Player imageUrl={['primary.webp', 'fallback.jpeg']} />);
    expect(mockPlayerInstance.setImageUrl).not.toHaveBeenCalled();

    rerender(<ReactImage360Player imageUrl={['primary.webp', 'mobile.jpeg']} />);
    expect(mockPlayerInstance.setImageUrl).toHaveBeenCalledWith(['primary.webp', 'mobile.jpeg']);
    expect(Image360Player).toHaveBeenCalledTimes(1);
  });

  it('updates nadir, branding mode, and game state without recreating the player', () => {
    const initialNadir = { imageUrl: 'logo-1.png' };
    const { rerender } = render(
      <ReactImage360Player
        imageUrl="test.jpg"
        nadir={initialNadir}
        brandingMode="branded"
        gameState={{ discoveredClues: ['initial'] }}
      />
    );
    const player = vi.mocked(Image360Player).mock.results[0].value;
    expect(player.setNadirCover).not.toHaveBeenCalled();
    expect(player.setBrandingMode).not.toHaveBeenCalled();
    expect(player.setGameState).toHaveBeenCalledWith({ discoveredClues: ['initial'] });

    const nextState = {
      discoveredClues: ['key'],
      unlockedHotspots: ['door'],
      answeredQuizzes: { quiz: 'yes' },
    };
    rerender(
      <ReactImage360Player
        imageUrl="test.jpg"
        nadir={{ imageUrl: 'logo-2.png' }}
        brandingMode="unbranded"
        gameState={nextState}
      />
    );

    expect(player.setNadirCover).toHaveBeenCalledWith({ imageUrl: 'logo-2.png' });
    expect(player.setBrandingMode).toHaveBeenCalledWith('unbranded');
    expect(player.setGameState).toHaveBeenLastCalledWith(nextState);
    expect(Image360Player).toHaveBeenCalledTimes(1);
  });

  it('forwards every advanced event and unregisters listeners on unmount', () => {
    const callbacks = {
      onQuizAnswer: vi.fn(),
      onClueDiscovered: vi.fn(),
      onUnlock: vi.fn(),
      onAddToCart: vi.fn(),
      onSnapshotStart: vi.fn(),
      onSnapshotComplete: vi.fn(),
    };
    const { unmount } = render(
      <ReactImage360Player imageUrl="test.jpg" {...callbacks} />
    );
    const player = vi.mocked(Image360Player).mock.results[0].value;
    const eventPayloads: Record<string, any> = {
      quizanswer: { correct: true },
      cluediscovered: { clueId: 'key' },
      unlock: { hotspotIds: ['door'] },
      addtocart: { product: { id: 'sku' } },
      snapshotstart: { viewport: { yaw: 0, pitch: 0, hfov: 90 } },
      snapshotcomplete: { url: '/snapshot.jpg' },
    };
    const callbackByEvent: Record<string, ReturnType<typeof vi.fn>> = {
      quizanswer: callbacks.onQuizAnswer,
      cluediscovered: callbacks.onClueDiscovered,
      unlock: callbacks.onUnlock,
      addtocart: callbacks.onAddToCart,
      snapshotstart: callbacks.onSnapshotStart,
      snapshotcomplete: callbacks.onSnapshotComplete,
    };

    Object.entries(eventPayloads).forEach(([event, payload]) => {
      const registration = vi.mocked(player.on).mock.calls.find((call: any) => call[0] === event);
      expect(registration).toBeDefined();
      registration![1](payload);
      expect(callbackByEvent[event]).toHaveBeenCalledWith(payload);
    });

    unmount();
    Object.keys(eventPayloads).forEach(event => {
      expect(player.off).toHaveBeenCalledWith(event, expect.any(Function));
    });
  });

  it('supports callback refs and clears them on unmount', () => {
    const ref = vi.fn();
    const { unmount } = render(<ReactImage360Player ref={ref} imageUrl="test.jpg" />);
    const player = vi.mocked(Image360Player).mock.results[0].value;

    expect(ref).toHaveBeenCalledWith(player);
    unmount();
    expect(ref).toHaveBeenLastCalledWith(null);
  });

  it('generates stable cleanup ids for hotspots without explicit ids', () => {
    const { rerender } = render(
      <ReactImage360Player imageUrl="test.jpg" hotspots={[{ yaw: 1, pitch: 2 }]} />
    );
    const player = vi.mocked(Image360Player).mock.results[0].value;
    const generated = player.addHTMLOverlay.mock.calls[0][0].id;
    expect(generated).toMatch(/^react-hotspot-/);

    rerender(<ReactImage360Player imageUrl="test.jpg" hotspots={[]} />);
    expect(player.removeHTMLOverlay).toHaveBeenCalledWith(generated);
  });
});
