import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import { plainAuthors, buildCitation } from '../../assets/homepage/publication-citations.js';

const source = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const md = readFileSync(new URL('../../content.md', import.meta.url), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const context = {};
runInNewContext(slice('    function escapeHtml', '    function stripInlineComment') +
  slice('    function stripInlineComment', '    function parseExperience') +
  'var SOCIAL_ICONS = {cv: {svg: "paper-icon"}, github: {svg: "code-icon"}};\n' +
  slice('    function renderPubItem', '    function renderPubs'), context);
const papers = context.parsePubs(context.parseSections(md).Publications);

test('all executable inline scripts compile', () => {
  for (const [, attrs, body] of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!attrs.includes('application/ld+json') && body.trim()) new Script(body);
  }
});

test('all four entries retain categories, content and the user name', () => {
  assert.equal(papers.length, 4);
  for (const paper of papers) {
    const html = context.renderPubItem(paper);
    assert(html.includes('<strong>Xiangyu Su</strong>'));
    assert(html.includes(paper.title));
    assert(html.indexOf('pub-category') < html.indexOf('pub-thumb'));
    assert(html.indexOf('pub-title') < html.indexOf('pub-authors'));
    assert(html.indexOf('pub-authors') < html.indexOf('pub-venue'));
  }
});

test('IMR separates award text and places evidence before Paper/Cite/Code/Project', () => {
  const html = context.renderPubItem(papers[0]);
  assert(html.includes('<span>ICRA 2026</span>'));
  assert(html.includes('class="pub-award">Best Paper Award in Automation</span>'));
  assert(html.indexOf('pub-tags') < html.indexOf('pub-actions'));
  assert(html.indexOf('</span>Paper') < html.indexOf('</span>Cite'));
  assert(html.indexOf('</span>Cite') < html.indexOf('</span>Code'));
  assert(html.indexOf('</span>Code') < html.indexOf('</span>Project'));
  for (const key of ['paper_url', 'code_url', 'project_url']) assert(html.includes(papers[0][key]));
});

test('under-review work keeps no resource or citation controls', () => {
  const html = context.renderPubItem(papers[1]);
  assert(html.includes('Under Review'));
  assert(!html.includes('pub-actions'));
  assert(!html.includes('data-citation'));
  assert.equal(buildCitation(papers[1]), '');
});

test('citation preserves author order and known year and arXiv metadata', () => {
  assert.deepEqual(plainAuthors(papers[0].authors), ['Xiangyu Su', 'Juzhan Xu', 'Oliver van Kaick', 'Kai Xu', 'Ruizhen Hu']);
  const bib = buildCitation(papers[0]);
  assert(bib.includes('@misc{su2026imrllm,'));
  assert(bib.includes('eprint = {2603.02669}'));
  assert(bib.includes('year = {2026}'));
  assert(!bib.includes('Best Paper'));
  assert(!bib.includes('booktitle'));
  assert(!bib.includes('https://juzhan'));
});

test('DOI and TeX-special characters are escaped without invented fields', () => {
  assert(buildCitation(papers[2]).includes('doi = {10.1007/978-981-96-5812-1\\_8}'));
  const bib = buildCitation({title: 'A & B {test}', authors: '**A B**', paper_url: 'https://example.org/paper'});
  assert(bib.includes('A \\& B \\{test\\}'));
  assert(!bib.includes('year ='));
});
