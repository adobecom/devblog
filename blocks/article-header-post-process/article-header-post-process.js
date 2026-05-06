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

  // Fetch .plain.html and detect hero media 
  async function getHeroMediaUrl() {
    try {
      const path = window.location.pathname.replace(/\/$/, '');
      const res = await fetch(`${path}.plain.html`, { cache: 'no-store' });
      if (!res.ok) return null;

      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const h1 = doc.querySelector('h1');
      if (!h1) return null;

      const heroP = h1.nextElementSibling;
      if (!heroP || heroP.tagName !== 'P') return null;

      // First meaningful child node must be the media <a>
      let firstNode = null;
      for (const node of heroP.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
        firstNode = node;
        break;
      }

      if (!firstNode || firstNode.nodeName !== 'A') return null;

      const href = firstNode.getAttribute('href');
      const isMedia = href.includes('youtube.com') || href.includes('youtu.be')
        || /\.(mp4|webm|gif)(\?|$)/i.test(href);

      return isMedia ? href : null;
    } catch (e) {
      console.warn('Error reading plain.html:', e);
      return null;
    }
  }

  const mediaUrl = await getHeroMediaUrl();

  // Extract YouTube video ID
  const videoId = mediaUrl?.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )?.[1] ?? null;

  // Build media element 
  function createMediaElement(url) {
    if (!url) return null;
    if (videoId) {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${videoId}`;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('loading', 'lazy');
      return iframe;
    }
    if (/\.(mp4|webm)(\?|$)/i.test(url)) {
      const video = document.createElement('video');
      video.src = url; video.controls = true; video.muted = true; video.loop = true;
      return video;
    }
    if (/\.gif(\?|$)/i.test(url)) {
      const img = document.createElement('img');
      img.src = url;
      return img;
    }
    return null;
  }

  const mediaEl = createMediaElement(mediaUrl);

  // Inject media into hero 
  const heroContainer = blockEl.querySelector('.article-feature-video, .article-feature-image');

  if (heroContainer && mediaEl && !heroContainer.querySelector('picture')) {
    const figure = document.createElement('figure');
    figure.className = 'figure-feature';
    figure.appendChild(mediaEl);
    heroContainer.replaceChildren(figure);
    heroContainer.classList.remove('article-feature-image');
    heroContainer.classList.add('article-feature-video');
  }

  function extractYouTubeId(url = '') {
    const match = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    return match ? match[1] : null;
  }

  // Remove ONLY duplicate hero YouTube link & Keep all other YouTube links (like section 2 Milo videos)

  if (videoId && mediaUrl) {

    function isSameAsHero(href = '') {
      return extractYouTubeId(href) === videoId;
    }

    function cleanDuplicateHeroLink() {
      document.querySelectorAll('main .content p').forEach((p) => {
        const a = p.querySelector('a[href]');
        if (!a) return;

        const href = a.getAttribute('href') || '';

        if (!isSameAsHero(href)) return;

        if (p.querySelector('lite-youtube, .milo-video')) return;

        if (p.textContent.trim() === a.textContent.trim()) {
          p.remove();
          return;
        }
        a.remove();

        // cleanup <br>
        while (p.firstChild && p.firstChild.nodeName === 'BR') {
          p.firstChild.remove();
        }
      });
    }

    cleanDuplicateHeroLink()

    // Run again after Milo renders
    const observer = new MutationObserver((_, obs) => {
      if (document.querySelector('main lite-youtube, main .milo-video')) {
        cleanDuplicateHeroLink();
        obs.disconnect();
      }
    });

    observer.observe(document.querySelector('main'), {
      childList: true,
      subtree: true,
    });
  }

  // Inject author image
  blockEl.classList.add('article-header');
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