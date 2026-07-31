// Tags block for the devblog, where we do not use the taxonomy so far
import { SITE, buildTagItems } from '../../scripts/devblog/devblog.js';

export default async function init(blockEl) {
  blockEl.classList.add('tags');

  const tagItems = buildTagItems();
  const fallbackTags = blockEl.firstElementChild?.firstElementChild?.textContent;

  if (!tagItems.length && !fallbackTags) return;

  blockEl.innerHTML = '';
  const container = document.createElement('p');

  const items = tagItems.length ? tagItems : fallbackTags.split(', ').map((tag) => ({ value: tag.trim(), source: 'topic' }));

  items.forEach((item) => {
    const a = document.createElement('a');
    const value = item.value;

    if (item.source === 'cloud') {
      const params = new URLSearchParams();
      params.set('cloud', value);
      a.href = `${window.location.origin}/?${params.toString()}`;
    } else if (item.source === 'app') {
      const params = new URLSearchParams();
      params.set('prod', value);
      a.href = `${window.location.origin}/?${params.toString()}`;
    } else {
      a.href = `${SITE.topicsRoot}/${value}`;
    }

    a.textContent = value;
    container.appendChild(a);
  });

  blockEl.append(container);
}
