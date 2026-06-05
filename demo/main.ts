import { Image360Player } from '../src/index';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewer');
  if (!container) return;

  // Initialize the player with a sample equirectangular image
  const player = new Image360Player({
    container,
    imageUrl: 'https://pannellum.org/images/alma.jpg',
    autoLoad: true,
    showControls: true,
  });

  const snapshotBtn = document.getElementById('btn-snapshot');
  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', () => {
      // Get the viewport coordinates
      const yaw = player.getYaw();
      const pitch = player.getPitch();
      const hfov = player.getHfov();

      console.log(`Requested snapshot at Yaw: ${yaw}, Pitch: ${pitch}, HFOV: ${hfov}`);
      
      // In a real scenario, this would call player.takeSnapshot() which hits the backend API
      // Since there is no backend for the Github Pages demo, we alert the coordinates
      alert(`Snapshot requested!\nYaw: ${yaw.toFixed(2)}\nPitch: ${pitch.toFixed(2)}\nHFOV: ${hfov.toFixed(2)}\n\n(This would trigger the FFmpeg backend extraction)`);
    });
  }

  let currentObjectUrl: string | null = null;
  const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
  if (fileUpload) {
    fileUpload.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const files = target.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (currentObjectUrl) {
          URL.revokeObjectURL(currentObjectUrl);
        }
        currentObjectUrl = URL.createObjectURL(file);
        player.setImageUrl(currentObjectUrl);
      }
    });
  }
});
