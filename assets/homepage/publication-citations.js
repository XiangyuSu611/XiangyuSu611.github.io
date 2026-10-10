// Metadata comes only from the existing publication entry. Do not invent
// proceedings, page numbers, or a publisher for entries that don't provide them.
export function plainAuthors(value = '') {
  return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '')
    .split(',').map(name => name.trim()).filter(Boolean);
}

function bibEscape(value) {
  return String(value).replace(/[\\{}%&_#$]/g, char => '\\' + char);
}

export function buildCitation(paper) {
  if (!paper.paper_url) return '';
  const authors = plainAuthors(paper.authors);
  const year = paper.venue?.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const arxiv = paper.paper_url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/i)?.[1];
  const doi = paper.paper_url.match(/\/doi\/(10\.[^?#]+)/i)?.[1];
  const surname = (authors[0] || 'author').split(' ').at(-1).toLowerCase().replace(/[^a-z]/g, '');
  const titleKey = paper.title.split(/[ :]/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const fields = [
    `  title = {{${bibEscape(paper.title)}}}`,
    `  author = {${authors.map(bibEscape).join(' and ')}}`,
    ...(year ? [`  year = {${year}}`] : []),
    ...(arxiv ? [`  eprint = {${arxiv}}`, '  archivePrefix = {arXiv}'] : []),
    ...(doi ? [`  doi = {${bibEscape(decodeURIComponent(doi))}}`] : []),
    `  url = {${bibEscape(paper.paper_url)}}`,
  ];
  return `@misc{${surname}${year || ''}${titleKey},\n${fields.join(',\n')}\n}`;
}

export function initPublicationCitations(doc = document) {
  let dialog;
  let trigger;
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('[data-citation]');
    if (!button) return;
    const paper = JSON.parse(button.dataset.citation);
    const citation = buildCitation(paper);
    if (!citation) return;
    if (!dialog) {
      dialog = doc.createElement('dialog');
      dialog.className = 'citation-dialog';
      dialog.setAttribute('aria-labelledby', 'citation-heading');
      dialog.innerHTML = '<h2 id="citation-heading">Cite this work</h2>' +
        '<p class="citation-title"></p>' +
        '<textarea readonly aria-label="BibTeX citation" spellcheck="false"></textarea>' +
        '<div class="citation-controls"><button type="button" class="pub-action" data-copy>Copy BibTeX</button>' +
        '<button type="button" class="pub-action" data-close>Close</button>' +
        '<span class="citation-status" role="status" aria-live="polite"></span></div>';
      doc.body.append(dialog);
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => trigger?.focus());
      dialog.addEventListener('click', event => {
        const box = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
      });
      dialog.querySelector('[data-copy]').addEventListener('click', async () => {
        const field = dialog.querySelector('textarea');
        const status = dialog.querySelector('.citation-status');
        try {
          await doc.defaultView.navigator.clipboard.writeText(field.value);
          status.textContent = 'Copied!';
        } catch {
          field.focus();
          field.select();
          status.textContent = 'Selected — press ⌘C / Ctrl+C to copy.';
        }
      });
    }
    trigger = button;
    dialog.querySelector('.citation-title').textContent = paper.title;
    dialog.querySelector('textarea').value = citation;
    dialog.querySelector('.citation-status').textContent = '';
    dialog.showModal();
    dialog.querySelector('[data-copy]').focus();
  });
}

if (typeof document !== 'undefined') initPublicationCitations();
