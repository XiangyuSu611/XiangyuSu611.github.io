// Keep the thumbnail lightweight and let readers inspect the same HD clip on demand.
const viewers = new WeakMap();

export function initPublicationVideos(doc = document) {
  if (viewers.has(doc)) return viewers.get(doc);
  let dialog, player, status, fallback, trigger;
  let pausedThumbnails = [];
  let session = 0;

  function resumeThumbnails() {
    if (doc.hidden || dialog?.open) return;
    const reduced = doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      pausedThumbnails.forEach(video => {
        if (video.isConnected) video.play()?.catch(() => {});
      });
    }
    pausedThumbnails = [];
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = doc.createElement('dialog');
    dialog.className = 'publication-video-dialog';
    dialog.setAttribute('aria-labelledby', 'publication-video-heading');
    dialog.innerHTML = '<div class="publication-video-header">' +
      '<h2 id="publication-video-heading"></h2>' +
      '<button type="button" class="pub-action" data-video-close aria-label="Close video">Close</button></div>' +
      '<video class="publication-video-player" controls playsinline muted loop preload="metadata"></video>' +
      '<p class="publication-video-status" role="status" aria-live="polite"></p>' +
      '<a class="publication-video-fallback" target="_blank" rel="noopener" hidden>Open video directly</a>';
    doc.body.append(dialog);
    player = dialog.querySelector('video');
    status = dialog.querySelector('[role="status"]');
    fallback = dialog.querySelector('a');
    player.addEventListener('error', () => {
      if (!dialog.open) return;
      status.textContent = 'The video could not load. You can open it directly or try again.';
      fallback.hidden = false;
    });
    dialog.querySelector('[data-video-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    // Native dialog also dispatches close on Escape and restores its focus trap.
    dialog.addEventListener('close', () => {
      session++;
      player.onloadedmetadata = null;
      player.pause();
      player.removeAttribute('src');
      player.load();
      resumeThumbnails();
      trigger?.focus({ preventScroll: true });
    });
  }

  function openVideo(button) {
    if (!button.dataset.videoSrc || dialog?.open) return;
    ensureDialog();
    trigger = button;
    const currentSession = ++session;
    const thumbnail = button.querySelector('video');
    const startAt = thumbnail?.currentTime || 0;
    pausedThumbnails = Array.from(doc.querySelectorAll('.pub-thumb-video')).filter(video => !video.paused);
    pausedThumbnails.forEach(video => video.pause());
    dialog.querySelector('h2').textContent = button.dataset.videoTitle || 'Publication video';
    player.setAttribute('aria-label', button.dataset.videoTitle || 'Publication video');
    status.textContent = '';
    fallback.hidden = true;
    fallback.href = button.dataset.videoSrc;
    player.poster = button.dataset.videoPoster || '';
    player.muted = true;
    player.onloadedmetadata = () => {
      if (!dialog.open || session !== currentSession) return;
      if (Number.isFinite(player.duration) && player.duration > 0) {
        player.currentTime = Math.min(startAt, Math.max(0, player.duration - 0.05));
      }
    };
    dialog.showModal();
    player.src = button.dataset.videoSrc;
    player.load();
    // A click/keyboard activation explicitly opts in, even with reduced motion.
    player.play()?.catch(() => {
      if (dialog.open && session === currentSession && !player.error) {
        status.textContent = 'Press Play to watch the video.';
      }
    });
    dialog.querySelector('[data-video-close]').focus();
  }

  doc.addEventListener('click', event => {
    const button = event.target.closest?.('.pub-video-trigger');
    if (!button) return;
    event.preventDefault();
    openVideo(button);
  });
  doc.addEventListener('visibilitychange', resumeThumbnails);
  const api = { openVideo };
  viewers.set(doc, api);
  return api;
}

if (typeof document !== 'undefined') initPublicationVideos();
