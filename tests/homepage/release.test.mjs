import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { SCENES } from '../../assets/homepage/research-easter-eggs.js';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const content = readFileSync(new URL('content.md', root), 'utf8');

test('production has no dependency on the local preview', () => {
  assert.doesNotMatch(html + content, /refined-preview\//);
  assert.doesNotMatch(html, /<base\b|noindex, nofollow/);
  assert.match(html, /fetch\('content\.md'/);
  assert.match(html, /nosnippet, max-image-preview:none/);
  assert.match(html, /data-goatcounter="https:\/\/xiangyusu611\.goatcounter\.com\/count"/);
});

test('published homepage assets exist at their production paths', () => {
  const paths = [
    ...[...html.matchAll(/(?:src|href|poster)=["']((?:assets\/|style\.css)[^"']+)["']/g)].map(m => m[1]),
    ...[...content.matchAll(/^(?:photo|thumb|thumb_poster): (.+)$/gm)].map(m => m[1]),
    ...Object.values(SCENES).map(scene => scene.asset),
    'assets/homepage/signature-filter.svg',
  ];
  for (const path of paths) assert.ok(existsSync(new URL(path.split(/[?#]/)[0], root)), path);
});

test('Human Activity stays under review without publication links', () => {
  const paper = content.split('[[paper]]').find(p => p.includes('title: Human Activity Program Generation'));
  assert.ok(paper);
  assert.match(paper, /^venue: Under Review$/m);
  for (const key of ['paper_url', 'code_url', 'project_url']) assert.match(paper, new RegExp(`^${key}:\\s*$`, 'm'));
});
