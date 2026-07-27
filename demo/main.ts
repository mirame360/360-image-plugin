import { Image360Player, WebGL360ColorFilters } from '../src/index';

const SAMPLE_IMAGE = 'https://pannellum.org/images/alma.jpg';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewer');
  if (!container) return;

  const player = new Image360Player({
    container,
    imageUrl: SAMPLE_IMAGE,
    showControls: true,
    compass: true,
    initialView: { yaw: 0, pitch: 0, hfov: 90 },
  });
  (window as typeof window & { __image360Player?: Image360Player }).__image360Player = player;

  let brandingMode: 'branded' | 'unbranded' = 'branded';
  let panoramaObjectUrl: string | undefined;
  let nadirObjectUrl: string | undefined;

  const logRoot = document.getElementById('console-logs');
  const stateView = document.getElementById('state-view');
  const snapshotResult = document.getElementById('snapshot-result');
  const snapshotImage = document.getElementById('snapshot-img') as HTMLImageElement | null;
  const snapshotCaption = document.getElementById('snapshot-caption');

  function log(tag: string, text: string): void {
    if (!logRoot) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const label = document.createElement('span');
    label.className = 'log-tag';
    label.textContent = `[${tag}]`;
    entry.append(label, document.createTextNode(` ${text}`));
    logRoot.appendChild(entry);
    while (logRoot.children.length > 60) logRoot.firstElementChild?.remove();
    logRoot.scrollTop = logRoot.scrollHeight;
  }

  function refreshState(): void {
    if (!stateView) return;
    stateView.textContent = JSON.stringify({
      viewport: player.getView(),
      gameState: player.getGameState(),
      config: player.getSerializableConfig(),
    }, null, 2);
  }

  function showSnapshot(url: string, caption: string): void {
    if (!snapshotResult || !snapshotImage) return;
    snapshotImage.src = url;
    if (snapshotCaption) snapshotCaption.textContent = caption;
    snapshotResult.style.display = 'block';
  }

  player.on('load', () => log('load', 'Panorama texture loaded.'));
  player.on('error', error => log('error', error.message));
  player.on('viewchange', viewport => {
    const yaw = document.getElementById('hud-yaw');
    const pitch = document.getElementById('hud-pitch');
    const hfov = document.getElementById('hud-hfov');
    if (yaw) yaw.textContent = `yaw ${viewport.yaw.toFixed(1)}°`;
    if (pitch) pitch.textContent = `pitch ${viewport.pitch.toFixed(1)}°`;
    if (hfov) hfov.textContent = `hfov ${viewport.hfov.toFixed(1)}°`;
  });
  player.on('hotspotclick', hotspot => log('hotspot', `${hotspot.type || 'info'}: ${hotspot.id}`));
  player.on('quizanswer', ({ choice, correct }) => {
    log('quiz', `"${choice.label}" is ${correct ? 'correct' : 'incorrect'}.`);
    refreshState();
  });
  player.on('cluediscovered', ({ clueId }) => {
    log('clue', `Discovered "${clueId}". The quiz is now visible.`);
    refreshState();
  });
  player.on('unlock', ({ hotspotIds }) => {
    log('unlock', hotspotIds.join(', '));
    refreshState();
  });
  player.on('addtocart', ({ product }) => {
    log('cart', `Host callback received for ${product.title} (${product.price || 'no price'}).`);
  });
  player.on('snapshotstart', ({ viewport }) => {
    log('snapshot', `Server render started at yaw ${viewport.yaw.toFixed(1)}°.`);
  });
  player.on('snapshotcomplete', ({ url }) => {
    log('snapshot', 'Server render completed.');
    if (url) showSnapshot(url, 'High-resolution server snapshot');
  });

  player.addHTMLOverlay({
    id: 'welcome',
    yaw: -35,
    pitch: 4,
    html: '<strong>i</strong>',
    cssClass: 'demo-info',
    branded: true,
    onClick: () => log('info', 'Custom sanitized HTML hotspot clicked.'),
  });
  player.addHTMLOverlay({
    id: 'safe-info',
    type: 'info',
    yaw: 35,
    pitch: 0,
    text: 'MLS-safe informational hotspot',
    branded: false,
  });
  player.addHTMLOverlay({
    id: 'clue',
    type: 'clue',
    yaw: 75,
    pitch: -8,
    text: 'Find the key',
    clueId: 'gallery-key',
    unlocks: ['quiz-access'],
    branded: false,
  });
  player.addHTMLOverlay({
    id: 'quiz',
    type: 'quiz',
    yaw: 120,
    pitch: 5,
    title: 'Which format powers offline export?',
    text: 'Answer the quiz',
    requires: ['quiz-access'],
    quizChoices: [
      { id: 'tar', label: 'TAR' },
      { id: 'zip', label: 'ZIP', correct: true },
    ],
    unlocks: ['product-access'],
    branded: false,
  });
  player.addHTMLOverlay({
    id: 'product',
    type: 'product',
    yaw: 155,
    pitch: -3,
    text: 'Unlocked product',
    requires: ['product-access'],
    branded: false,
    product: {
      id: 'demo-lamp',
      title: 'Panorama lamp',
      price: '$129',
      vendor: 'custom',
      imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=320&q=70',
    },
  });
  player.addHTMLOverlay({
    id: 'external-link',
    type: 'link',
    yaw: -105,
    pitch: -5,
    text: 'Three.js website (hidden in MLS mode)',
    url: 'https://threejs.org/',
    target: '_blank',
    branded: true,
  });

  const filterDefinitions: Array<{
    id: keyof WebGL360ColorFilters;
    label: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
  }> = [
    { id: 'exposure', label: 'Exposure', min: -2, max: 2, step: .05, defaultValue: 0 },
    { id: 'brightness', label: 'Brightness', min: -1, max: 1, step: .05, defaultValue: 0 },
    { id: 'contrast', label: 'Contrast', min: 0, max: 3, step: .05, defaultValue: 1 },
    { id: 'saturation', label: 'Saturation', min: 0, max: 3, step: .05, defaultValue: 1 },
    { id: 'temperature', label: 'Temperature', min: -1, max: 1, step: .05, defaultValue: 0 },
    { id: 'tint', label: 'Tint', min: -1, max: 1, step: .05, defaultValue: 0 },
    { id: 'highlight', label: 'Highlights', min: -1, max: 1, step: .05, defaultValue: 0 },
    { id: 'shadow', label: 'Shadows', min: -1, max: 1, step: .05, defaultValue: 0 },
  ];
  const filtersRoot = document.getElementById('filters');
  filterDefinitions.forEach(definition => {
    const row = document.createElement('div');
    row.className = 'range-row';
    const heading = document.createElement('div');
    heading.className = 'range-label';
    const label = document.createElement('span');
    label.textContent = definition.label;
    const output = document.createElement('output');
    output.textContent = definition.defaultValue.toFixed(2);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.value = String(definition.defaultValue);
    input.dataset.filter = definition.id;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.textContent = value.toFixed(2);
      player.setColorFilters({ [definition.id]: value });
    });
    heading.append(label, output);
    row.append(heading, input);
    filtersRoot?.appendChild(row);
  });

  document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
    const reset: WebGL360ColorFilters = {};
    filterDefinitions.forEach(definition => {
      reset[definition.id] = definition.defaultValue;
      const input = document.querySelector<HTMLInputElement>(`[data-filter="${definition.id}"]`);
      if (input) {
        input.value = String(definition.defaultValue);
        const output = input.parentElement?.querySelector('output');
        if (output) output.textContent = definition.defaultValue.toFixed(2);
      }
    });
    player.setColorFilters(reset);
    log('filters', 'Color grading reset.');
  });

  document.getElementById('btn-branding')?.addEventListener('click', event => {
    brandingMode = brandingMode === 'branded' ? 'unbranded' : 'branded';
    player.setBrandingMode(brandingMode);
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = brandingMode === 'branded' ? 'Enable unbranded mode' : 'Enable branded mode';
    const mode = document.getElementById('hud-mode');
    if (mode) mode.textContent = brandingMode;
    log('branding', `${brandingMode} mode enabled.`);
    refreshState();
  });

  document.getElementById('btn-reset-view')?.addEventListener('click', () => {
    player.setView({ yaw: 0, pitch: 0, hfov: 90 });
  });
  document.getElementById('btn-reset-game')?.addEventListener('click', () => {
    player.setGameState({});
    log('game', 'Progress reset. Find the clue again.');
    refreshState();
  });
  document.getElementById('btn-show-config')?.addEventListener('click', refreshState);
  document.getElementById('btn-focus-clue')?.addEventListener('click', () => player.setView({ yaw: 75, pitch: -8, hfov: 65 }));
  document.getElementById('btn-focus-quiz')?.addEventListener('click', () => player.setView({ yaw: 120, pitch: 5, hfov: 65 }));
  document.getElementById('btn-focus-product')?.addEventListener('click', () => player.setView({ yaw: 155, pitch: -3, hfov: 65 }));
  document.getElementById('btn-clear-console')?.addEventListener('click', () => {
    if (logRoot) logRoot.replaceChildren();
    log('system', 'Event stream cleared.');
  });

  const panoramaInput = document.getElementById('file-upload') as HTMLInputElement | null;
  document.getElementById('btn-image-picker')?.addEventListener('click', () => panoramaInput?.click());
  panoramaInput?.addEventListener('change', () => {
    const file = panoramaInput.files?.[0];
    if (!file) return;
    if (panoramaObjectUrl) URL.revokeObjectURL(panoramaObjectUrl);
    panoramaObjectUrl = URL.createObjectURL(file);
    player.setImageUrl(panoramaObjectUrl);
    log('image', `Loaded ${file.name}.`);
  });

  function applyNadir(): void {
    if (!nadirObjectUrl) return;
    const radius = Number((document.getElementById('nadir-radius') as HTMLInputElement).value);
    const rotation = Number((document.getElementById('nadir-rotation') as HTMLInputElement).value);
    player.setNadirCover({ imageUrl: nadirObjectUrl, radius, rotation });
    refreshState();
  }
  const nadirInput = document.getElementById('nadir-upload') as HTMLInputElement | null;
  nadirInput?.addEventListener('change', () => {
    const file = nadirInput.files?.[0];
    if (!file) return;
    if (nadirObjectUrl) URL.revokeObjectURL(nadirObjectUrl);
    nadirObjectUrl = URL.createObjectURL(file);
    applyNadir();
    log('nadir', `Applied ${file.name}.`);
  });
  ['nadir-radius', 'nadir-rotation'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', event => {
      const input = event.currentTarget as HTMLInputElement;
      const output = document.getElementById(`val-${id}`);
      if (output) output.textContent = id.endsWith('rotation') ? `${input.value}°` : input.value;
      applyNadir();
    });
  });
  document.getElementById('btn-remove-nadir')?.addEventListener('click', () => {
    player.setNadirCover(undefined);
    if (nadirObjectUrl) URL.revokeObjectURL(nadirObjectUrl);
    nadirObjectUrl = undefined;
    if (nadirInput) nadirInput.value = '';
    log('nadir', 'Nadir cover removed.');
    refreshState();
  });

  document.getElementById('btn-snapshot')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      const blob = await player.takeSnapshot();
      const url = URL.createObjectURL(blob);
      showSnapshot(url, 'Local canvas snapshot');
      log('snapshot', 'Local PNG captured.');
      window.setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (error) {
      log('error', error instanceof Error ? error.message : String(error));
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('btn-remote-snapshot')?.addEventListener('click', async event => {
    const endpoint = (document.getElementById('snapshot-endpoint') as HTMLInputElement).value.trim();
    if (!endpoint) {
      log('snapshot', 'Enter a backend endpoint first.');
      return;
    }
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      await player.requestSnapshot({
        endpoint,
        width: Number((document.getElementById('snapshot-width') as HTMLInputElement).value),
        height: Number((document.getElementById('snapshot-height') as HTMLInputElement).value),
        format: 'jpeg',
      });
    } catch (error) {
      log('error', error instanceof Error ? error.message : String(error));
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      const zip = await player.exportOffline({
        playerScriptUrl: '../dist/360-image-player.standalone.umd.min.js',
        fetchAssets: true,
      });
      const url = URL.createObjectURL(zip);
      const link = document.createElement('a');
      link.href = url;
      link.download = '360-feature-lab.zip';
      link.click();
      URL.revokeObjectURL(url);
      log('export', 'Offline ZIP downloaded.');
    } catch (error) {
      log('error', `${error instanceof Error ? error.message : String(error)} Check asset CORS permissions.`);
    } finally {
      button.disabled = false;
    }
  });

  refreshState();
  log('system', 'Start by clicking “Find clue”.');

  window.addEventListener('beforeunload', () => {
    player.destroy();
    if (panoramaObjectUrl) URL.revokeObjectURL(panoramaObjectUrl);
    if (nadirObjectUrl) URL.revokeObjectURL(nadirObjectUrl);
  });
});
