# 360 Image Player (@mirame360/360-image-player)

A framework-agnostic 360° image player wrapping Pannellum with modern build tools (Vite/TypeScript) and a customizable configuration interface.

## Features
- **Isolated Architecture:** Designed to run entirely independent of the main Mirame360 dashboard.
- **Customizable Configuration:** Pass an `Image360PlayerOptions` object to configure `autoLoad`, `showControls`, `compass`, and more.
- **Virtual Snapshots:** Integrated support for exporting 2D snapshots from specific coordinates (`yaw`, `pitch`, `hfov`).
- **GPL-3.0 Licensed.**

## Installation
Currently distributed as a standalone UMD build or ES module within the Mirame360 monorepo.

## Basic Usage

```typescript
import { Image360Player } from '@mirame360/360-image-player';

const player = new Image360Player({
  container: document.getElementById('my-viewer'),
  imageUrl: 'https://example.com/pano.jpg',
  autoLoad: true,
  showControls: true
});

// Take a snapshot of the current view
player.takeSnapshot().then(blob => {
    // Handle the 2D snapshot blob
});
```

## Configuration Interface

You can customize the player by passing `Image360PlayerOptions` upon initialization:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `container` | `HTMLElement` | **Required** | The DOM element where the viewer will be rendered. |
| `imageUrl` | `string` | **Required** | The URL of the equirectangular image. |
| `autoLoad` | `boolean` | `true` | Whether the panorama automatically loads when the page loads. |
| `showControls` | `boolean` | `true` | Whether to show the default UI controls. |
| `compass` | `boolean` | `false` | Display a compass on the viewer. |

## Development
- `npm run build`: Build both ES/CJS modules and the standalone UMD bundle.
- `npm run lint`: Run ESLint.
- `npm run typecheck`: Run TypeScript verification.
