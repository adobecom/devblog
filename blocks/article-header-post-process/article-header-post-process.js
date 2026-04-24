// Post-process the result of the article-header
// block to inject the author image, which Milo cannot load
// because the devblog uses dynamic author pages with no <img> tag.
import { toSlug } from '../../scripts/devblog/authors.js';
import { setLibs, getLibs, SITE } from '../../scripts/devblog/devblog.js';

setLibs(SITE.prodLibsPath);

const miloBlock = await import(`${getLibs()}/blocks/article-header/article-header.js`);
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

export default async function init(blockEl) {

  await miloBlock.default(blockEl);
  blockEl.classList.add("article-header");
  loadStyle(`${getLibs()}/blocks/article-header/article-header.css`);

  const authorImgDiv = blockEl.querySelector('.article-author-image');
  const authorLink = blockEl.querySelector('.article-author a');

  if (!authorImgDiv || !authorLink) return;

  // If Milo already added an image, nothing to do.
  if (authorImgDiv.querySelector('img')) return;

  const authorName = authorLink.textContent.trim();
  const authorSlug = toSlug(authorName);
  const imageSrc = `/images/authors/${authorSlug}.png`;

  const img = document.createElement('img');
  img.alt = authorName;
  img.setAttribute('data-devblog-author-img', '1');
  img.src = imageSrc;

  // If Milo adds its own image after ours, remove ours to avoid duplicates.
  const observer = new MutationObserver(() => {
    if (authorImgDiv.querySelectorAll('img').length > 1) {
      authorImgDiv.querySelector('img[data-devblog-author-img]')?.remove();
      observer.disconnect();
    }
  });
  observer.observe(authorImgDiv, { childList: true, subtree: true });

  img.addEventListener('load', () => {
    // Check again just before appending — Milo may have finished while image was loading.
    if (authorImgDiv.querySelector('img:not([data-devblog-author-img])')) {
      observer.disconnect();
      return;
    }
    authorImgDiv.style.backgroundImage = 'none';
    authorImgDiv.appendChild(img);
  });

  img.addEventListener('error', () => {
    // Fallback to .jpg if .png not found.
    if (!img.src.endsWith('.jpg')) img.src = imageSrc.replace('.png', '.jpg');
  });
}