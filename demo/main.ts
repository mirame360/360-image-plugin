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

  // Add some sample hotspots
  player.addHTMLOverlay({
    yaw: 45,
    pitch: 10,
    html: 'i',
    onClick: () => alert('Info hotspot clicked! This is at Yaw: 45, Pitch: 10.'),
  });

  player.addHTMLOverlay({
    yaw: -30,
    pitch: -5,
    html: '🔥',
    onClick: () => alert('Hotspot clicked! This is at Yaw: -30, Pitch: -5.'),
  });

  const snapshotBtn = document.getElementById('btn-snapshot');
  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', () => {
      player.takeSnapshot().then(blob => {
        const url = URL.createObjectURL(blob);
        const resultDiv = document.getElementById('snapshot-result');
        const resultImg = document.getElementById('snapshot-img') as HTMLImageElement;
        if (resultDiv && resultImg) {
          resultImg.src = url;
          resultDiv.style.display = 'block';
          
          // Auto hide after 4 seconds
          setTimeout(() => {
            resultDiv.style.display = 'none';
            URL.revokeObjectURL(url);
          }, 4000);
        }
      }).catch(err => {
        console.error('Failed to capture snapshot', err);
        alert('Failed to capture snapshot: ' + err.message);
      });
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

  // Connect sliders to color filters
  const filtersList = [
    { id: 'exposure', default: 0 },
    { id: 'brightness', default: 0 },
    { id: 'contrast', default: 1 },
    { id: 'saturation', default: 1 },
    { id: 'temperature', default: 0 },
    { id: 'tint', default: 0 },
    { id: 'highlight', default: 0 },
    { id: 'shadow', default: 0 },
  ];

  function updateFilter(id: string, value: number) {
    const labelVal = document.getElementById(`val-${id}`);
    if (labelVal) {
      labelVal.textContent = value.toFixed(2);
    }
    player.setColorFilters({
      [id]: value
    });
  }

  filtersList.forEach(item => {
    const input = document.getElementById(`filter-${item.id}`) as HTMLInputElement;
    if (input) {
      const labelVal = document.getElementById(`val-${item.id}`);
      if (labelVal) {
        labelVal.textContent = parseFloat(input.value).toFixed(2);
      }

      input.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        updateFilter(item.id, val);
      });
    }
  });

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      filtersList.forEach(item => {
        const input = document.getElementById(`filter-${item.id}`) as HTMLInputElement;
        if (input) {
          input.value = item.default.toString();
          updateFilter(item.id, item.default);
        }
      });
    });
  }
});
