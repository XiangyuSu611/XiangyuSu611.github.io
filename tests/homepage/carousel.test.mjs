import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { AUTOPLAY_INTERVAL_MS, DWELL_MS, SLIDE_MS, canAutoplay, wrapIndex } from '../../assets/homepage/beyond-research.js';

const ready = {
  inView: true, hidden: false, reducedMotion: false,
  userPaused: false, hovered: false, focused: false, dragging: false, moving: false
};

test('automatic slide starts are 1.5 seconds apart, including the transition', () => {
  assert.equal(AUTOPLAY_INTERVAL_MS, 1500);
  assert.equal(DWELL_MS + SLIDE_MS, 1500);
  assert.equal(SLIDE_MS, 1000);
  assert.equal(DWELL_MS, 500);
});

test('cycles through ten photographs and wraps in either direction', () => {
  assert.deepEqual(Array.from({ length: 11 }, (_, i) => wrapIndex(i, 10)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  assert.equal(wrapIndex(-1, 10), 9);
  assert.equal(wrapIndex(-11, 10), 9);
  assert.equal(wrapIndex(0, 0), 0);
});

test('the homepage includes ten distinct existing gallery photos, preserving the chosen first three', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const section = html.split('<section id="beyond-research"')[1].split('</section>')[0];
  const photos = [...section.matchAll(/<img src="([^"]+)"[^>]+>[\s\S]*?<figcaption><span>([^<]+)<\/span><time datetime="([^"]+)"/g)];
  assert.equal(photos.length, 10);
  assert.equal(new Set(photos.map(photo => photo[1])).size, 10);
  assert.deepEqual(photos.slice(0, 3).map(photo => photo[1].match(/plate-(\d+)/)[1]), ['45', '35', '14']);
  const gallery = readFileSync(new URL('../../gallery.md', import.meta.url), 'utf8').split('[[photo]]');
  photos.forEach(([, src, place, date]) => {
    const record = gallery.find(block => block.includes('thumb: ' + src));
    assert.ok(record, src);
    assert.ok(record.includes('date: ' + date), src + ' date');
    assert.ok(record.includes('location: ' + place + ' ·'), src + ' location');
    assert.notEqual(place, 'Macau');
  });
});

test('autoplay runs only while visible and uninterrupted', () => {
  assert.equal(canAutoplay(ready), true);
  assert.equal(canAutoplay({ ...ready, inView: false }), false);
  for (const reason of ['hidden', 'reducedMotion', 'userPaused', 'hovered', 'focused', 'dragging', 'moving']) {
    assert.equal(canAutoplay({ ...ready, [reason]: true }), false, reason);
  }
  assert.equal(canAutoplay({ ...ready, hovered: true, userPaused: true }), false);
});
