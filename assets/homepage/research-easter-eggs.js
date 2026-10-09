// Two opt-in, raster-rendered research illustrations, not live 3D simulations.
export const SCENES = Object.freeze({
  robot: {
    asset: 'assets/homepage/robot-arm-planning-v2.png',
    label: 'Natural-language robot task planning',
    announcement: 'An industrial robot arm with a natural-language instruction and a Pick, Polish, Place plan.',
  },
  materials: {
    asset: 'assets/homepage/photo-material-3d-v2.png',
    label: 'Photo + Material → 3D',
    announcement: 'A source photo and blue fabric material transfer to a differently shaped 3D chair with wooden legs.',
  },
});

// Each image is decoded once; failures remain retryable. Separate elements prevent
// a slow earlier request from replacing the artwork in a newer scene.
export function createSceneLoader(elements) {
  const decoded = new Map();
  return kind => {
    if (!SCENES[kind] || !elements[kind]) return Promise.reject(new Error('Unknown scene'));
    if (!decoded.has(kind)) {
      const image = elements[kind].querySelector('img');
      image.src = SCENES[kind].asset;
      decoded.set(kind, image.decode().catch(error => { decoded.delete(kind); throw error; }));
    }
    return decoded.get(kind);
  };
}

export function pointerPose(x, y, width, height) {
  const unit = (value, size) => size > 0 ? Math.max(-1, Math.min(1, value / size * 2 - 1)) : 0;
  return { x: unit(x, width) * 2, y: unit(y, height) * 1.5 };
}

export function initializeResearchEggs(doc = document) {
  const view = doc.defaultView;
  const container = doc.querySelector('.container');
  const stage = doc.querySelector('#research-cameo');
  if (!view || !container || !stage) return () => {};
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = Object.fromEntries([...stage.querySelectorAll('[data-scene]')].map(scene => [scene.dataset.scene, scene]));
  const loadScene = createSceneLoader(scenes);
  const closeButton = stage.querySelector('.research-cameo-close');
  const status = doc.querySelector('.research-egg-status');
  let activeButton = null;
  let pendingButton = null;
  let request = 0;

  function resetPose() {
    stage.style.removeProperty('--pointer-x');
    stage.style.removeProperty('--pointer-y');
  }

  function close({ restoreFocus = false } = {}) {
    request += 1;
    const origin = pendingButton || activeButton;
    pendingButton?.removeAttribute('aria-busy');
    pendingButton = null;
    if (activeButton) {
      activeButton.setAttribute('aria-expanded', 'false');
      delete activeButton.dataset.active;
    }
    activeButton = null;
    Object.values(scenes).forEach(scene => { scene.hidden = true; });
    stage.hidden = true;
    delete stage.dataset.kind;
    delete container.dataset.researchCameo;
    status.textContent = '';
    resetPose();
    if (restoreFocus) origin?.focus({ preventScroll: true });
  }

  async function open(button, keyboard) {
    if (button === activeButton || button === pendingButton) { close(); return; }
    const kind = button.dataset.researchEgg;
    if (!SCENES[kind]) return;
    const version = ++request;
    pendingButton?.removeAttribute('aria-busy');
    pendingButton = button;
    button.setAttribute('aria-busy', 'true');
    try {
      await loadScene(kind);
      if (version !== request) return;
      pendingButton = null;
      button.removeAttribute('aria-busy');
      if (activeButton) {
        activeButton.setAttribute('aria-expanded', 'false');
        delete activeButton.dataset.active;
      }
      activeButton = button;
      button.setAttribute('aria-expanded', 'true');
      button.dataset.active = 'true';
      Object.entries(scenes).forEach(([key, scene]) => { scene.hidden = key !== kind; });
      stage.dataset.kind = kind;
      stage.setAttribute('aria-label', SCENES[kind].label);
      container.dataset.researchCameo = 'open';
      stage.hidden = false;
      status.textContent = `${SCENES[kind].announcement} Press Escape to close.`;
      if (keyboard) closeButton.focus({ preventScroll: true });
      resetPose();
    } catch {
      if (version !== request) return;
      close();
      status.textContent = 'The research illustration could not load. Please try again.';
    }
  }

  function click(event) {
    const button = event.target.closest?.('[data-research-egg]');
    if (button) void open(button, event.detail === 0);
  }
  function closeClick() { close({ restoreFocus: true }); }
  function keydown(event) {
    if (event.key === 'Escape' && (activeButton || pendingButton)) close({ restoreFocus: true });
  }
  function pointerMove(event) {
    if (motion.matches || event.pointerType === 'touch') return;
    const bounds = stage.getBoundingClientRect();
    const pose = pointerPose(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height);
    stage.style.setProperty('--pointer-x', `${pose.x}px`);
    stage.style.setProperty('--pointer-y', `${pose.y}px`);
  }
  let inView = true;
  function pause() { stage.dataset.paused = String(doc.hidden || !inView); }
  const observer = 'IntersectionObserver' in view ? new view.IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    pause();
  }) : null;
  observer?.observe(stage);
  doc.addEventListener('click', click);
  doc.addEventListener('keydown', keydown);
  doc.addEventListener('visibilitychange', pause);
  closeButton.addEventListener('click', closeClick);
  stage.addEventListener('pointermove', pointerMove);
  stage.addEventListener('pointerleave', resetPose);
  motion.addEventListener('change', resetPose);
  return () => {
    close();
    observer?.disconnect();
    doc.removeEventListener('click', click);
    doc.removeEventListener('keydown', keydown);
    doc.removeEventListener('visibilitychange', pause);
    closeButton.removeEventListener('click', closeClick);
    stage.removeEventListener('pointermove', pointerMove);
    stage.removeEventListener('pointerleave', resetPose);
    motion.removeEventListener('change', resetPose);
  };
}

if (typeof document !== 'undefined') initializeResearchEggs();
