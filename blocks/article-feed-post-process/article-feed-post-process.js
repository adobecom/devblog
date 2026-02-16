// Post-process the result of the article-feed 
// block to fix its picture elements, for default images
// and to get optimal image sizes.
//
// A bit of hack, but the alternative is to completely
// override the original block, which is not better.
import { setLibs, getLibs } from '../../scripts/devblog/devblog.js';
import { recreatePicture, createOptimizedPicture, getDefaultImageNumber, SITE } from '../../scripts/devblog/devblog.js';
setLibs(SITE.prodLibsPath);
const miloBlock = await import(`${getLibs()}/blocks/article-feed/article-feed.js`);
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

async function fetchArticleDate(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const publicationDate =
      doc.querySelector('meta[name="publication-date"]')?.content;

    const mDate =
      doc.querySelector('meta[name="m_date"]')?.content;

    const raw = publicationDate || mDate;
    if (!raw) return null;

    // format YYYY-MM-DD -> MM-DD-YYYY
    const parts = raw.split('-');
    if (parts.length === 3) {
      
      return `${parts[1]}-${parts[2]}-${parts[0]}`;
    }

    return raw;
  } catch (e) {
    console.warn('Date fetch failed:', url, e);
    return null;
  }
}


async function processArticleCard(card) {
  const eager = false;
  card.querySelectorAll('picture').forEach(pic => {
    const src = pic.querySelector('source').getAttribute('srcset');
    if(src.startsWith('/default-meta-image')) {
      // Use a deterministic variety of default images
      const card = pic.closest('a[class=article-card]');
      const n = getDefaultImageNumber(card?.href);
      const alt = card?.querySelector('h3').textContent;
      pic.replaceWith(createOptimizedPicture(`${SITE.defaultImages.prefix}${n}.png`,alt,eager,SITE.articleFeed.breakpoints));
    } else {
      pic.replaceWith(recreatePicture(pic, SITE.articleFeed.breakpoints));
    }
  })
  card.querySelectorAll('div[class=article-card-image]').forEach(div => {
    if(div.childElementCount == 0) {
      console.error('missing', div);
    }
  });

  // Fill article date
  const dateEl = card.querySelector('.article-card-date');

  if (dateEl && !dateEl.textContent.trim()) {
    const date = await fetchArticleDate(card.href);

    if (date) {
      dateEl.textContent = date;
    }
  }

}

function blockChanged(records, _observer) {
  for(const record of records) {
    for(const added of record.addedNodes) {
      if(added.classList.contains('article-card')) {
        processArticleCard(added);
      }
    }
  }
}

export default async function init(blockEl) {
  const observerOptions = {
    childList: true,
    subtree: true,
  };
  const observer = new MutationObserver(blockChanged);
  observer.observe(blockEl, observerOptions);

  await miloBlock.default(blockEl);
  blockEl.classList.add("article-feed");
  loadStyle(`${getLibs()}/blocks/article-feed/article-feed.css`);
}