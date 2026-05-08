// Post-process the result of the article-header
// block to inject the author image, which Milo cannot load
// because the devblog uses dynamic author pages with no <img> tag.
import { toSlug } from '../../scripts/devblog/authors.js';
import { setLibs, getLibs, SITE } from '../../scripts/devblog/devblog.js';

setLibs(SITE.prodLibsPath);

const miloBlock = await import(`${getLibs()}/blocks/article-header/article-header.js`);
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

export default async function init(blockEl) {
  try {

  // Helpers - Fetches the article's .plain.html and If the first paragraph immediately after <h1> , contains a single YouTube / MP4 / WebM link, treat it as hero media instead of article body content.
  async function getHeroMediaUrl() {
    try {
      const res = await fetch(
        `${window.location.pathname.replace(/\/$/, '')}.plain.html`,
        { cache: 'no-store' },
      );
      if (!res.ok) return null;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const heroP = doc.querySelector('h1')?.nextElementSibling;
      if (!heroP || heroP.tagName !== 'P') return null;
      let firstNode = null;
      for (const node of heroP.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
        firstNode = node; break;
      }
      const href = firstNode?.nodeName === 'A' ? firstNode.getAttribute('href') : null;
      if (!href) return null;
      // Return the URL only if it is a recognised media type.
      return href.includes('youtube.com') || href.includes('youtu.be') || /\.(mp4|webm)(\?|$)/i.test(href)
        ? href : null;
    } catch (e) {
      console.error('PLAIN HTML ERROR:', e); return null;
    }
  }

  // Extracts the YouTube video ID from both youtu.be and youtube.com URLs.
  function extractYouTubeId(url = '') {
    try {
      const p = new URL(url);
      if (p.hostname.includes('youtu.be')) return p.pathname.replace('/', '').split('?')[0];
      if (p.hostname.includes('youtube.com')) return p.searchParams.get('v');
    } catch { /* noop */ }
    return null;
  }

  // Remove only the raw media anchor + trailing <br>s from the article body.
  function removeHeroMediaLink(url) {
    if (!url) return;
    document.querySelectorAll('main a[href]').forEach((a) => {
      if (blockEl.contains(a) || a.getAttribute('href') !== url) return;
      let next = a.nextSibling;
      while (next && (next.nodeName === 'BR' || (next.nodeType === Node.TEXT_NODE && !next.textContent.trim()))) {
        const del = next; next = next.nextSibling; del.remove();
      }
      a.remove();
    });
  }

  // Remove the orphaned caption Milo injects below the hero.
  function removeMiloCaption() {
    const hero = blockEl.querySelector('.article-feature-image, .article-feature-video');
    hero?.querySelectorAll('figcaption, p').forEach((el) => el.remove());
    let sib = hero?.nextElementSibling;
    while (sib?.tagName === 'P') {
      const next = sib.nextElementSibling;
      const links = sib.querySelectorAll('a');
      if (links.length && links[0].textContent.trim() === sib.textContent.trim()) sib.remove();
      sib = next;
    }
  }

  function runCleanup(url) {
    removeHeroMediaLink(url);
    removeMiloCaption();
    setTimeout(() => { removeHeroMediaLink(url); removeMiloCaption(); }, 600);
  }

  // Main flow 

  const mediaUrl = await getHeroMediaUrl();
  await miloBlock.default(blockEl);

  if (!mediaUrl) {
    // Default Milo flow (image / GIF) — just clean up the orphaned caption.
    runCleanup(null);
  } else {
    // Custom hero flow (YouTube / MP4 / WebM).
    runCleanup(mediaUrl);

    // Remove the duplicate lite-youtube Milo renders in the body for the HERO, We match by video ID, not just any lite-youtube.
    new MutationObserver(() => {
      document.querySelectorAll('main .milo-video').forEach((w) => {
        if (blockEl.contains(w)) return; // skip the hero block itself
        const liteYt = w.querySelector('lite-youtube');
        if (!liteYt) return;
        // Only remove if this embed's video ID matches the hero video ID.
        if (liteYt.getAttribute('videoid') === videoId) w.remove();
      });
    }).observe(document.querySelector('main'), { childList: true, subtree: true });

    // Build the correct media element (iframe for YouTube, <video> for MP4)

    const videoId = extractYouTubeId(mediaUrl);
    const isVideo = videoId || /\.(mp4|webm)(\?|$)/i.test(mediaUrl);

    let mediaEl = null;
    if (videoId) {
      mediaEl = Object.assign(document.createElement('iframe'), {
        src: `https://www.youtube.com/embed/${videoId}`,
        width: '100%', height: '100%', allowFullscreen: true, loading: 'lazy',
      });
      mediaEl.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      mediaEl.setAttribute('frameborder', '0');
    } else if (/\.(mp4|webm)(\?|$)/i.test(mediaUrl)) {
      mediaEl = Object.assign(document.createElement('video'), {
        src: mediaUrl, controls: true, muted: true, loop: true, autoplay: true, playsInline: true,
      });
    }
    // grab the image it may have "stolen" from the article body so we can restore it later.
    const heroContainer = blockEl.querySelector('.article-feature-image, .article-feature-video');
    const stolenPicture = blockEl.querySelector('.article-feature-image picture')?.cloneNode(true);

    const figure = document.createElement('figure');
    figure.className = 'figure-feature';
    if (mediaEl) figure.appendChild(mediaEl);

    if (!heroContainer) {
      // Milo didn't create a hero container — build one and insert it after the byline.
      const wrapper = document.createElement('div');
      wrapper.className = 'article-feature-video';
      wrapper.appendChild(figure);
      blockEl.querySelector('.article-byline')?.insertAdjacentElement('afterend', wrapper);
    } else {
      // Milo created a hero container — swap its contents for our media element.
      if (isVideo) heroContainer.classList.replace('article-feature-image', 'article-feature-video');
      heroContainer.replaceChildren(figure);

      // Restore the image Milo "stole" into the now-empty body figure.
      if (stolenPicture) {
        setTimeout(() => {
          const empty = [...document.querySelectorAll('.figure figure')]
            .find((f) => {
              const hasPicture = f.querySelector('picture');
              const hasVideo = f.querySelector('iframe, video, lite-youtube');

              return !hasPicture && !hasVideo;
            });
          empty?.appendChild(stolenPicture.cloneNode(true));
        }, 300);
      }
    }
  }

  // Author image injection

  blockEl.classList.add('article-header');
  loadStyle(`${getLibs()}/blocks/article-header/article-header.css`);

  const authorImgDiv = blockEl.querySelector('.article-author-image');
  const authorLink = blockEl.querySelector('.article-author a');

  if (!authorImgDiv || !authorLink) return;

  // If Milo already added an image, nothing to do.
  if (authorImgDiv.querySelector('img')) return;

  const authorSlug = toSlug(authorLink.textContent.trim());
  const imageSrc = `/images/authors/${authorSlug}.png`;
  const img = Object.assign(document.createElement('img'), { alt: authorLink.textContent.trim() });
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

  } catch (e) {
    console.error('ARTICLE HEADER POST PROCESS CRASH:', e);
  }
}