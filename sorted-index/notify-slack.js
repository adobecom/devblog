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

// Reads the list of newly-discovered articles written by sort-query-index.js
// and posts a Slack notification for each one via an Incoming Webhook.
//
// Designed to be safe to always call from the on-publish workflow:
//  - No file, empty file, or empty array → exits quietly (exit 0).
//  - Missing SLACK_WEBHOOK_URL → logs a warning and exits quietly rather
//    than failing the workflow (Slack delivery should never block indexing,
//    which has already completed and been committed by the time this runs).
//  - A failed Slack POST is logged but does not fail the workflow.

const fs = require('fs');
const os = require('os');
const path = require('path');

const NEW_ARTICLES_FILE = path.join(os.tmpdir(), 'devblog-new-articles.json');
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

function buildMessage(article) {
  const url = `${SITE_ORIGIN}${article.path}`;
  return {
    text: `📝 New blog article published: ${article.title}`, // fallback for notifications
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📝 *New blog article published*\n*<${url}|${article.title}>*`,
        },
      },
    ],
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
    console.warn('⚠️ SLACK_WEBHOOK_URL is not set — skipping Slack notification.');
    return;
  }

  console.log(`Sending Slack notification(s) for ${newArticles.length} new article(s)`);

  for (const article of newArticles) {
    try {
      await postToSlack(webhookUrl, buildMessage(article));
      console.log(`✅ Notified Slack: ${article.title}`);
    } catch (err) {
      // Log and continue — one failed notification shouldn't block others
      // or fail the workflow (index already committed at this point).
      console.warn(`⚠️ Failed to notify Slack for "${article.title}":`, err.message);
    }
  }
}

main();