import React, { useEffect, useRef, useState, forwardRef } from 'react';
import {
  BrandingMode,
  GameState,
  Image360Player,
  Image360PlayerOptions,
  HotSpotOptions,
  NadirCoverOptions,
  PlayerEventMap,
} from '../index';

export interface ReactImage360PlayerProps extends Omit<Image360PlayerOptions, 'container'> {
  className?: string;
  style?: React.CSSProperties;
  hotspots?: HotSpotOptions[];
  onLoad?: () => void;
  onViewChange?: (data: { yaw: number; pitch: number; hfov: number }) => void;
  onZoom?: (data: { hfov: number }) => void;
  onError?: (error: Error) => void;
  onClick?: (data: { yaw: number; pitch: number; event: PointerEvent }) => void;
  onHotspotClick?: (data: HotSpotOptions) => void;
  onQuizAnswer?: (data: PlayerEventMap['quizanswer']) => void;
  onClueDiscovered?: (data: PlayerEventMap['cluediscovered']) => void;
  onUnlock?: (data: PlayerEventMap['unlock']) => void;
  onAddToCart?: (data: PlayerEventMap['addtocart']) => void;
  onSnapshotStart?: (data: PlayerEventMap['snapshotstart']) => void;
  onSnapshotComplete?: (data: PlayerEventMap['snapshotcomplete']) => void;
  gameState?: Partial<GameState>;
}

export const ReactImage360Player = forwardRef<Image360Player | null, ReactImage360PlayerProps>(
  (
    {
      className,
      style,
      imageUrl,
      autoLoad,
      showControls,
      compass,
      mouseZoom,
      doubleClickZoom,
      touchPanAndZoom,
      colorFilters,
      initialView,
      nadir,
      brandingMode,
      allowExternalLinks,
      sanitizeHTML,
      snapshotEndpoint,
      snapshotHeaders,
      hotspots,
      onLoad,
      onViewChange,
      onZoom,
      onError,
      onClick,
      onHotspotClick,
      onQuizAnswer,
      onClueDiscovered,
      onUnlock,
      onAddToCart,
      onSnapshotStart,
      onSnapshotComplete,
      gameState,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [player, setPlayer] = useState<Image360Player | null>(null);
    const activeHotspotIdsRef = useRef<string[]>([]);
    const appliedImageUrlRef = useRef(imageUrl);
    const appliedColorFiltersRef = useRef(colorFilters);
    const appliedNadirRef = useRef(nadir);
    const appliedBrandingModeRef = useRef(brandingMode);

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
        initialView,
        nadir,
        brandingMode,
        allowExternalLinks,
        sanitizeHTML,
        snapshotEndpoint,
        snapshotHeaders,
      });

      setPlayer(newPlayer);
      appliedImageUrlRef.current = imageUrl;
      appliedColorFiltersRef.current = colorFilters;
      appliedNadirRef.current = nadir;
      appliedBrandingModeRef.current = brandingMode;
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
    }, [
      autoLoad,
      showControls,
      compass,
      mouseZoom,
      doubleClickZoom,
      touchPanAndZoom,
      initialView,
      allowExternalLinks,
      sanitizeHTML,
      snapshotEndpoint,
      snapshotHeaders,
    ]);

    useEffect(() => {
      if (player && imageUrl !== appliedImageUrlRef.current) {
        player.setImageUrl(imageUrl);
        appliedImageUrlRef.current = imageUrl;
      }
    }, [player, imageUrl]);

    useEffect(() => {
      if (player && colorFilters && colorFilters !== appliedColorFiltersRef.current) {
        player.setColorFilters(colorFilters);
        appliedColorFiltersRef.current = colorFilters;
      }
    }, [player, colorFilters]);

    useEffect(() => {
      if (player && nadir !== appliedNadirRef.current) {
        player.setNadirCover(nadir as NadirCoverOptions | undefined);
        appliedNadirRef.current = nadir;
      }
    }, [player, nadir]);

    useEffect(() => {
      if (player && brandingMode !== appliedBrandingModeRef.current) {
        player.setBrandingMode((brandingMode || 'branded') as BrandingMode);
        appliedBrandingModeRef.current = brandingMode;
      }
    }, [player, brandingMode]);

    useEffect(() => {
      if (player && gameState) player.setGameState(gameState);
    }, [player, gameState]);

    useEffect(() => {
      if (!player) return;

      // Clean up previous hotspots
      activeHotspotIdsRef.current.forEach((id) => {
        player.removeHTMLOverlay(id);
      });
      activeHotspotIdsRef.current = [];

      // Render new hotspots
      if (hotspots) {
        hotspots.forEach((hs) => {
          const id = hs.id || `react-hotspot-${Math.random().toString(36).substr(2, 9)}`;
          player.addHTMLOverlay({ ...hs, id });
          activeHotspotIdsRef.current.push(id);
        });
      }
    }, [player, hotspots]);

    // Bind event emitter listeners
    useEffect(() => {
      if (!player) return;

      const handleLoad = () => onLoad?.();
      const handleViewChange = (data: any) => onViewChange?.(data);
      const handleZoom = (data: any) => onZoom?.(data);
      const handleError = (err: any) => onError?.(err);
      const handleClick = (data: any) => onClick?.(data);
      const handleHotspotClick = (data: any) => onHotspotClick?.(data);
      const handleQuizAnswer = (data: any) => onQuizAnswer?.(data);
      const handleClueDiscovered = (data: any) => onClueDiscovered?.(data);
      const handleUnlock = (data: any) => onUnlock?.(data);
      const handleAddToCart = (data: any) => onAddToCart?.(data);
      const handleSnapshotStart = (data: any) => onSnapshotStart?.(data);
      const handleSnapshotComplete = (data: any) => onSnapshotComplete?.(data);

      player.on('load', handleLoad);
      player.on('viewchange', handleViewChange);
      player.on('zoom', handleZoom);
      player.on('error', handleError);
      player.on('click', handleClick);
      player.on('hotspotclick', handleHotspotClick);
      player.on('quizanswer', handleQuizAnswer);
      player.on('cluediscovered', handleClueDiscovered);
      player.on('unlock', handleUnlock);
      player.on('addtocart', handleAddToCart);
      player.on('snapshotstart', handleSnapshotStart);
      player.on('snapshotcomplete', handleSnapshotComplete);

      return () => {
        player.off('load', handleLoad);
        player.off('viewchange', handleViewChange);
        player.off('zoom', handleZoom);
        player.off('error', handleError);
        player.off('click', handleClick);
        player.off('hotspotclick', handleHotspotClick);
        player.off('quizanswer', handleQuizAnswer);
        player.off('cluediscovered', handleClueDiscovered);
        player.off('unlock', handleUnlock);
        player.off('addtocart', handleAddToCart);
        player.off('snapshotstart', handleSnapshotStart);
        player.off('snapshotcomplete', handleSnapshotComplete);
      };
    }, [
      player,
      onLoad,
      onViewChange,
      onZoom,
      onError,
      onClick,
      onHotspotClick,
      onQuizAnswer,
      onClueDiscovered,
      onUnlock,
      onAddToCart,
      onSnapshotStart,
      onSnapshotComplete,
    ]);

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
