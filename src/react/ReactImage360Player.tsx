import React, { useEffect, useRef, forwardRef } from 'react';
import { Image360Player, Image360PlayerOptions } from '../index';

export interface ReactImage360PlayerProps extends Omit<Image360PlayerOptions, 'container'> {
  className?: string;
  style?: React.CSSProperties;
}

export const ReactImage360Player = forwardRef<Image360Player | null, ReactImage360PlayerProps>(
  ({ className, style, imageUrl, autoLoad, showControls, compass, mouseZoom, doubleClickZoom, touchPanAndZoom, colorFilters }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<Image360Player | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      const player = new Image360Player({
        container: containerRef.current,
        imageUrl,
        autoLoad,
        showControls,
        compass,
        mouseZoom,
        doubleClickZoom,
        touchPanAndZoom,
        colorFilters,
      });

      playerRef.current = player;
      if (ref) {
        if (typeof ref === 'function') {
          ref(player);
        } else {
          (ref as React.MutableRefObject<Image360Player | null>).current = player;
        }
      }

      return () => {
        player.destroy();
        playerRef.current = null;
        if (ref) {
          if (typeof ref === 'function') {
            ref(null);
          } else {
            (ref as React.MutableRefObject<Image360Player | null>).current = null;
          }
        }
      };
    }, [imageUrl, autoLoad, showControls, compass, mouseZoom, doubleClickZoom, touchPanAndZoom]);

    useEffect(() => {
      if (playerRef.current && colorFilters) {
        playerRef.current.setColorFilters(colorFilters);
      }
    }, [colorFilters]);

    return (
      <div 
        ref={containerRef} 
        className={className} 
        style={{ width: '100%', height: '100%', ...style }} 
      />
    );
  }
);

ReactImage360Player.displayName = 'ReactImage360Player';
