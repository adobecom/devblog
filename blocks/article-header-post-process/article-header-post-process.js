// Post-process the result of the article-header
// block to inject the author image, which Milo cannot load
// because the devblog uses dynamic author pages with no <img> tag.
import { setLibs, getLibs } from '../../scripts/devblog/devblog.js';
import { SITE } from '../../scripts/devblog/devblog.js';

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

  // Exit if Milo already added image
  const existingImg = authorImgDiv.querySelector('img');
  if (existingImg) {
    authorImgDiv.style.backgroundImage = 'none';
    return;
  }

  const authorName = authorLink.textContent.trim();
  const authorImageFilename = authorName.replace(/[^0-9a-z]/gi, '-').toLowerCase();
  const imageSrc = `/images/authors/${authorImageFilename}.png`;

  const img = document.createElement('img');
  img.alt = authorName;
  img.src = imageSrc;

  img.addEventListener('load', () => {
    // Re-check to avoid duplicate if Milo added image
    if (authorImgDiv.querySelector('img')) {
      authorImgDiv.style.backgroundImage = 'none';
      return;
    }
    authorImgDiv.style.backgroundImage = 'none';
    authorImgDiv.appendChild(img);
  });

  img.addEventListener('error', () => {
    if (!img.src.endsWith('.jpg')) {
      img.src = imageSrc.replace('.png', '.jpg');
    }
  });
}