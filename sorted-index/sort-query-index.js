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

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const compareNumbersInPaths = require('./sort-paths.js');

const QUERY_INDEX_URL = 'https://blog.developer.adobe.com/en/query-index.json';
const OUT_FILE = 'sorted-index/sorted-query-index.json';

// Permanent record of every article path that has been SUCCESSFULLY
// notified to Slack. This script only ever READS this file — it never
// writes to it, under any trigger (on-publish, manual, or cron). Only
// notify-slack.js writes to it, and only after a confirmed successful
// Slack delivery for a given article. This guarantees:
//   - cron can never mark an article as notified, since cron never calls
//     notify-slack.js and this script performs no writes here at all.
//   - an article is never considered "notified" before Slack actually
//     confirms delivery for it.
const NOTIFIED_ARTICLES_FILE = 'sorted-index/notified-articles.json';

// Written OUTSIDE the repo (OS tmp dir) so it never gets picked up by
// `git add .` in the on-publish workflow and never needs to be committed.
// Only produced when EMIT_NEW_ARTICLES=true (set by the on-publish workflow;
// left unset by cron, so cron can never generate this file).
const NEW_ARTICLES_FILE = path.join(os.tmpdir(), 'devblog-new-articles.json');
const EMIT_NEW_ARTICLES = process.env.EMIT_NEW_ARTICLES === 'true';

/**
 * Convert YYYY-MM-DD to Unix timestamp (seconds)
 */
function parseDateToTimestamp(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;

  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 0;

  const ms = Date.UTC(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10),
  );

  return Math.floor(ms / 1000);
}

function getSortTimestamp(entry) {
  // First try the updatedDate for sorting, if available and valid
  if (entry.updatedDate) {
    console.log(`Parsing updatedDate for "${entry.title}": ${entry.updatedDate}`);
    const updatedTs = parseDateToTimestamp(entry.updatedDate);
    if (updatedTs !== 0) {
      return updatedTs;
    }
  }

  //  Primary: sortDateTimestamp
  if (entry.sortDateTimestamp != null && !isNaN(entry.sortDateTimestamp)) {
    return parseInt(entry.sortDateTimestamp, 10);
  }

  // Secondary: sortDate
  if (entry.sortDate) {
    return parseDateToTimestamp(entry.sortDate);
  }

  return 0;
}
let fetchCount = 0;
function fetchData(url) {
  return new Promise((resolve, reject) => {
    fetchCount++;
    console.log('Total fetch calls:', fetchCount);
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function hasHeroVideo(articlePath) {
  try {
    const articleUrl = `https://blog.developer.adobe.com${articlePath}`;
    const html = await fetchData(articleUrl);

    const afterH1 = html.split(/<\/h1>/i)[1];
    if (!afterH1) return false;

    const firstParagraphMatch = afterH1.match(/<p>([\s\S]*?)<\/p>/i);

    if (!firstParagraphMatch) return false;

    const firstParagraph = firstParagraphMatch[1];

    const hrefMatch = firstParagraph.match(/href="([^"]+)"/i);

    if (!hrefMatch) return false;

    const href = hrefMatch[1];

    return (
      href.includes('youtube.com') || href.includes('youtu.be') || /\.(mp4|webm)(\?|$)/i.test(href)
    );
  } catch (err) {
    console.warn(`Failed to fetch ${articlePath}`, err.message);
    return false;
  }
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * Read-only load of the set of article paths already confirmed-notified.
 * This script never writes this file — see NOTIFIED_ARTICLES_FILE comment
 * above. Missing/corrupt file is treated as "nothing notified yet" rather
 * than failing the run.
 */
function loadNotifiedPaths() {
  if (!fs.existsSync(NOTIFIED_ARTICLES_FILE)) return new Set();

  try {
    const parsed = JSON.parse(fs.readFileSync(NOTIFIED_ARTICLES_FILE, 'utf8'));
    return new Set(Array.isArray(parsed.paths) ? parsed.paths : []);
  } catch (err) {
    console.log(`Could not read ${NOTIFIED_ARTICLES_FILE}, treating as empty:`, err.message);
    return new Set();
  }
}

/**
 * Write the list of newly-discovered (not-yet-notified) articles, if any,
 * to NEW_ARTICLES_FILE, and expose a has_new_articles output for the
 * workflow, when enabled. No-op entirely unless EMIT_NEW_ARTICLES=true, so
 * cron runs (which never set that env var) can never produce this file.
 */
function emitNewArticles(newArticles) {
  if (!EMIT_NEW_ARTICLES) return;

  try {
    fs.writeFileSync(NEW_ARTICLES_FILE, JSON.stringify(newArticles, null, 2));
    console.log(`📝 Wrote ${newArticles.length} new article(s) to ${NEW_ARTICLES_FILE}`);
  } catch (err) {
    // Never let a notification-side failure break the indexing run.
    console.warn(`Could not write ${NEW_ARTICLES_FILE}:`, err.message);
  }

  if (process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_new_articles=${newArticles.length > 0}\n`);
    } catch (err) {
      console.warn('Could not write GITHUB_OUTPUT:', err.message);
    }
  }
}

async function fetchAndSort() {
  try {
    console.log(`Fetching ${QUERY_INDEX_URL}`);
    const response = await fetchData(QUERY_INDEX_URL);
    const blogData = JSON.parse(response);
    blogData.generatedAt = new Date().toISOString();

    if (!Array.isArray(blogData.data)) {
      throw new Error(`Invalid structure: "data" field is missing or not an array at ${QUERY_INDEX_URL}`);
    }

    console.log(`Found ${blogData.data.length} blog posts in the query index`);

    // filter out draft articles before sorting
    blogData.data = blogData.data.filter((article) => !article.path.includes('/drafts/'));

    // Build cache keyed by path from the existing sorted JSON.
    // Each cached entry stores { isHeroVideo, lastModified } so we can detect
    // whether the article has changed since the last run.
    // NOTE: this cache is used ONLY for the isHeroVideo reuse decision below
    // — it is NOT used for new-article detection (see notifiedPaths further
    // down), since it mirrors OUT_FILE and can lose an entry entirely if an
    // article is temporarily unpublished.
    const cache = {};
    if (fs.existsSync(OUT_FILE)) {
      try {
        const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
        (existing.data || []).forEach((e) => {
          if ('isHeroVideo' in e) {
            cache[e.path] = { isHeroVideo: e.isHeroVideo, lastModified: e.lastModified };
          }
        });
      } catch (err) {
        console.log(`Could not read existing cache from ${OUT_FILE}:`, err.message);
      }
    }

    // Read-only lookup of every path already confirmed-notified. "New" (for
    // Slack purposes) means "not yet confirmed-notified" — NOT "not
    // currently in the live sorted index" — so an unpublish/republish never
    // re-triggers a notification for a path that was already delivered.
    const notifiedPaths = loadNotifiedPaths();

    let fetchedCount = 0;
    let cachedCount = 0;
    const newArticles = [];

    for (const article of blogData.data) {
      const cached = cache[article.path];
      const isNew = !notifiedPaths.has(article.path);
      const unchanged = cached && cached.lastModified === article.lastModified;

      if (unchanged) {
        article.isHeroVideo = cached.isHeroVideo;
        cachedCount++;
      } else {
        article.isHeroVideo = await hasHeroVideo(article.path);
        fetchedCount++;
        console.log(`  ${article.path} → isHeroVideo: ${article.isHeroVideo} (${cached ? 'lastModified changed' : 'new article'})`);
      }

      if (isNew) {
        newArticles.push({
          title: article.title,
          path: article.path,
          lastModified: article.lastModified,
          image: article.image || '',
          description: article.description || '',
        });
      }
    }

    console.log(`✅ Hero video check: ${fetchedCount} fetched, ${cachedCount} served from cache`);
    console.log(`🆕 Not-yet-notified articles detected: ${newArticles.length}`);

    blogData.data.sort((a, b) => {
      const tsA = getSortTimestamp(a);
      const tsB = getSortTimestamp(b);

      // If either has timestamp → sort by date (newest first)
      if (tsA !== 0 && tsB !== 0) {
        return tsB - tsA;
      }

      if (tsA !== 0) return -1;
      if (tsB !== 0) return 1;

      // Final fallback → path numeric sorting
      return compareNumbersInPaths(a.path, b.path);
    });

    const sortedData = { ...blogData };

    let hasChanges = true;
    if (fs.existsSync(OUT_FILE)) {
      try {
        const existingContent = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
        existingContent.generatedAt = sortedData.generatedAt;
        hasChanges = !deepEqual(existingContent, sortedData);
      } catch (error) {
        console.log(`Error reading existing file ${OUT_FILE}, will overwrite:`, error.message);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      ensureDirectory(OUT_FILE);
      fs.writeFileSync(OUT_FILE, JSON.stringify(sortedData, null, 2));
      console.log(`✅ Updated ${OUT_FILE} with ${sortedData.data.length} sorted blog posts`);
      console.log(`Most recent post: ${sortedData.data[0]?.title || 'N/A'} (${sortedData.data[0]?.lastModified || 'N/A'})`);
    } else {
      console.log('📋 No changes detected, file is already up to date');
    }

    // NOTE: this script does NOT write to NOTIFIED_ARTICLES_FILE, under any
    // trigger. Only notify-slack.js does, and only after a confirmed
    // successful Slack send per article.
    emitNewArticles(newArticles);

  } catch (error) {
    console.error('❌ Error sorting query index', error.message);
    process.exit(1);
  }
}

fetchAndSort();