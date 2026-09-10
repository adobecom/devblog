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

// Reads the list of not-yet-notified articles written by sort-query-index.js
// and posts a rich Slack notification (hero image + title/link + description)
// for each one via an Incoming Webhook.
//
// This is the ONLY script that writes to NOTIFIED_ARTICLES_FILE, and it only
// adds a path AFTER a confirmed successful Slack delivery for that specific
// article. A failed send leaves the path out of the ledger entirely, so the
// next workflow run will naturally see that article as still not-yet-
// notified (via sort-query-index.js's read-only check) and retry it — no
// separate retry queue needed.
//
// Cron never calls this script, so cron can never mark anything as
// notified — combined with sort-query-index.js never writing this file
// itself, the ledger can only ever be updated by a confirmed Slack send.

const fs = require('fs');
const os = require('os');
const path = require('path');

const NEW_ARTICLES_FILE = path.join(os.tmpdir(), 'devblog-new-articles.json');
const NOTIFIED_ARTICLES_FILE = 'sorted-index/notified-articles.json';
const SITE_ORIGIN = 'https://blog.developer.adobe.com';

function loadNewArticles() {
  if (!fs.existsSync(NEW_ARTICLES_FILE)) {
    console.log(`No new-articles file at ${NEW_ARTICLES_FILE}, nothing to notify.`);
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(NEW_ARTICLES_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`Could not parse ${NEW_ARTICLES_FILE}:`, err.message);
    return [];
  }
}

function loadNotifiedPaths() {
  if (!fs.existsSync(NOTIFIED_ARTICLES_FILE)) return new Set();

  try {
    const parsed = JSON.parse(fs.readFileSync(NOTIFIED_ARTICLES_FILE, 'utf8'));
    return new Set(Array.isArray(parsed.paths) ? parsed.paths : []);
  } catch (err) {
    console.warn(`Could not read ${NOTIFIED_ARTICLES_FILE}, treating as empty:`, err.message);
    return new Set();
  }
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Persist the notified-paths ledger, only writing when it actually grew.
 * Called once at the end, after attempting all sends, so a single
 * filesystem write captures every successful delivery from this run.
 */
function saveNotifiedPaths(notifiedPaths, changed) {
  if (!changed) return;
  ensureDirectory(NOTIFIED_ARTICLES_FILE);
  const sortedPaths = Array.from(notifiedPaths).sort();
  fs.writeFileSync(NOTIFIED_ARTICLES_FILE, JSON.stringify({ paths: sortedPaths }, null, 2));
  console.log(`📚 Updated ${NOTIFIED_ARTICLES_FILE} (${sortedPaths.length} confirmed-notified paths)`);
}

/**
 * Resolve an article's `image` field to an absolute URL Slack can fetch, or
 * null if there's no usable image. Handles both blog-relative paths and the
 * YouTube-thumbnail-shaped paths seen for articles with an embedded video
 * hero (e.g. /vi/<id>/maxresdefault.jpg, relative to img.youtube.com).
 */
function resolveImageUrl(image) {
  if (!image || typeof image !== 'string') return null;

  const trimmed = image.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^\/vi\/[^/]+\/[^/]+\.(jpg|jpeg|png|webp)$/i.test(trimmed)) {
    return `https://img.youtube.com${trimmed}`;
  }

  return `${SITE_ORIGIN}${trimmed}`;
}

function buildMessage(article) {
  const url = `${SITE_ORIGIN}${article.path}`;
  const imageUrl = resolveImageUrl(article.image);
  const description = (article.description || '').trim();

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: ' *New blog article published*' },
    },
  ];

  if (imageUrl) {
    blocks.push({
      type: 'image',
      image_url: imageUrl,
      alt_text: article.title || 'Article hero image',
    });
  }

  const titleAndDescription = description
    ? `*<${url}|${article.title}>*\n${description}`
    : `*<${url}|${article.title}>*`;

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: titleAndDescription },
  });

  return {
    text: ` New blog article published: ${article.title}`, // fallback for notifications
    blocks,
  };
}

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

async function main() {
  const newArticles = loadNewArticles();

  if (newArticles.length === 0) {
    console.log('No new articles to notify about.');
    return;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ SLACK_WEBHOOK_URL is not set — skipping Slack notification. Nothing will be marked as notified, so this will be retried on the next run.');
    return;
  }

  const notifiedPaths = loadNotifiedPaths();
  let notifiedPathsChanged = false;

  console.log(`Attempting Slack notification(s) for ${newArticles.length} candidate article(s)`);

  for (const article of newArticles) {
    // Defensive re-check: if this path was already confirmed-notified
    // (e.g. by an overlapping run), don't send it again.
    if (notifiedPaths.has(article.path)) {
      console.log(`Skipping "${article.title}" — already confirmed-notified.`);
      continue;
    }

    try {
      await postToSlack(webhookUrl, buildMessage(article));
      console.log(`✅ Notified Slack: ${article.title}`);
      // Only mark as notified AFTER the send succeeds.
      notifiedPaths.add(article.path);
      notifiedPathsChanged = true;
    } catch (err) {
      // Do NOT add to notifiedPaths on failure — this article stays
      // eligible to be retried on the next run that reaches this script.
      console.warn(`⚠️ Failed to notify Slack for "${article.title}":`, err.message, '— will retry on next run.');
    }
  }

  saveNotifiedPaths(notifiedPaths, notifiedPathsChanged);

  // The temp candidate list is transient per-run either way — the
  // persistent ledger above (not this file) is what determines what still
  // needs to be (re)sent on the next run.
  try {
    fs.unlinkSync(NEW_ARTICLES_FILE);
  } catch (err) {
    console.warn(`Could not remove ${NEW_ARTICLES_FILE}:`, err.message);
  }
}

main();