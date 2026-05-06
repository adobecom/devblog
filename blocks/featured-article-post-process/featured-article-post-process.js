import { setLibs, getLibs, SITE } from '../../scripts/devblog/devblog.js';

setLibs(SITE.prodLibsPath);

const miloBlock = await import(`${getLibs()}/blocks/featured-article/featured-article.js`);
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

const extractYouTubeId = (url = '') =>
  url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];

const createMediaElement = (url = '') => {
  const ytId = extractYouTubeId(url);

  if (ytId) {
    const img = new Image();
    img.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    return img;
  }

  if (/\.(mp4|webm)$/i.test(url)) {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.preload = 'metadata';
    video.style.width = '100%';
    video.style.objectFit = 'cover';
    return video;
  }

  return null;
};

const extractTextWithoutLinks = (el) => {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('a').forEach((a) => a.remove());
  return clone.textContent.trim();
};

const fetchArticleData = async (url) => {
  const res = await fetch(`${url}.plain.html`);
  if (!res.ok) return null;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const firstPara = doc.querySelector('p');
  return {
    title: doc.querySelector('h1')?.textContent || '',
    description: extractTextWithoutLinks(firstPara),
    mediaHref: firstPara?.querySelector('a[href]')?.getAttribute('href') || '',
  };
};

export default async function init(blockEl) {
  blockEl.classList.add('featured-article');
  loadStyle(`${getLibs()}/blocks/featured-article/featured-article.css`);

  try {
    await miloBlock.default(blockEl);
  } catch (e) {
    console.warn('Milo failed:', e);
  }

  for (const card of blockEl.querySelectorAll('.featured-article-card')) {
    if (card.children.length) continue;

    const href = card.getAttribute('href');
    if (!href) continue;

    const data = await fetchArticleData(href);
    if (!data) continue;

    const mediaEl = createMediaElement(data.mediaHref);
    if (!mediaEl) continue;

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'featured-article-card-image';
    imgWrapper.append(mediaEl);

    const titleEl = document.createElement('h3');
    titleEl.className = 'featured-article-card-title';
    titleEl.textContent = data.title;

    const descEl = document.createElement('p');
    descEl.className = 'featured-article-card-description';
    descEl.textContent = data.description;

    const body = document.createElement('div');
    body.className = 'featured-article-card-body';
    body.append(titleEl, descEl);

    card.append(imgWrapper, body);
  }
}