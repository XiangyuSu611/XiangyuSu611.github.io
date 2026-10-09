export const AUTOPLAY_INTERVAL_MS = 1500;
export const SLIDE_MS = 1000;
export const DWELL_MS = AUTOPLAY_INTERVAL_MS - SLIDE_MS;

export function wrapIndex(index, length) {
  return length > 0 ? ((index % length) + length) % length : 0;
}

export function canAutoplay(state) {
  return state.inView && !state.hidden && !state.reducedMotion
    && !state.userPaused && !state.hovered && !state.focused && !state.dragging && !state.moving;
}

export function initializeCarousel(root) {
  const viewport = root.querySelector('.beyond-research-viewport');
  const track = root.querySelector('.beyond-research-grid');
  const photos = [...track.children];
  if (photos.length < 2 || !track.animate || root.classList.contains('is-carousel-ready')) return;

  const controls = root.querySelector('.beyond-research-controls');
  const toggle = root.querySelector('[data-carousel-toggle]');
  const previous = root.querySelector('[data-carousel-prev]');
  const next = root.querySelector('[data-carousel-next]');
  const position = root.querySelector('.beyond-research-position');
  const announcement = root.querySelector('.beyond-research-announcement');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    inView: false, hidden: document.hidden, reducedMotion: motion.matches,
    userPaused: false, hovered: root.matches(':hover'),
    focused: root.contains(document.activeElement) && document.activeElement.matches(':focus-visible'),
    dragging: false, moving: false
  };
  const padding = Math.min(3, photos.length);
  let index = 0;
  let slot = padding;
  let step = 0;
  let timer = null;
  let deadline = 0;
  let remaining = AUTOPLAY_INTERVAL_MS;
  let animation = null;
  let settleAnimation = null;
  let redirectAnimation = null;
  let manualSlide = false;
  let pointer;
  let suppressClickUntil = 0;
  let warmed = false;

  photos.forEach((photo, photoIndex) => { photo.dataset.photoIndex = String(photoIndex); });
  function clone(photo) {
    const copy = photo.cloneNode(true);
    copy.dataset.clone = '';
    copy.inert = true;
    copy.tabIndex = -1;
    copy.setAttribute('aria-hidden', 'true');
    return copy;
  }
  // Create seamless edges once. Never detach images during a slide: that
  // restarts their CSS animation and causes a jump in the breathing zoom.
  track.prepend(...photos.slice(-padding).map(clone));
  track.append(...photos.slice(0, padding).map(clone));
  const cards = [...track.children];

  function visibleCount() {
    return Math.min(photos.length, Number.parseInt(getComputedStyle(viewport).getPropertyValue('--visible-photos'), 10) || 3);
  }

  function paint() {
    track.style.transform = 'translate3d(' + (-slot * step) + 'px, 0, 0)';
  }

  function updateVisiblePhotos() {
    const count = visibleCount();
    cards.forEach((photo, physicalIndex) => {
      const visible = physicalIndex >= slot && physicalIndex < slot + count;
      photo.inert = !visible;
      photo.tabIndex = visible ? 0 : -1;
      if (visible) photo.removeAttribute('aria-hidden');
      else photo.setAttribute('aria-hidden', 'true');
    });
    position.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(photos.length).padStart(2, '0');
    root.dataset.carouselIndex = String(index);
  }

  function sync() {
    const eligible = canAutoplay(state);
    const breathing = canAutoplay({ ...state, moving: false });
    root.dataset.carouselPlaying = String(breathing);
    toggle.textContent = state.userPaused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-pressed', String(state.userPaused));
    toggle.setAttribute('aria-label', state.userPaused ? 'Resume automatic slideshow' : 'Pause automatic slideshow');
    toggle.hidden = state.reducedMotion;

    // Manual navigation works while hovered/paused. An automatic slide must
    // freeze at its current frame when hover, focus, or Pause interrupts it.
    if (animation) {
      const pause = state.hidden || !state.inView || (!manualSlide && !breathing);
      if (pause && animation.playState === 'running') animation.pause();
      else if (!pause && animation.playState === 'paused') animation.play();
    }
    root.dataset.carouselState = animation
      ? (animation.playState === 'paused' ? 'paused' : 'sliding')
      : (eligible ? 'waiting' : 'paused');

    if (timer !== null && !eligible) {
      clearTimeout(timer);
      timer = null;
      remaining = Math.max(0, deadline - performance.now());
    }
    if (timer === null && eligible) {
      deadline = performance.now() + remaining;
      timer = setTimeout(() => {
        timer = null;
        remaining = DWELL_MS;
        move(1, false);
      }, remaining);
    }
  }

  function move(direction, manual = true) {
    if (state.moving) {
      if (manual && redirectAnimation) redirectAnimation(direction);
      return;
    }
    if (track.contains(document.activeElement)) viewport.focus({ preventScroll: true });
    state.moving = true;
    manualSlide = manual;
    sync();
    remaining = DWELL_MS;
    const originIndex = index;
    const originSlot = slot;
    let destinationIndex = wrapIndex(index + direction, photos.length);
    let destinationSlot = slot + direction;
    let settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      index = destinationIndex;
      // Normalize only between identical edge copies. Their breathing clocks
      // have the same phase because all image nodes were created at startup.
      slot = padding + index;
      paint();
      const completed = animation;
      animation = null;
      settleAnimation = null;
      redirectAnimation = null;
      if (completed) completed.cancel();
      state.moving = false;
      remaining = DWELL_MS;
      updateVisiblePhotos();
      if (manualSlide) {
        const caption = photos[index].querySelector('figcaption');
        announcement.textContent = caption.querySelector('span').textContent + ', ' + caption.querySelector('time').textContent;
      }
      sync();
    }

    if (state.reducedMotion) {
      finish();
      return;
    }
    animation = track.animate([
      { transform: 'translate3d(' + (-originSlot * step) + 'px, 0, 0)' },
      { transform: 'translate3d(' + (-destinationSlot * step) + 'px, 0, 0)' }
    ], { duration: SLIDE_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' });
    settleAnimation = finish;
    redirectAnimation = requested => {
      manualSlide = true;
      const forwards = requested === direction;
      destinationIndex = forwards ? wrapIndex(originIndex + direction, photos.length) : originIndex;
      destinationSlot = forwards ? originSlot + direction : originSlot;
      animation.updatePlaybackRate(forwards ? 1 : -1);
      sync();
    };
    animation.finished.then(finish, () => {});
    sync();
  }

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  toggle.addEventListener('click', () => { state.userPaused = !state.userPaused; sync(); });
  root.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'touch') { state.hovered = true; sync(); }
  });
  root.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'touch') { state.hovered = false; sync(); }
  });
  root.addEventListener('focusin', event => { state.focused = event.target.matches(':focus-visible'); sync(); });
  root.addEventListener('focusout', event => {
    state.focused = root.contains(event.relatedTarget) && event.relatedTarget.matches(':focus-visible');
    sync();
  });
  root.addEventListener('keydown', () => { state.focused = true; sync(); });
  root.addEventListener('pointerdown', () => { state.focused = false; sync(); });
  viewport.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 1 : -1);
  });

  viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    suppressClickUntil = 0;
    state.dragging = true;
    sync();
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) viewport.setPointerCapture(event.pointerId);
  });
  window.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = null;
    state.dragging = false;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      suppressClickUntil = Date.now() + 400;
      move(dx < 0 ? 1 : -1);
    }
    sync();
  });
  window.addEventListener('pointercancel', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null;
    state.dragging = false;
    sync();
  });
  viewport.addEventListener('click', event => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener('visibilitychange', () => { state.hidden = document.hidden; sync(); });
  motion.addEventListener('change', event => {
    state.reducedMotion = event.matches;
    if (settleAnimation) settleAnimation();
    sync();
  });

  const observer = new IntersectionObserver(entries => {
    state.inView = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.2;
    if (state.inView && !warmed) {
      warmed = true;
      // Decode the lightweight gallery previews before they enter the strip.
      cards.forEach(photo => {
        const image = photo.querySelector('img');
        image.loading = 'eager';
        image.decode?.().catch(() => {});
      });
    }
    sync();
  }, { threshold: [0, 0.2] });

  let lastWidth = 0;
  function resize() {
    const width = viewport.getBoundingClientRect().width;
    if (Math.abs(width - lastWidth) < 0.1) return;
    lastWidth = width;
    if (settleAnimation) settleAnimation();
    step = photos[0].getBoundingClientRect().width + (Number.parseFloat(getComputedStyle(track).gap) || 0);
    paint();
    updateVisiblePhotos();
  }
  root.classList.add('is-carousel-ready');
  controls.hidden = false;
  resize();
  observer.observe(root);
  new ResizeObserver(resize).observe(viewport);
  sync();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#beyond-research');
  if (root) initializeCarousel(root);
}
