/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

// const __filename = fileURLToPath(import.meta.url);
// const __dirname  = path.dirname(__filename);

const BASE_URL        = 'https://blog.developer.adobe.com';
const QUERY_INDEX_URL = `${BASE_URL}/en/query-index.json`;
const AUTHORS_PATH    = path.resolve(__dirname, 'data', 'authors.json');
const REPORT_PATH     = path.resolve(__dirname, 'reports', 'validation-report.json');
const IMAGE_BASE_PATH = '/images/authors/';
const DEFAULT_IMAGE   = '/images/default-images/default-image-1.png';

//  Fetch Configuration 
const CONCURRENCY_LIMIT = 5;     // max parallel requests
const DELAY_BETWEEN_MS  = 300;   // ms between each author fetch
const MAX_RETRIES       = 3;     // retry attempts per request
const RETRY_BASE_DELAY  = 1500;  // base ms for exponential backoff
const FETCH_TIMEOUT_MS  = 10000; // per-request timeout

function slugify(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function extractMatch(regex, text) {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function isValidURL(url) {
  return /^https?:\/\/.+/i.test(url);
}

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

// Converts a raw doc key into a display label (max 2 Title-Cased words).
// e.g. "personal-blog" → "Personal Blog", "devTo" → "Dev To"
function formatLinkLabel(key = '') {
  return key
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .slice(0, 2)
    .join(' ');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs async tasks with a concurrency cap.
async function pLimit(items, limit, task) {
  const results = new Array(items.length);
  const queue   = items.map((item, i) => ({ item, i }));

  async function worker() {
    while (queue.length > 0) {
      const { item, i } = queue.shift();
      results[i] = await task(item, i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Reads a boolean flag row from the author doc HTML.
function extractBoolean(html, key) {
  const match = html.match(
    new RegExp(`<div>\\s*${key}\\s*</div>\\s*<div>\\s*(true|false)\\s*</div>`, 'i'),
  );
  return match ? match[1].toLowerCase() === 'true' : false;
}

//  Link Extraction 

// Rows in the "More Information" table that are not links.
const SKIP_KEYS = new Set([
  'more information',
  'isadobeemployee',
  'isdeveloperchampion',
  'author',
  'original-feed-which-is-not-sorted',
]);


//  Extracts all key→URL pairs from .plain.html and arbitrary value HTML are handled correctly ("Developers Live", "Personal-blog") 
 
function extractLinks(html) {
  let linkedin = '';
  const links  = [];

  const rowRe = /<div>\s*<div>([^<]{1,120})<\/div>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/gi;

  for (const [, rawKey, valueCell] of html.matchAll(rowRe)) {
    const keyTrimmed = rawKey.trim();
    const keyLower   = keyTrimmed.toLowerCase().replace(/[-\s]/g, '');

    if (SKIP_KEYS.has(keyTrimmed.toLowerCase()) || SKIP_KEYS.has(keyLower)) continue;

    const hrefMatch = valueCell.match(/href="(https?:\/\/[^"]+)"/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1];

    if (keyLower === 'linkedin' || href.includes('linkedin.com')) {
      linkedin = href;
    } else {
      links.push({ url: href, label: formatLinkLabel(keyTrimmed) });
    }
  }

  return { linkedin, links };
}

//  Author Builders

function makeEmptyAuthor(name, slug) {
  return {
    name,
    slug,
    profileUrl:          `${BASE_URL}/en/authors/${slug}`,
    title:               '',
    linkedin:            '',
    links:               [],
    isAdobeEmployee:     false,
    isDeveloperChampion: false,
    hasDoc:              false,
    docUrl:              `/en/authors/${slug}`,
    docImage:            '',
    image:               `${IMAGE_BASE_PATH}${slug}.png`,
    fallbackImage:       DEFAULT_IMAGE,
    latestArticle:       null,
  };
}

function extractAuthorData(html, name, slug) {
  // Title: first <p> immediately after <h1> or <h2>
  const title =
    extractMatch(/<h1[^>]*>.*?<\/h1>\s*<p>(.*?)<\/p>/is, html) ||
    extractMatch(/<h2[^>]*>.*?<\/h2>\s*<p>(.*?)<\/p>/is, html) ||
    '';

  const { linkedin, links } = extractLinks(html);

  // Prefer image inside <picture>, fall back to any <img>
  const docImage =
    extractMatch(/<picture[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i, html) ||
    extractMatch(/<img[^>]+src="([^"]+)"/i, html);

  return {
    name,
    slug,
    profileUrl:          `${BASE_URL}/en/authors/${slug}`,
    title,
    linkedin,
    links,
    isAdobeEmployee:     extractBoolean(html, 'isAdobeEmployee'),
    isDeveloperChampion: extractBoolean(html, 'isDeveloperChampion'),
    hasDoc:              true,
    docUrl:              `/en/authors/${slug}`,
    docImage,
    image:               `${IMAGE_BASE_PATH}${slug}.png`,
    fallbackImage:       DEFAULT_IMAGE,
    latestArticle:       null,
  };
}

function isAuthorComplete(author) {
  return (
    author.hasDoc &&
    !isEmpty(author.name) &&
    !isEmpty(author.slug) &&
    !isEmpty(author.title) &&
    isValidURL(author.linkedin) &&
    !isEmpty(author.docImage)
  );
}

function getAuthorIssues(author) {
  const issues = [];
  if (!author.hasDoc)                                  issues.push('No author landing page (Google Doc)');
  if (isEmpty(author.title))                           issues.push('Missing headline/title');
  if (isEmpty(author.linkedin))                        issues.push('Missing LinkedIn URL');
  if (author.linkedin && !isValidURL(author.linkedin)) issues.push('Invalid LinkedIn URL');
  if (isEmpty(author.docImage))                        issues.push('Missing image in author document');
  return issues;
}

//  Latest Article Map 

function buildLatestArticleMap(indexData) {
  const map = new Map();

  for (const { author, title, sortDate, updatedDate } of indexData) {
    if (!author || !title) continue;

    const ts =
      (sortDate && new Date(sortDate).getTime()) ||
      (updatedDate && new Date(updatedDate).getTime());

    if (!ts) continue;

    for (const name of author.split(',')) {
      const slug = slugify(name.trim());
      const existing = map.get(slug);

      if (!existing || ts > existing.ts) {
        map.set(slug, {
          title,
          ts,
          date: new Date(ts).toISOString().split('T')[0],
        });
      }
    }
  }

  return map;
}

//  Fetch Helpers

// Fetches a URL with timeout and exponential-backoff retries. No cache-busting.
async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      const reason        = error.name === 'AbortError' ? 'timeout' : error.message;
      const isLastAttempt = attempt === MAX_RETRIES;

      if (isLastAttempt) {
        console.warn(`⚠️  Failed after ${MAX_RETRIES} attempts [${reason}]: ${url}`);
        return null;
      }

      const backoff = RETRY_BASE_DELAY * attempt;
      console.warn(`   ↩️  Attempt ${attempt}/${MAX_RETRIES} failed [${reason}]. Retrying in ${backoff}ms…`);
      await delay(backoff);
    }
  }
  return null;
}

// Fetches query index; returns unique author list + raw rows for article lookup.
async function fetchQueryIndex() {
  console.log('📡 Fetching query index…');

  const response = await fetchWithRetry(QUERY_INDEX_URL);
  if (!response || !response.ok) {
    throw new Error(`Failed to fetch query index: ${response?.status ?? 'no response'}`);
  }

  const { data } = await response.json();

  const authorSet = new Set();
  data.forEach(({ author }) => {
    if (author) {
      author.split(',').forEach((a) => {
        const clean = a.trim();
        if (clean) authorSet.add(clean);
      });
    }
  });

  const authors = Array.from(authorSet).map((name) => {
    const slug = slugify(name);
    return { name, slug, docUrl: `${BASE_URL}/en/authors/${slug}` };
  });

  return { authors, indexData: data };
}

// Fetches the .plain.html for one author page.
async function fetchAuthorDoc(url) {
  const response = await fetchWithRetry(`${url}.plain.html`);
  if (!response || !response.ok) return null;

  try {
    const html = await response.text();
    return html && !html.includes('$AUTHOR$') ? html : null;
  } catch (error) {
    console.warn(`⚠️  Error reading response body for ${url}: ${error.message}`);
    return null;
  }
}

// Main validation function

async function validateAuthors() {
  console.log('🚀 Starting author validation…\n');

  try {
    const { authors: authorsFromIndex, indexData } = await fetchQueryIndex();
    console.log(`✅ Found ${authorsFromIndex.length} unique authors.\n`);
    console.log(`⚙️  Config: concurrency=${CONCURRENCY_LIMIT}, delay=${DELAY_BETWEEN_MS}ms, retries=${MAX_RETRIES}, timeout=${FETCH_TIMEOUT_MS}ms\n`);

    const latestArticleMap = buildLatestArticleMap(indexData);
    const authors = [];
    const report  = [];

    function isSuspiciousName(name = '') {
      const n = name.toLowerCase();
      return (
        n.includes('test') ||
        n.includes('sample') ||
        n.includes('demo') ||
        n.includes('devblog') ||
        n.includes('admin') ||
        n.length < 5
      );
    }

    async function processAuthor({ name, slug, docUrl }, index) {
      if (index > 0) await delay(DELAY_BETWEEN_MS);

      console.log(`🔄 [${String(index + 1).padStart(3, '0')}/${authorsFromIndex.length}] Processing: ${name}`);

      const html       = await fetchAuthorDoc(docUrl);
      const authorData = html
        ? extractAuthorData(html, name, slug)
        : makeEmptyAuthor(name, slug);

      const latest = latestArticleMap.get(slug);
      if (latest) authorData.latestArticle = { title: latest.title, date: latest.date };

      authorData.isComplete = isAuthorComplete(authorData);

      if (
        !authorData.isComplete &&
        authorData.name &&
        authorData.latestArticle?.title &&
        authorData.latestArticle?.date &&
        !isSuspiciousName(authorData.name)
      ) {
        report.push({
          name:   authorData.name,
          slug:   authorData.slug,
          docUrl: authorData.docUrl,
          hasDoc: authorData.hasDoc,
          issues: getAuthorIssues(authorData),
        });
      }

      return authorData;
    }

    const results = await pLimit(authorsFromIndex, CONCURRENCY_LIMIT, processAuthor);
    // results.forEach((a) => authors.push(a));

    results.forEach((a) => {
      if (
        a.name &&
        a.latestArticle?.title &&
        a.latestArticle?.date &&
        !isSuspiciousName(a.name)
      ) {
        authors.push(a);
      } else {
        console.log(`🚫 Skipped invalid author: ${a.name}`);
      }
    });
    authors.sort((a, b) => a.name.localeCompare(b.name));

    fs.mkdirSync(path.dirname(AUTHORS_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(REPORT_PATH),  { recursive: true });
    fs.writeFileSync(AUTHORS_PATH, JSON.stringify(authors, null, 2), 'utf-8');
    fs.writeFileSync(REPORT_PATH,  JSON.stringify(report,  null, 2), 'utf-8');

    const authorsWithDocs  = authors.filter((a) => a.hasDoc).length;
    const completeProfiles = authors.filter((a) => a.isComplete).length;

    console.log('\n🎉 Validation Complete!');
    console.log(`👥 Total Authors:        ${authors.length}`);
    console.log(`📄 Authors with Docs:    ${authorsWithDocs}`);
    console.log(`✅ Complete Profiles:    ${completeProfiles}`);
    console.log(`⚠️  Incomplete Profiles:  ${report.length}`);
    console.log(`📁 Authors File:         ${AUTHORS_PATH}`);
    console.log(`📊 Report File:          ${REPORT_PATH}`);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    process.exit(1);
  }
}

validateAuthors();