// Post-process the result of the recommended-articles
// block to fix its picture elements, for default images
// and to get optimal image sizes.
//
// A bit of hack, but the alternative is to completely
// override the original block, which is not better.
import {setLibs, getLibs, recreatePicture, createOptimizedPicture, getDefaultImageNumber, SITE} from '../../scripts/devblog/devblog.js';
setLibs(SITE.prodLibsPath);
const miloBlock = await import(`${getLibs()}/blocks/recommended-articles/recommended-articles.js`);
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

export default async function init(blockEl) {
  await miloBlock.default(blockEl);
  const eager = false;

  blockEl.querySelectorAll('a.article-card').forEach((article) => {
    const imageContainer = article.querySelector('div.article-card-image');

    if (!imageContainer) return;

    // Get description text
    const description = article.querySelector('.article-card-description')?.textContent || '';
    let mediaEl = null;

    // YouTube -> thumbnail image
    const ytMatch = description.match(
      /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/\S+/i,
    );

    if (ytMatch) {
      const ytUrl = ytMatch[0];
      let videoId = '';

      if (ytUrl.includes('youtu.be/')) {
        videoId = ytUrl.split('youtu.be/')[1]?.split(/[?&]/)[0] || '';
      } else {
        videoId = ytUrl.match(/[?&]v=([^&]+)/)?.[1] || '';
      }

      if (videoId) {
        const img = document.createElement('img');

        img.src = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        img.alt = '';
        img.loading = eager ? 'eager' : 'lazy';
        img.style.cssText = 'width:100%;height:100%;object-fit:initial;';
        img.onerror = () => { if (!img.src.includes('hqdefault')) img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; };
        mediaEl = img;
      }
    }

    // MP4 / WebM -> native video first frame

    const mp4Match = description.match(
      /https?:\/\/\S+\.(mp4|webm)(\?\S*)?/i,
    );

    if (!mediaEl && mp4Match) {
      const video = document.createElement('video');

      video.src = mp4Match[0];
      video.muted = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.setAttribute('aria-hidden', 'true');
      video.style.cssText = 'width:100%;height:100%;object-fit:initial;';
      video.onerror = () => {
        imageContainer.replaceChildren();
        const n = getDefaultImageNumber(article?.href);
        const alt = article?.querySelector('h3')?.textContent || '';
        imageContainer.append(createOptimizedPicture(`${SITE.defaultImages.prefix}${n}.png`, alt, eager, SITE.articleCard.breakpoints));
      };
      mediaEl = video;
    }

    // Replace image area with media element

    if (mediaEl) {
      imageContainer.replaceChildren(mediaEl);
    }

    // Fix missing default images

    if (imageContainer && imageContainer.childElementCount === 0) {
      const n = getDefaultImageNumber(article?.href);
      const alt = article?.querySelector('h3')?.textContent || '';
      imageContainer.append(createOptimizedPicture(`${SITE.defaultImages.prefix}${n}.png`, alt, eager, SITE.articleCard.breakpoints));
    }

    // And replace pictures with smaller ones
    article.querySelectorAll('picture').forEach(pic => {
      pic.replaceWith(recreatePicture(pic, SITE.articleCard.breakpoints));
    })
  })
  blockEl.classList.add("recommended-articles");
  await loadCSS(`${getLibs()}/blocks/recommended-articles/recommended-articles.css`);
}