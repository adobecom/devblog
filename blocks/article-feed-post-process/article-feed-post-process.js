// Post-process the result of the article-feed 
// block to fix its picture elements, for default images
// and to get optimal image sizes.
//
// A bit of hack, but the alternative is to completely
// override the original block, which is not better.
import { setLibs, getLibs } from '../../scripts/devblog/devblog.js';
import { recreatePicture, createOptimizedPicture, getDefaultImageNumber, SITE } from '../../scripts/devblog/devblog.js';
setLibs(SITE.prodLibsPath);
// Importing the local article-feed override instead of the default Milo block.
// See blocks/article-feed/article-feed.js for details on the custom behavior.
const miloBlock = await import('../article-feed/article-feed.js');
const { loadStyle } = await import(`${getLibs()}/utils/utils.js`);

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