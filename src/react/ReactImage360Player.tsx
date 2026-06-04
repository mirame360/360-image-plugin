import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Image360Player, Image360PlayerOptions } from '../index';

export interface ReactImage360PlayerProps extends Omit<Image360PlayerOptions, 'container'> {
  className?: string;
  style?: React.CSSProperties;
}

export const ReactImage360Player = forwardRef<Image360Player | null, ReactImage360PlayerProps>(
  ({ className, style, imageUrl, autoLoad, showControls, compass }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<Image360Player | null>(null);

    useImperativeHandle(ref, () => playerRef.current as Image360Player);

    useEffect(() => {
      if (!containerRef.current) return;

      const player = new Image360Player({
        container: containerRef.current,
        imageUrl,
        autoLoad,
        showControls,
        compass,
      });

      playerRef.current = player;

      return () => {
        player.destroy();
        playerRef.current = null;
      };
    }, [imageUrl, autoLoad, showControls, compass]);

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
