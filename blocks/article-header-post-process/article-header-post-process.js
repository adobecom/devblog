// Post-process the result of the article-header
// block to inject the author image, which Milo cannot load
// because the devblog uses dynamic author pages with no <img> tag.
import { toSlug } from '../../scripts/devblog/authors.js';
import { setLibs, getLibs, SITE } from '../../scripts/devblog/devblog.js';

setLibs(SITE.prodLibsPath);

const miloBlock = await import(`${getLibs()}/blocks/article-header/article-header.js`);
const { loadStyle, getMetadata } = await import(`${getLibs()}/utils/utils.js`);

function injectUpdatedNote(blockEl) {
  const updatedRaw = getMetadata('updated_date')
  const publicationRaw = getMetadata('publication-date');
  const updateNote = getMetadata('update_note');

  // Only show if updated_date exists
  if (!updatedRaw || !publicationRaw) return;

  function toReadable(dateStr) {
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    const normalized = isYMD
      ? dateStr
      : dateStr.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$1-$2');
    return new Date(`${normalized}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  const note = document.createElement('p');
  note.className = 'article-updated-note';
  note.innerHTML = `This article was first published on ${toReadable(publicationRaw)}. ${updateNote || ''}`;

  // Find the second section (article body section)
  const articleSection = document.querySelector('main > div.section:nth-of-type(2)');
  if (articleSection) {
    // Insert as first child of the section — before any content/figure blocks
    articleSection.insertAdjacentElement('afterbegin', note);
  } else {
    // fallback
    const heroEl = blockEl.querySelector('.article-feature-image, .article-feature-video');
    heroEl?.insertAdjacentElement('afterend', note);
  }
}

function loadGooglePublisherScript() {
  if (document.querySelector('script[src*="news.google.com/swg/js/v1/publisher.js"]')) return;
  const script = document.createElement('script');
  script.src = 'https://news.google.com/swg/js/v1/publisher.js';
  script.async = true;
  script.setAttribute('preferred-sources-control', 'manual');
  document.head.appendChild(script);

  window.PREFERRED_SOURCE = window.PREFERRED_SOURCE || [];
  window.PREFERRED_SOURCE.push((preferredSource) => {
    try {
      preferredSource.init({ theme: 'light', lang: 'en' });
      window.preferredSourceInstance = preferredSource;
    } catch {
      console.error("Script loading failed")
    }
  });
}

function injectGooglePreferredSource() {
  if (document.querySelector('.prefer-google-source-container')) return;

  const s2 = document.querySelector('main > div.section:nth-of-type(2)');
  if (!s2) return;

  const container = document.createElement('p');
  container.className = 'prefer-google-source-container';
  container.innerHTML = `
    <a href="https://www.google.com/preferences/source?q=blog.developer.adobe.com"
       target="_blank"
       rel="noopener noreferrer"
       class="prefer-google-source-link"
       title="Add Adobe Developer Blog as a preferred source on Google">
      <svg class="prefer-google-source-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 8v11a2 2 0 0 0 2 2h11"></path>
        <rect x="8" y="3" width="13" height="14" rx="1.5"></rect>
        <polygon points="14.5 6.2 15.5 8.5 17.8 8.8 16.1 10.5 16.6 12.8 14.5 11.6 12.4 12.8 12.9 10.5 11.2 8.8 13.5 8.5"></polygon>
      </svg>
      <span class="prefer-google-source-text">Add Adobe Developer Blog as a preferred source on Google</span>
    </a>
  `;

  const updatedNote = s2.querySelector('.article-updated-note');
  if (updatedNote) {
    updatedNote.insertAdjacentElement('afterend', container);
  } else {
    s2.insertAdjacentElement('afterbegin', container);
  }

  const link = container.querySelector('.prefer-google-source-link');
  if (link) {
    link.addEventListener('click', (e) => {
      if (window.preferredSourceInstance && typeof window.preferredSourceInstance.addPreferredSource === 'function') {
        try {
          e.preventDefault();
          window.preferredSourceInstance.addPreferredSource();
        } catch (err) {
          console.error(err)
        }
      }
    });
  }

  loadGooglePublisherScript();
}

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

      // youtube.com/watch?v=<id> & youtube.com/shorts/<id>
      if (p.hostname.includes('youtube.com')) {
        const watchId = p.searchParams.get('v');
        if (watchId) return watchId;

        const shortsMatch = p.pathname.match(/\/shorts\/([^/?]+)/);
        if (shortsMatch) return shortsMatch[1];
      }
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
  /**
    Portrait video support for in-body videos.  youtube.com/shorts/<id>  — YouTube Shorts URL ,  any YouTube URL + #portrait  — author explicitly marks it portrait
    Portrait videos bypass Milo and render as custom iframes. 
    Extract YouTube video ID from any YouTube URL
  */

  function extractYouTubeIdFromUrl(url = '') {
    try {
      const clean = url.replace(/#portrait$/i, '');
      const p = new URL(clean);
      if (p.hostname.includes('youtu.be')) return p.pathname.slice(1).split('?')[0];
      if (p.hostname.includes('youtube.com')) {
        const watchId = p.searchParams.get('v');
        if (watchId) return watchId;
        const shortsMatch = p.pathname.match(/\/shorts\/([^/?]+)/);
        if (shortsMatch) return shortsMatch[1];
        const liveMatch = p.pathname.match(/\/live\/([^/?]+)/);
        if (liveMatch) return liveMatch[1];
      }
    } catch { /* noop */ }
    return null;
  }

  // Detect portrait video URLs.
  function isPortraitUrl(url = '') {
    return url.includes('youtube.com/shorts/') || /#portrait$/i.test(url);
  }

  // Replace portrait video links with custom portrait embeds before Milo runs.
  // heroUrl is excluded — it belongs to the hero, not the body.
  function injectPortraitVideos(heroUrl = '') {
    const heroId = heroUrl ? extractYouTubeIdFromUrl(heroUrl) : null;

    document.querySelectorAll('main a[href]').forEach((a) => {
      // Skip anything inside the article-header block itself.
      if (blockEl.contains(a)) return;

      const href = a.getAttribute('href') || '';
      if (!isPortraitUrl(href)) return;

      const videoId = extractYouTubeIdFromUrl(href);
      if (!videoId) return;

      // Skip if this link is the hero media URL.
      if (heroId && videoId === heroId) return;

      // Use <figure> instead of <div> to prevent Franklin from auto-loading it as a block.
      const wrapper = document.createElement('figure');
      wrapper.className = 'portrait-video-wrapper';

      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${videoId}`;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('loading', 'lazy');
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

      wrapper.appendChild(iframe);

      // Replace original link with portrait embed.
      const container = a.closest('p') || a;
      container.replaceWith(wrapper);
    });
  }

  // Main flow — get hero URL first so injectPortraitVideos can exclude it.

  const mediaUrl = await getHeroMediaUrl();
  injectPortraitVideos(mediaUrl);  // run before Milo processing
  await miloBlock.default(blockEl);

  if (!mediaUrl) {
    // Default Milo flow (image / GIF) — just clean up the orphaned caption.
    runCleanup(null);
  } else {
    // Custom hero flow (YouTube / MP4 / WebM).
    runCleanup(mediaUrl);

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
    injectUpdatedNote(blockEl);
    injectGooglePreferredSource()
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