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

  // --- Event Console Logger Helper ---
  const consoleLogs = document.getElementById('console-logs');
  const clearConsoleBtn = document.getElementById('btn-clear-console');

  function logToConsole(tag: string, text: string) {
    if (!consoleLogs) return;
    const logEntry = document.createElement('div');
    logEntry.className = 'console-log-entry';
    logEntry.innerHTML = `<span class="console-log-tag">[${tag}]</span> ${text}`;
    consoleLogs.appendChild(logEntry);

    // Keep last 50 logs only
    while (consoleLogs.children.length > 50) {
      consoleLogs.removeChild(consoleLogs.firstChild!);
    }
    
    // Auto scroll to bottom
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  if (clearConsoleBtn) {
    clearConsoleBtn.addEventListener('click', () => {
      if (consoleLogs) {
        consoleLogs.innerHTML = '<div class="console-log-entry"><span class="console-log-tag">[system]</span> Console cleared.</div>';
      }
    });
  }

  // --- Bind Event Listeners ---
  player.on('load', () => {
    logToConsole('load', 'Panorama image loaded successfully!');
  });

  player.on('error', (err) => {
    logToConsole('error', `Loading failed: ${err.message}`);
  });

  player.on('viewchange', (data) => {
    // Throttled logging is usually preferred, but for demo direct prints show real-time response
    logToConsole('viewchange', `Yaw: ${data.yaw.toFixed(2)}° | Pitch: ${data.pitch.toFixed(2)}° | HFov: ${data.hfov.toFixed(1)}°`);
  });

  player.on('zoom', (data) => {
    logToConsole('zoom', `Field of view changed to: ${data.hfov.toFixed(1)}°`);
  });

  player.on('click', (data) => {
    logToConsole('click', `Viewer clicked at Yaw: ${data.yaw.toFixed(2)}° | Pitch: ${data.pitch.toFixed(2)}°`);
  });

  // --- Add Custom and Default Hotspots ---
  
  // 1. Custom HTML hotspot
  player.addHTMLOverlay({
    yaw: 45,
    pitch: 10,
    html: 'i',
    onClick: () => alert('Custom HTML hotspot clicked! This is at Yaw: 45, Pitch: 10.'),
  });

  // 2. Default styled info hotspot with hover tooltip and click redirect
  player.addHTMLOverlay({
    yaw: -30,
    pitch: -5,
    text: 'Learn about the BMA collection',
    url: 'https://artbma.org/',
    target: '_blank',
  });

  // 3. Default styled link hotspot
  player.addHTMLOverlay({
    yaw: 120,
    pitch: -15,
    text: 'Visit Three.js website',
    url: 'https://threejs.org/',
    target: '_blank',
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
          
          logToConsole('snapshot', 'Captured WebGL context snapshot.');

          // Auto hide after 4 seconds
          setTimeout(() => {
            resultDiv.style.display = 'none';
            URL.revokeObjectURL(url);
          }, 4000);
        }
      }).catch(err => {
        console.error('Failed to capture snapshot', err);
        alert('Failed to capture snapshot: ' + err.message);
        logToConsole('error', 'Snapshot failed: ' + err.message);
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
        logToConsole('image-upload', `Loading new panorama: ${file.name}`);
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
      logToConsole('reset', 'Reset all color filters.');
    });
  }
});
