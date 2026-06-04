import { Image360Player } from './index';

// Expose the player globally for the standalone UMD build
if (typeof window !== 'undefined') {
  (window as any).Image360Player = Image360Player;
}

export { Image360Player };
