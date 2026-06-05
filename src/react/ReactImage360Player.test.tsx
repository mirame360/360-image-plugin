import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReactImage360Player } from './ReactImage360Player';

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

  it('initializes Pannellum via Image360Player on mount', () => {
    render(<ReactImage360Player imageUrl="test.jpg" autoLoad={false} />);
    
    expect((window as any).pannellum.viewer).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        panorama: 'test.jpg',
        autoLoad: false,
      })
    );
  });

  it('destroys Pannellum instance on unmount', () => {
    const { unmount } = render(<ReactImage360Player imageUrl="test.jpg" />);
    unmount();
    
    const mockViewer = (window as any).pannellum.viewer.mock.results[0].value;
    expect(mockViewer.destroy).toHaveBeenCalled();
  });

  it('updates color filters without destroying the player', () => {
    const ref = React.createRef<any>();
    const { rerender } = render(
      <ReactImage360Player ref={ref} imageUrl="test.jpg" colorFilters={{ exposure: 0 }} />
    );

    const playerInstance = ref.current;
    expect(playerInstance).toBeDefined();

    const setColorFiltersSpy = vi.spyOn(playerInstance, 'setColorFilters');

    rerender(
      <ReactImage360Player ref={ref} imageUrl="test.jpg" colorFilters={{ exposure: 0.5 }} />
    );

    expect(setColorFiltersSpy).toHaveBeenCalledWith({ exposure: 0.5 });
    expect((window as any).pannellum.viewer).toHaveBeenCalledTimes(1);
  });
});
