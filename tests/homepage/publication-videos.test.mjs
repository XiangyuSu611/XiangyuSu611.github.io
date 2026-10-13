import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initPublicationVideos } from '../../assets/homepage/publication-videos.js';

class Element {
  constructor() { this.listeners = {}; this.attributes = {}; this.textContent = ''; this.focusCount = 0; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  emit(type, event = {}) { for (const handler of this.listeners[type] || []) handler(event); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; this[key] = ''; }
  focus() { this.focusCount++; }
  getBoundingClientRect() { return this.rect || { top: 20, bottom: 300, left: 20, right: 600 }; }
}
class Video extends Element {
  constructor(paused = true) { super(); this.paused = paused; this.currentTime = 4; this.duration = 10; this.isConnected = true; this.playCount = 0; this.loadCount = 0; }
  play() { this.playCount++; if (this.rejectPlay) return Promise.reject(new Error('autoplay blocked')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loadCount++; }
}
function harness() {
  const doc = new Element(), player = new Video(), close = new Element(), title = new Element();
  const status = new Element(), link = new Element(), dialog = new Element();
  const inline = [new Video(false), new Video(true), new Video(false)];
  inline[2].rect = { top: 900, bottom: 1100 };
  dialog.querySelector = selector => ({ video: player, h2: title, a: link, '[role="status"]': status, '[data-video-close]': close })[selector];
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.emit('close'); };
  doc.body = { append: element => { doc.appended = element; } };
  doc.createElement = () => { doc.created = (doc.created || 0) + 1; return dialog; };
  doc.querySelectorAll = () => inline;
  doc.defaultView = { innerHeight: 800, matchMedia: () => ({ matches: !!doc.reduced }) };
  const button = new Element();
  button.dataset = { videoSrc: 'assets/publications/demo-hd.mp4', videoTitle: 'Demo <title>', videoPoster: 'poster.jpg' };
  button.querySelector = () => inline[0];
  return { doc, player, close, title, status, link, dialog, inline, button, api: initPublicationVideos(doc) };
}

test('viewer initializes once and does not create or fetch an HD player until activation', () => {
  const h = harness();
  assert.equal(h.doc.created, undefined);
  assert.equal(initPublicationVideos(h.doc), h.api);
  assert.equal(h.doc.listeners.click.length, 1);
});

test('opening uses the HD source, preserves playback position, and pauses background thumbnails', () => {
  const h = harness();
  h.api.openVideo(h.button);
  assert.equal(h.dialog.open, true);
  assert.equal(h.player.src, h.button.dataset.videoSrc);
  assert.equal(h.player.poster, 'poster.jpg');
  assert.equal(h.player.muted, true);
  assert.equal(h.title.textContent, 'Demo <title>');
  assert(h.inline.every(video => video.paused));
  h.player.currentTime = 0;
  h.player.onloadedmetadata();
  assert.equal(h.player.currentTime, 4);
  assert.equal(h.close.focusCount, 1);
  assert.equal(h.player.playCount, 1);
});

test('close releases the HD resource, restores focus, and resumes only previously playing thumbnails', () => {
  const h = harness();
  h.api.openVideo(h.button);
  h.close.emit('click');
  assert.equal(h.player.src, '');
  assert.equal(h.player.paused, true);
  assert.equal(h.player.onloadedmetadata, null);
  assert.equal(h.inline[0].playCount, 1);
  assert.equal(h.inline[1].playCount, 0);
  assert.equal(h.inline[2].playCount, 1);
  assert.equal(h.button.focusCount, 1);
});

test('explicit playback works with reduced motion but closing does not restart autoplay', () => {
  const h = harness();
  h.doc.reduced = true;
  h.api.openVideo(h.button);
  assert.equal(h.player.playCount, 1);
  h.dialog.close();
  assert(h.inline.every(video => video.playCount === 0));
});

test('closing while the document is hidden does not start background playback', () => {
  const h = harness();
  h.api.openVideo(h.button);
  h.doc.hidden = true;
  h.dialog.close();
  assert(h.inline.every(video => video.playCount === 0));
  h.doc.hidden = false;
  h.doc.emit('visibilitychange');
  assert.equal(h.inline[0].playCount, 1);
  assert.equal(h.inline[1].playCount, 0);
});

test('load failure offers the current video directly, and reopening resets errors and reuses the dialog', () => {
  const h = harness();
  h.api.openVideo(h.button);
  h.player.emit('error');
  assert.equal(h.link.hidden, false);
  assert.equal(h.link.href, h.button.dataset.videoSrc);
  assert.match(h.status.textContent, /could not load/);
  h.dialog.close();
  h.button.dataset.videoSrc = 'second-hd.mp4';
  h.api.openVideo(h.button);
  assert.equal(h.doc.created, 1);
  assert.equal(h.player.src, 'second-hd.mp4');
  assert.equal(h.link.hidden, true);
  assert.equal(h.status.textContent, '');
});

test('blocked playback shows a manual-play hint; a stale rejection after close is ignored', async () => {
  const h = harness();
  h.player.rejectPlay = true;
  h.api.openVideo(h.button);
  await Promise.resolve();
  assert.match(h.status.textContent, /Press Play/);
  h.dialog.close();
  h.api.openVideo(h.button);
  h.dialog.close();
  await Promise.resolve();
  assert.equal(h.status.textContent, '');
});

test('only backdrop clicks close the dialog, and playhead seeks are bounded', () => {
  const h = harness();
  h.inline[0].currentTime = 50;
  h.api.openVideo(h.button);
  h.player.onloadedmetadata();
  assert.equal(h.player.currentTime, 9.95);
  h.dialog.emit('click', { target: h.dialog, clientX: 100, clientY: 100 });
  assert.equal(h.dialog.open, true);
  h.dialog.emit('click', { target: h.dialog, clientX: 0, clientY: 0 });
  assert.equal(h.dialog.open, false);
});

test('delegated clicks activate native buttons, including clicks on the video or expand icon', () => {
  const h = harness();
  let prevented = false;
  h.doc.emit('click', { target: { closest: () => h.button }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.dialog.open, true);
});
