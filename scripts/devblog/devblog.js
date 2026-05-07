/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// Code that's specific to the developers blog

import { setupDefaultImages } from './default-images.js';
import { setupTaxonomyProxy } from './taxonomy-proxy.js';
import { getAuthorInfoFromPathAndHash, getAuthorPagePath, toSlug } from './authors.js';

// The defaultImages values must be set this according to the contents of the default images folder
export const SITE = {
  team: 'Adobe Developers Blog Team',
  authorsRoot: '/en/authors',
  topicsRoot: '/en/topics',
  prodLibsPath: '/libs', // Use '/libs' if your live site maps '/libs' to milo's origin.
  articleCard: {
    breakpoints: [{ media: '(min-width: 600px)', width: '420' }, { width: '200' }]
  },
  articleFeed: {
    breakpoints: [{ width: '450' }]
  },
  defaultImages: {
    count: 13,
    prefix: '/images/default-images/default-image-'
  },
  lcpCss: [
    "/blocks/featured-article/featured-article.css",
    "/styles/styles.css"
  ],
  acronyms: [
    'AEM',
    'AI',
    'API',
    'ARM',
    'CEP',
    'PDF',
    'REST',
    'SDK',
    'UPIA',
    'UXP',
    'XD'
  ],
  disableAutoLinksText: ['link','playlist']
}

export function getDefaultImageNumber(articlePath) {
  // deterministic mapping of the article path
  // to our set of default images, so that a given
  // article always gets the same one
  const n = articlePath.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % SITE.defaultImages.count;
  return n;
}

// Recreate the given picture with new breakpoints
export function recreatePicture(picture, breakpoints) {
  const src = picture.querySelector('source')?.getAttribute('srcset');
  const path = src.split('?')[0];
  const alt = '';
  const eager = false;
  const newPic = createOptimizedPicture(path, alt, eager, breakpoints);
  picture.replaceWith(newPic);
}

export function addDevBlogBlockOverrides(overrides) {
  overrides.push({
    milo: 'tags',
    blog: 'devblog-tags',
  });
  overrides.push({
    milo: 'recommended-articles',
    blog: 'recommended-articles-post-process',
  });
  overrides.push({
    milo: 'article-feed',
    blog: 'article-feed-post-process',
  });
  overrides.push({
    milo: 'article-header',
    blog: 'article-header-post-process',
  });
  overrides.push({
    milo: 'author-header',
    blog: 'author-header-post-process',
  });
  overrides.push({
    milo: 'authors-list',
    blog: 'authors-list',
  });
  overrides.push({
    milo: 'featured-article',
    blog: 'featured-article-post-process',
  });
  return overrides;
}

/**
 * The decision engine to decide where to get Milo's libs from.
 */
export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      if(!prodLibs) {
        throw new Error("Missing prodLibs, value is required");
      }
      libs = (() => {
        const { hostname, search } = location || window.location;
        const hlxPipeline = hostname.includes('.hlx.') || hostname.includes('.aem.');
        const local = hostname.includes('local');
        if (!(hlxPipeline || local)) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (!/^[a-zA-Z0-9_-]+$/.test(branch)) throw new Error('Invalid branch name.');
        if (branch === 'local') return 'http://localhost:6456/libs';
        return branch.includes('--') ? `https://${branch}.aem.live/libs` : `https://${branch}--milo--adobecom.aem.live/libs`;
      })();
      return libs;
    }, () => libs,
  ];
})();

/**
 * List all components here that are found in our
 * web-components folder. This function loads the ones
 * which are actually used in the current document
 */
function loadWebComponents() {
  [
    'inline-gist'
  ].forEach(name => {
    if(document.querySelector(name)) {
      const script = document.createElement('script');
      script.setAttribute('src', `/web-components/${name}.js`);
      script.setAttribute('type', 'module');
      document.head.append(script);
    }
  })
}

/**
 * Normalizes all headings within a container element.
 * @param {Element} el The container element
 * @param {array} allowedHeadings The list of allowed headings (h1 ... h6)
 */
export function normalizeHeadings(el, allowedHeadings) {
  const allowed = allowedHeadings.map((h) => h.toLowerCase());
  el.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((tag) => {
    const h = tag.tagName.toLowerCase();
    if (allowed.indexOf(h) === -1) {
      // current heading is not in the allowed list -> try first to "promote" the heading
      let level = parseInt(h.charAt(1), 10) - 1;
      while (allowed.indexOf(`h${level}`) === -1 && level > 0) {
        level -= 1;
      }
      if (level === 0) {
        // did not find a match -> try to "downgrade" the heading
        while (allowed.indexOf(`h${level}`) === -1 && level < 7) {
          level += 1;
        }
      }
      if (level !== 7) {
        tag.outerHTML = `<h${level}>${tag.textContent}</h${level}>`;
      }
    }
  });
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {string} alt The image alt text
 * @param {boolean} eager load image eager
 * @param {Array} breakpoints breakpoints and corresponding params (eg. width)
 */
export function createOptimizedPicture(
  src,
  alt = '',
  eager = false,
  breakpoints = [{ media: '(min-width: 400px)', width: '2000' }, { width: '750' }],
) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webply&optimize=medium`);
    source.setAttribute('width', br.width);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      source.setAttribute('width', br.width);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      img.setAttribute('width', br.width);
      picture.appendChild(img);
    }
  });

  return picture;
}

/*
 * ------------------------------------------------------------
 * Edit below at your own risk
 * ------------------------------------------------------------
 */

function getImageCaption(picture) {
  // TODO need default pictures
  if(!picture) {
    return '';
  }

  // Check if the parent element has a caption
  const parentEl = picture.parentNode;
  let caption = parentEl.querySelector('em');
  if (caption) return caption;

  // If the parent element doesn't have a caption, check if the next sibling does
  const parentSiblingEl = parentEl.nextElementSibling;
  caption = parentSiblingEl
    && !parentSiblingEl.querySelector('picture')
    && parentSiblingEl.firstChild?.tagName === 'EM'
    ? parentSiblingEl.querySelector('em')
    : undefined;
  return caption;
}

/*
  * Topic pages have a unique page header.
  * Transform it into a Milo marquee with custom blog "mini" variant.
*/
async function topicHeader(createTag) {
  const imageEl = document.querySelector('main > div:first-of-type > p > picture');
  if (!imageEl) return;

  const heading = document.querySelector('main > div > p + h1, main > div > p + h2, main > div > h1, main > div > h2');
  const container = createTag('div', { class: 'marquee mini' });
  const background = createTag('div', { class: 'background' }, imageEl);
  const text = createTag('div', {}, heading);
  const foreground = createTag('div', { class: 'foreground' }, text);
  const para = document.querySelector('main > div > p');
  container.append(background, foreground);
  para.replaceWith(container);
}

export async function decorateContent() {
  const miloLibs = getLibs();
  const imgEls = document.querySelectorAll('main > div > p > picture');
  if (!imgEls.length) return;

  const { createTag, loadStyle } = await import(`${miloLibs}/utils/utils.js`);
  loadStyle(`${miloLibs}/blocks/figure/figure.css`);

  if (window.location.pathname.includes('/topics/')) return topicHeader(createTag);
  if (window.location.pathname.includes('/authors/')) return;

  imgEls.forEach((imgEl) => {
    const parentEl = imgEl.closest('p');
    if (!parentEl) return;

    const block = createTag('div', { class: 'figure' });
    const row = createTag('div');
    const caption = getImageCaption(imgEl);

    const wrapper = createTag('div', null, imgEl.cloneNode(true));
    row.append(wrapper);

    if (caption) {
      const em = createTag('p', null, caption.cloneNode(true));
      row.append(em);
      caption.remove();
    }

    block.append(row);

    // Preserve text before and after image
    const nodes = Array.from(parentEl.childNodes);
    const imgIndex = nodes.indexOf(imgEl);

    const beforeNodes = nodes.slice(0, imgIndex);
    const afterNodes = nodes.slice(imgIndex + 1);

    const fragment = document.createDocumentFragment();

    if (beforeNodes.length) {
      const beforeP = document.createElement('p');
      beforeNodes.forEach(n => beforeP.appendChild(n.cloneNode(true)));
      fragment.appendChild(beforeP);
    }

    fragment.appendChild(block);

    if (afterNodes.length) {
      const afterP = document.createElement('p');
      afterNodes.forEach(n => afterP.appendChild(n.cloneNode(true)));
      fragment.appendChild(afterP);
    }

    parentEl.replaceWith(fragment);
  });
}

/**
 * Builds a block DOM Element from a two dimensional array
 * @param {string} blockName name of the block
 * @param {any} content two dimensional array or string or object of content
 */
function buildBlock(blockName, content) {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return (blockEl);
}

function niceTopicWord(word) {
  const upper = word?.toUpperCase();
  if(SITE.acronyms.includes(upper)) {
    return upper;
  } else {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
}

function niceTopicName(topic) {
  return topic.split('-').map(niceTopicWord).join(' ');
}

function buildTopicPage(mainEl) {
  const topic = window.location.pathname.match(/en\/topics\/(.*)/)[1];
  document.querySelectorAll('body *').forEach(e => {
    if(e.childElementCount == 0) {
      e.textContent = e.textContent.replace(/\$TOPIC\$/, topic);
    }
  })
  const title = `Topic: ${niceTopicName(topic)}`;
  const h1 = document.createElement('h1');
  h1.classList.add('centerHeading');
  h1.textContent = title;
  mainEl.prepend(h1);
  document.title = title;
}

async function buildAuthorPage(mainEl) {

  // Replace author markers in the generic page
  // If we get a specific page it should be built with the
  // correct template to get the author's bio and feed
  const { authorName, authorImageFilename } = await getAuthorInfoFromPathAndHash(`${window.location.pathname}${window.location.hash}`);
  document.title = authorName;
  mainEl.querySelectorAll('*').forEach(e => {
    if(e.childElementCount === 0 && e.textContent.includes('$AUTHOR$')) {
      e.textContent = e.textContent.replace(/\$AUTHOR\$/, authorName);
    }
  })

  // Make sure heading is H1
  const div = mainEl.querySelector('div');
  const heading = div.querySelector('h1, h2');
  if (heading.tagName !== 'H1') {
    title = document.createElement('h1');
    title.textContent = heading.textContent;
    title.id = heading.id;
    heading.replaceWith(title);
  }

  const bio = document.createElement('p');
  bio.textContent = ''; // TODO optionally get bio from author page
  const pic = createOptimizedPicture(`/images/authors/${authorImageFilename}.png`, authorName);
  const ppic = document.createElement('p');
  ppic.append(pic);
  const authorHeader = buildBlock('author-header', [
    [{
      elems: [
        heading,
        ppic,
        bio
      ],
    }],
  ]);
  div.prepend(authorHeader);
}

function buildAuthorHeader(mainEl, social = null, socialLinks = null) {
  const div = mainEl.querySelector('div');
  const heading = div.querySelector('h1, h2');
  const bio = div.querySelector('h1 + p, h2 + p');
  const picture = div.querySelector('picture');

  let title;
  if (heading.tagName !== 'H1') {
    title = document.createElement('h1');
    title.textContent = heading.textContent;
    title.id = heading.id;
    heading.replaceWith(title);
  }

  const authorHeading = title ? title : heading;
  const authorHeader = buildBlock('author-header', [
    [{
      elems: [
        authorHeading,
        picture.closest('p'),
        bio,
        social,
        socialLinks,
      ],
    }],
  ]);

  div.prepend(authorHeader);
}

async function buildArticleHeader(el) {
  const miloLibs = getLibs();
  const { getMetadata, getConfig } = await import(`${miloLibs}/utils/utils.js`);
  const { loadTaxonomy, getLinkForTopic, getTaxonomyModule } = await import(`${miloLibs}/blocks/article-feed/article-helpers.js`);
  if (!getTaxonomyModule()) {
    await loadTaxonomy();
  }
  const div = document.createElement('div');
  // div.setAttribute('class', 'section');
  const h1 = el.querySelector('h1');
  const picture = el.querySelector('a[href*=".mp4"], picture');
  const caption = getImageCaption(picture);
  const figure = document.createElement('div');
  figure.append(picture, caption);
  const tag = getMetadata('article:tag');
  const category = tag || 'News';
  const author = getMetadata('author') || SITE.team;
  const { codeRoot } = getConfig();
  const authorSlug = toSlug(author);
  const authorURL = `/en/authors/${authorSlug}`;
  const publicationDate = getMetadata('publication-date');
  const authorImageFilename = authorSlug;
  const categoryTag = getLinkForTopic(category);

  const articleHeaderBlockEl = buildBlock('article-header', [
    [`<p>${categoryTag}</p>`],
    [h1],
    [`<p>${authorURL ? `<a href="${authorURL}" data-author-image="/images/authors/${authorImageFilename}.png">${author}</a>` : author}</p>
      <p>${publicationDate}</p>`],
    [figure],
  ]);
  div.append(articleHeaderBlockEl);
  el.prepend(div);
}

function buildTagsBlock() {
  const tagsArray = [...document.head.querySelectorAll('meta[property="article:tag"]')].map((el) => el.content) || [];
  const tagsBlock = buildBlock('tags', tagsArray.join(', '));
  document.querySelector('main')?.lastElementChild.append(tagsBlock);
}

function fixImportedContent() {
  // Fix m_date from imported Medium content, which is like
  // <meta name="m_date" content="2021-08-03">
  const date = document.head.querySelector('meta[name=m_date]');
  if(date) {    
    date.setAttribute('name','publication-date');
    // TODO does Milo use the locale, or a fixed format??
    const parts = date.content.split('-');
    date.content = `${parts[1]}-${parts[2]}-${parts[0]}`;
  }
}

// Gists are not separated as blocks in the original content, need
// to process them inline
function processGists(main) {
  main.querySelectorAll('a[href^="https://gist.github.com/"]').forEach(a => {
    const ig = document.createElement('inline-gist');
    ig.setAttribute('href', a.href);
    a.replaceWith(ig);
  })
}

export async function loadCSSURL(href,loadInfo) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      if(loadInfo) {
        link.setAttribute('data-load-info',loadInfo);
      }
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

function addLangRoot() {
  // needed for category link in article header
  const meta = document.createElement('meta');
  meta.name = 'lang-root';
  meta.content = '/en';
  document.head.append(meta);
}

async function eagerLoadCssForLCP() {
  setLibs(SITE.prodLibsPath);
  const miloLibs = getLibs();
  SITE.lcpCss.forEach(async path => {
    const url = `${miloLibs}${path}`;
    await loadCSSURL(url,'eagerLoad');
  })
}

// Prevent links which contain a specific text
// from being converted to blocks. Used to have
// plain youtube links in text for example, without
// creating a video player for them
function watchAutoLinks() {
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.tagName === 'A') {
          const text = target.textContent.trim().toLowerCase();
          const textMatch = SITE.disableAutoLinksText.find(t => text === t);
          if(textMatch) {
            console.debug(`Link text [${textMatch}] disables auto-blocking on a.href=${target.href}`);
            target.removeAttribute('class');
          }
        }
      }
    }
  });

  // Observe all existing <a> elements
  document.querySelectorAll('a').forEach((a) => {
    observer.observe(a, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

function redirectTaggedPath() {
  // Catch-all redirect for /tagged/*
  // Doing it at the CDN level would be better but it's easier
  // to manage here. If moving to CDN note one exception for now,
  // defined in the redirects sheet
  const tag = window.location.pathname.match(/tagged\/(.*)/)[1];
  window.location = `/en/topics/${tag}`;
}

function buildAuthorsListPage(mainEl) {
  document.title = 'Authors';

  // Clear out any $AUTHORS$ placeholder text and empty sections
  mainEl.innerHTML = '';

  // Build a section with the authors-list block and inject it
  const section = document.createElement('div');
  const authorsListBlock = buildBlock('authors-list', []);
  section.append(authorsListBlock);
  mainEl.append(section);
}

/**
 * Portrait image fix — called after decorateContent() so all .figure blocks exist.
 * Reads the actual width/height attrs on each img and if portrait,
 * caps the img's max-width to its natural pixel width.
 */
export function fixPortraitImages() {
  document.querySelectorAll('main .figure figure picture img[width][height]').forEach((img) => {
    const w = parseInt(img.getAttribute('width'), 10);
    const h = parseInt(img.getAttribute('height'), 10);
    if (w > 0 && (h > w)) {
      // Portrait: pin max-width to natural pixel width so it doesn't stretch
      img.style.maxWidth = `${w}px`;
      img.style.maxHeight = '600px';
      img.style.width = 'auto';
    }
  });
}

export async function buildDevblogAutoBlocks() {
  fixImportedContent();
  addLangRoot();
  setupTaxonomyProxy();
  eagerLoadCssForLCP();
  const mainEl = document.querySelector('main');
  if (window.location.pathname.match(/\/authors(\/|$)/)) {
    const path = window.location.pathname;

    // Authors list root page — inject authors-list block, no author-header needed
    if (path.replace(/\/$/, '') === SITE.authorsRoot) {
      buildAuthorsListPage(mainEl);
      loadWebComponents();
      setupDefaultImages();
      watchAutoLinks();
      return;
    }

  try {
    const res = await fetch(`${path}.plain.html`);

    if (res.ok) {
      const text = await res.text();

      // Check if it's a real author doc (not the generic template)
      if (text && text.trim().length > 0 && !text.includes('$AUTHOR$')) {

        const parser = new DOMParser();
        const fetchedDoc = parser.parseFromString(text, 'text/html');
        const social = fetchedDoc.querySelector('h3');
        const socialLinks = social ? social.nextElementSibling : null;
        buildAuthorHeader(mainEl, social, socialLinks);
        return;
      }
    }
  } catch (e) {
    console.warn('Error fetching author doc:', e);
  }

  // No specific doc → fallback to generic
    await buildAuthorPage(mainEl);
  } else if(window.location.pathname.match(/\/topics\//)) {
    buildTopicPage(mainEl);
  } else if(window.location.pathname.match(/\/tagged\//)) {
    redirectTaggedPath();
  } else if(window.location.pathname === '/' || window.location.pathname.match(/^\/en\/?$/)) {
    // homepage
  } else if(window.location.pathname.match(/\/search$/)) {
    // search page- leave search page as is
  } else if(window.location.pathname.match(/\/gnav$\//)) {
    // gnav page- leave gnav page as is
  } else {
    // article page
    await buildArticleHeader(mainEl);
    buildTagsBlock();
    processGists(mainEl);
  }
  loadWebComponents();
  setupDefaultImages();
  watchAutoLinks();
}


