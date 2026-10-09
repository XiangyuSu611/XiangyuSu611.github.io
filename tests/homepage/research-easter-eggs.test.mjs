import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { SCENES, createSceneLoader, pointerPose } from '../../assets/homepage/research-easter-eggs.js';

test('two interests have distinct approved assets and scientific descriptions', () => {
  assert.notEqual(SCENES.robot.asset, SCENES.materials.asset);
  assert.match(SCENES.robot.asset, /robot-arm-planning-v2/);
  assert.match(SCENES.materials.asset, /photo-material-3d-v2/);
  assert.equal(SCENES.materials.label, 'Photo + Material → 3D');
  assert.match(SCENES.materials.announcement, /differently shaped.*wooden legs/);
});

test('scene images load lazily, cache independently, and never share an image', async () => {
  const calls = {robot: 0, materials: 0};
  const images = Object.fromEntries(Object.keys(calls).map(kind => [kind, {src: '', decode() { calls[kind]++; return Promise.resolve(); }}]));
  const elements = Object.fromEntries(Object.entries(images).map(([kind, img]) => [kind, {querySelector: () => img}]));
  const load = createSceneLoader(elements);
  assert.deepEqual(calls, {robot: 0, materials: 0});
  const first = load('robot');
  assert.equal(load('robot'), first);
  await Promise.all([first, load('materials')]);
  assert.deepEqual(calls, {robot: 1, materials: 1});
  assert.equal(images.robot.src, SCENES.robot.asset);
  assert.equal(images.materials.src, SCENES.materials.asset);
  await assert.rejects(load('unknown'), /Unknown scene/);
});

test('a failed asset can be retried', async () => {
  let calls = 0;
  const image = { decode() { return ++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(); }};
  const load = createSceneLoader({robot: {querySelector: () => image}});
  await assert.rejects(load('robot'), /offline/);
  await load('robot');
  assert.equal(calls, 2);
});

test('pointer motion is centered, bounded and safe for zero-size elements', () => {
  assert.deepEqual(pointerPose(50, 50, 100, 100), { x: 0, y: 0 });
  assert.deepEqual(pointerPose(0, 0, 100, 100), { x: -2, y: -1.5 });
  assert.deepEqual(pointerPose(200, 200, 100, 100), { x: 2, y: 1.5 });
  assert.deepEqual(pointerPose(1, 1, 0, 0), { x: 0, y: 0 });
});

test('homepage has two native opt-in triggers, hidden cameo and accessible close', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const triggers = [...html.matchAll(/<button type="button" class="research-egg-trigger" data-research-egg="([^"]+)"/g)];
  assert.deepEqual(triggers.map(match => match[1]), ['robot', 'materials']);
  assert.match(html, /id="research-cameo"[^>]*hidden/);
  assert.ok(html.includes('aria-label="Close research illustration"'));
  assert.equal((html.match(/data-scene="[^"]+" hidden/g) || []).length, 2);
  assert.match(html, /Polish, then place\./);
  assert.equal((html.match(/aria-controls="research-cameo" aria-expanded="false"/g) || []).length, 2);
  const css = readFileSync(new URL('../../assets/homepage/research-easter-eggs.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-paused="true"/);
});

test('final styling uses backing for both dark scenes and a 15 percent smaller arm', () => {
  const css = readFileSync(new URL('../../assets/homepage/research-easter-eggs.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-theme="dark"\] \.research-cameo-entry\s*\{[^}]*background: #FAF9F6/s);
  assert.match(css, /\.research-cameo-robot \.research-cameo-parallax\s*\{ width: 264px/);
});
