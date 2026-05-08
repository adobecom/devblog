import { setLibs, getLibs, SITE } from '../../scripts/devblog/devblog.js';

setLibs(SITE.prodLibsPath);

const miloBlock = await import(`${getLibs()}/blocks/featured-article/featured-article.js`);
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

const extractYouTubeId = (url = '') =>
  url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];

const isGif = (url = '') => /\.gif(\?.*)?$/i.test(url);

const createMediaElement = (url = '') => {
  const ytId = extractYouTubeId(url);

  // YouTube → static thumbnail image (no autoplay on card)
  if (ytId) {
    const img = new Image();
    img.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    img.alt = '';
    return img;
  }

  // GIF → first-frame static snapshot via canvas
  if (isGif(url)) {
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
    };
    canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    return canvas;
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
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url;
    const res = await fetch(`${pathname}.plain.html`);
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

    // Only treat as video hero if the element immediately after h1
    // is a paragraph containing ONLY a video/YouTube link (nothing else)
    const h1 = doc.querySelector('h1');
    const nextEl = h1?.nextElementSibling;
    let mediaHref = '';

    if (nextEl?.tagName === 'P') {
      const links = nextEl.querySelectorAll('a[href]');
      const text = nextEl.textContent.trim();
      if (links.length === 1 && text === links[0].textContent.trim()) {
        const href = links[0].getAttribute('href');
        // Only capture if it's actually a YouTube or mp4 link
        if (extractYouTubeId(href) || /\.(mp4|webm)$/i.test(href)) {
          mediaHref = href;
        }
      }
    }

    return { mediaHref };
  } catch (e) {
    console.warn('fetchArticleData failed:', e);
    return null;
  }
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
    const href = card.getAttribute('href');
    if (!href) continue;

    // Safe URL parsing — works for both relative and absolute hrefs
    let pathname;
    try {
      pathname = href.startsWith('http') ? new URL(href).pathname : href;
    } catch (e) {
      continue;
    }

    const data = await fetchArticleData(pathname);
    // No video URL after h1 — leave Milo's picture as-is
    if (!data?.mediaHref) continue;

    const mediaEl = createMediaElement(data.mediaHref);
    if (!mediaEl) continue;

    // Replace Milo's <picture> with YouTube thumbnail or canvas (GIF first frame)
    const existingImgWrapper = card.querySelector('.featured-article-card-image');
    if (existingImgWrapper) {
      existingImgWrapper.innerHTML = '';
      existingImgWrapper.append(mediaEl);
    }
  }
}