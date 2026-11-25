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

// Reads the payload written by sort-query-index.js and posts Slack notifications:
//   - One message per newly published article  (📝 New blog article published)
//   - One message per meaningfully updated article (✏️ Blog article updated)
//
// Safety guarantees:
//  - No file, empty file, or empty arrays → exits quietly (exit 0).
//  - Missing SLACK_WEBHOOK_URL → logs a warning and exits quietly.
//  - A failed Slack POST is logged but does not fail the workflow.
//  - Tracking files (notified-articles.json, notified-updates.json) are
//    updated immediately after each successful POST so a mid-run crash or
//    a stray re-run can never re-send the same notification.

const fs = require('fs');
const os = require('os');
const path = require('path');

const NEW_ARTICLES_FILE = path.join(os.tmpdir(), 'devblog-new-articles.json');
const SITE_ORIGIN = 'https://blog.developer.adobe.com';

// Committed tracking files — updated here, committed by the workflow step
// that follows, so future runs never re-send the same notification.
const NOTIFIED_ARTICLES_FILE = path.join(__dirname, 'notified-articles.json');
const NOTIFIED_UPDATES_FILE  = path.join(__dirname, 'notified-updates.json');

// ---------------------------------------------------------------------------
// Payload loading
// ---------------------------------------------------------------------------

function loadPayload() {
  if (!fs.existsSync(NEW_ARTICLES_FILE)) {
    console.log(`No payload file at ${NEW_ARTICLES_FILE}, nothing to notify.`);
    return { newArticles: [], updatedArticles: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(NEW_ARTICLES_FILE, 'utf8'));

    // Support both the new { newArticles, updatedArticles } shape and the
    // legacy plain-array shape (in case of a partial deploy).
    if (Array.isArray(parsed)) {
      return { newArticles: parsed, updatedArticles: [] };
    }
    return {
      newArticles:    Array.isArray(parsed.newArticles)    ? parsed.newArticles    : [],
      updatedArticles: Array.isArray(parsed.updatedArticles) ? parsed.updatedArticles : [],
    };
  } catch (err) {
    console.warn(`Could not parse ${NEW_ARTICLES_FILE}:`, err.message);
    return { newArticles: [], updatedArticles: [] };
  }
}

// ---------------------------------------------------------------------------
// Tracking — new articles (flat array of paths)
// ---------------------------------------------------------------------------

function loadNotifiedPaths() {
  try {
    if (!fs.existsSync(NOTIFIED_ARTICLES_FILE)) return new Set();
    const parsed = JSON.parse(fs.readFileSync(NOTIFIED_ARTICLES_FILE, 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.warn(`Could not read ${NOTIFIED_ARTICLES_FILE}:`, err.message);
    return new Set();
  }
}

function markAsNotified(articlePath, currentNotifiedPaths) {
  currentNotifiedPaths.add(articlePath);
  try {
    const sorted = Array.from(currentNotifiedPaths).sort();
    fs.writeFileSync(NOTIFIED_ARTICLES_FILE, JSON.stringify(sorted, null, 2));
  } catch (err) {
    console.warn(`Could not update ${NOTIFIED_ARTICLES_FILE}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Tracking — updated articles (object: path → updatedDate)
// ---------------------------------------------------------------------------

function loadNotifiedUpdates() {
  try {
    if (!fs.existsSync(NOTIFIED_UPDATES_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(NOTIFIED_UPDATES_FILE, 'utf8'));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (err) {
    console.warn(`Could not read ${NOTIFIED_UPDATES_FILE}:`, err.message);
    return {};
  }
}

function markUpdateAsNotified(articlePath, updatedDate, currentNotifiedUpdates) {
  currentNotifiedUpdates[articlePath] = updatedDate;
  try {
    fs.writeFileSync(NOTIFIED_UPDATES_FILE, JSON.stringify(currentNotifiedUpdates, null, 2));
  } catch (err) {
    console.warn(`Could not update ${NOTIFIED_UPDATES_FILE}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Image URL resolution
// ---------------------------------------------------------------------------

function resolveImageUrl(image) {
  if (!image || typeof image !== 'string') return null;
  const trimmed = image.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // YouTube thumbnail path, e.g. /vi/<videoId>/maxresdefault.jpg
  if (/^\/vi\/[^/]+\/[^/]+$/i.test(trimmed)) {
    return `https://img.youtube.com${trimmed}`;
  }

  return `${SITE_ORIGIN}${trimmed}`;
}

// ---------------------------------------------------------------------------
// Slack message builders
// ---------------------------------------------------------------------------

function buildNewArticleMessage(article) {
  const url = `${SITE_ORIGIN}${article.path}`;
  const imageUrl = resolveImageUrl(article.image);
  const description = (article.description || '').trim();

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '📝 *New blog article published*' },
    },
  ];

  if (imageUrl) {
    blocks.push({ type: 'image', image_url: imageUrl, alt_text: article.title || 'Article hero image' });
  }

  const body = description
    ? `*<${url}|${article.title}>*\n${description}`
    : `*<${url}|${article.title}>*`;

  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: body } });

  return {
    text: `📝 New blog article published: ${article.title}`,
    blocks,
  };
}

function buildUpdateMessage(article) {
  const url = `${SITE_ORIGIN}${article.path}`;
  const imageUrl = resolveImageUrl(article.image);

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '✏️ *Blog article updated*' },
    },
  ];

  if (imageUrl) {
    blocks.push({ type: 'image', image_url: imageUrl, alt_text: article.title || 'Article hero image' });
  }

  // Build the body: title + updated date + update note (if available)
  let body = `*<${url}|${article.title}>*\n_Updated: ${article.updatedDate}_`;
  if (article.updateNote) {
    body += `\n${article.updateNote}`;
  }

  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: body } });

  return {
    text: `✏️ Blog article updated: ${article.title}`,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Slack HTTP POST
// ---------------------------------------------------------------------------

async function postToSlack(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook responded ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { newArticles, updatedArticles } = loadPayload();

  if (newArticles.length === 0 && updatedArticles.length === 0) {
    console.log('No new or updated articles to notify about.');
    return;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ SLACK_WEBHOOK_URL is not set — skipping Slack notification.');
    return;
  }

  // Load both tracking structures once; update in-memory + persist after each send.
  const notifiedPaths   = loadNotifiedPaths();
  const notifiedUpdates = loadNotifiedUpdates();

  // --- New articles ---
  const articlesToNotify = newArticles.filter((a) => !notifiedPaths.has(a.path));

  if (articlesToNotify.length > 0) {
    console.log(`Sending Slack notification(s) for ${articlesToNotify.length} new article(s)`);
  }

  for (const article of articlesToNotify) {
    try {
      await postToSlack(webhookUrl, buildNewArticleMessage(article));
      console.log(`✅ Notified Slack (new): ${article.title}`);
      markAsNotified(article.path, notifiedPaths);
    } catch (err) {
      console.warn(`⚠️ Failed to notify Slack for new article "${article.title}":`, err.message);
    }
  }

  // --- Updated articles ---
  // Second guard: filter out any concurrent-run edge case where notified-updates.json
  // was already committed with the same updatedDate before we got here.
  const updatesToNotify = updatedArticles.filter(
    (a) => notifiedUpdates[a.path] !== a.updatedDate,
  );

  if (updatesToNotify.length > 0) {
    console.log(`Sending Slack notification(s) for ${updatesToNotify.length} updated article(s)`);
  }

  for (const article of updatesToNotify) {
    try {
      await postToSlack(webhookUrl, buildUpdateMessage(article));
      console.log(`✅ Notified Slack (updated): ${article.title} — ${article.updatedDate}`);
      markUpdateAsNotified(article.path, article.updatedDate, notifiedUpdates);
    } catch (err) {
      console.warn(`⚠️ Failed to notify Slack for updated article "${article.title}":`, err.message);
    }
  }

  // Clean up temp file so a stray re-run of just this script can't re-send.
  try {
    fs.unlinkSync(NEW_ARTICLES_FILE);
  } catch (err) {
    console.warn(`Could not remove ${NEW_ARTICLES_FILE}:`, err.message);
  }
}

main();