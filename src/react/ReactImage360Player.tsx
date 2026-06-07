import React, { useEffect, useRef, useState, forwardRef } from 'react';
import { Image360Player, Image360PlayerOptions, HotSpotOptions } from '../index';

export interface ReactImage360PlayerProps extends Omit<Image360PlayerOptions, 'container'> {
  className?: string;
  style?: React.CSSProperties;
  hotspots?: HotSpotOptions[];
}

export const ReactImage360Player = forwardRef<Image360Player | null, ReactImage360PlayerProps>(
  ({ className, style, imageUrl, autoLoad, showControls, compass, mouseZoom, doubleClickZoom, touchPanAndZoom, colorFilters, hotspots }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [player, setPlayer] = useState<Image360Player | null>(null);
    const activeHotspotIdsRef = useRef<string[]>([]);

    useEffect(() => {
      if (!containerRef.current) return;

      const newPlayer = new Image360Player({
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

      setPlayer(newPlayer);
      if (ref) {
        if (typeof ref === 'function') {
          ref(newPlayer);
        } else {
          (ref as React.MutableRefObject<Image360Player | null>).current = newPlayer;
        }
      }

      return () => {
        newPlayer.destroy();
        setPlayer(null);
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
      if (player && colorFilters) {
        player.setColorFilters(colorFilters);
      }
    }, [player, colorFilters]);

    useEffect(() => {
      if (!player) return;

      // Clean up previous hotspots
      activeHotspotIdsRef.current.forEach(id => {
        player.removeHTMLOverlay(id);
      });
      activeHotspotIdsRef.current = [];

      // Render new hotspots
      if (hotspots) {
        hotspots.forEach(hs => {
          const id = hs.id || `react-hotspot-${Math.random().toString(36).substr(2, 9)}`;
          player.addHTMLOverlay({ ...hs, id });
          activeHotspotIdsRef.current.push(id);
        });
      }
    }, [player, hotspots]);

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
