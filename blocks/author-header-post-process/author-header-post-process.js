import { setLibs, getLibs, SITE } from '../../scripts/devblog/devblog.js';

setLibs(SITE.prodLibsPath);

const miloBlock = await import(`${getLibs()}/blocks/author-header/author-header.js`);
const { loadStyle, createTag } = await import(`${getLibs()}/utils/utils.js`);

export default async function init(blockEl) {
  await miloBlock.default(blockEl);

  blockEl.classList.add('author-header');

  loadStyle(`${getLibs()}/blocks/author-header/author-header.css`);
  loadStyle('/blocks/author-header/author-header.css');

  const section = blockEl.closest('.section');
  const socialBlock = section?.querySelector('.more-information');

  let isAdobeEmployee = false;
  let isDeveloperChampion = false;
  const ul = createTag('ul', { class: 'author-more-list' });

  if (socialBlock) {
    socialBlock.querySelectorAll(':scope > div').forEach((item) => {
      const label = item.children[0]?.textContent?.trim();
      const valueText = item.children[1]?.textContent?.trim()?.toLowerCase();

      if (!label) return;

      const key = label.toLowerCase();

      if (key === 'isadobeemployee') {
        isAdobeEmployee = valueText === 'true';
        return;
      }

      if (key === 'isdeveloperchampion') {
        isDeveloperChampion = valueText === 'true';
        return;
      }

      const linkEl = item.querySelector('a') || item.querySelector('.embed-twitter a');
      if (!linkEl?.href) return;

      const li = createTag('li', { class: 'author-more-item' });
      li.append(createTag('a', { href: linkEl.href, target: '_blank', rel: 'noopener', class: 'author-more-link' }, label));
      ul.append(li);
    });

    socialBlock.remove();
  }

  const title = blockEl.querySelector('.author-header-title');

  if (title) {
    let badgeClass = '';
    let badgeIconSrc = '';
    let altText = '';

    if (isDeveloperChampion) {
      badgeClass = 'author-name-badge champion-badge';
      badgeIconSrc = '/img/icons/champion-badge.png';
      altText = 'Champion';
    } else if (isAdobeEmployee) {
      badgeClass = 'author-name-badge adobe-badge';
      badgeIconSrc = '/img/icons/adobe-badge.svg';
      altText = 'Adobe';
    }

    if (badgeIconSrc) {
      const badge = createTag('span', { class: badgeClass });
      badge.append(createTag('img', { class: 'author-name-badge-text-logo', src: badgeIconSrc, alt: altText }));
      title.append(badge);
    }
  }
  const wrapper = blockEl.querySelector('.author-header-bio');
  if (wrapper && title) {
    wrapper.prepend(title);
    if (ul.children.length > 0) wrapper.append(ul);
  }
}