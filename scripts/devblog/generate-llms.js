/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://blog.developer.adobe.com';
const INDEX_URL = `${BASE_URL}/sorted-index/sorted-query-index.json`;
const LOCAL_INDEX_PATH = path.join(__dirname, '..', '..', 'sorted-index', 'sorted-query-index.json');
const LLMS_OUT_PATH = path.join(__dirname, '..', '..', 'llms.txt');

/**
 * Load article index data from local disk or remote endpoint
 */
async function loadData() {
  if (fs.existsSync(LOCAL_INDEX_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_INDEX_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data)) {
        return parsed.data;
      }
    } catch (err) {
      console.warn('Could not read local sorted-query-index.json:', err.message);
    }
  }

  console.log(`Fetching articles index from ${INDEX_URL}...`);
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  const { data } = await res.json();
  return data;
}

/**
 * Clean, normalize, and polish article description for LLM readability
 */
function cleanDescription(desc, title) {
  let cleaned = (desc || '')
    .trim()
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ');

  // Replace copy-pasted banner updates from 2018 with real semantic descriptions
  if (/^Update\s+\d+\/\d+\/\d+:\s*Our CEP Getting Started/i.test(cleaned)) {
    const t = title.toLowerCase();
    if (t.includes('json')) {
      return 'How to handle JSON objects and data serialization between CEP panel JavaScript and ExtendScript.';
    }
    if (t.includes('promises') || t.includes('evalscript')) {
      return 'Guide to using ES6 promises for asynchronous evalScript calls in Photoshop CEP panels.';
    }
    if (t.includes('template strings')) {
      return 'Tutorial on using ES2015 (ES6) template string interpolation in Adobe CEP extensions.';
    }
    if (t.includes('debugging')) {
      return 'Guide to debugging Adobe CEP panels using Chrome Remote Debugger and ExtendScript Toolkit.';
    }
  }

  // Strip editorial prefixes that don't add semantic value for LLMs
  cleaned = cleaned
    .replace(/^Editor['’]s\s+Note:.*?[!.](?:\s+|$)/i, '')
    .replace(/^(Hello,\s+everyone!\s+)?I\s+am\s+[^.!?]+[.!?]\s*/i, '')
    .replace(/^[A-Z][a-zA-Z\s]+is\s+(Group\s+Product\s+Manager|a\s+recent\s+graduate|founder)[^.!?]+[.!?]\s*/i, '')
    .replace(/^[,;:\-\s]+/, '') // Strip any leading punctuation left over
    .trim();

  // If description was truncated with ellipsis, trim it cleanly
  cleaned = cleaned.replace(/[.…]+\s*$/, '').trim();

  // Ensure trailing punctuation without double periods
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  // Fallback if cleaned description is empty, incomplete or too short
  if (!cleaned || cleaned.length < 30 || /^(Over|Davide is)\s*\.?$/i.test(cleaned)) {
    const t = title.toLowerCase();
    if (t.includes('approved') && t.includes('rejections')) {
      return 'Best practices and review checklist to pass Adobe Express add-on marketplace submission and avoid common rejections.';
    }
    if (t.includes('oauth')) {
      return 'Implementation sample and guide for OAuth authentication in Adobe Photoshop.';
    }
    if (t.includes('8 steps')) {
      return 'Step-by-step guide to building and testing your first Photoshop UXP plugin.';
    }
    if (t.includes('image search')) {
      return 'Tutorial on building an image search plugin for Adobe Photoshop.';
    }
    if (t.includes('summer iso c++')) {
      return 'Highlights and standards updates from the Summer ISO C++ Standards Meeting.';
    }
    return `Technical guide and developer reference for ${title}.`;
  }

  return cleaned;
}

/**
 * Build standard-compliant llms.txt content following llmstxt.org format:
 * - [Title](URL): Description
 */
function buildLlmsTxt(articles) {
  const lines = [
    '# Adobe Developer Blog',
    '',
    '> The latest developer news, tutorials, and resources from Adobe.',
    '',
    `The Adobe Developer Blog (${BASE_URL}/) delivers technical articles, guides, tutorials, and roadmap updates for developers building across Adobe Express, Creative Cloud, Experience Cloud, and Document Cloud.`,
    '',
    '## Articles',
    'A complete, chronological directory of technical tutorials, architectural deep-dives, migration guides, and release notes from the Adobe Developer Blog. Key topic areas covered across these articles include:',
    '- **Adobe Express & Add-ons**: Building add-ons with the Add-on SDK, Developer MCP Server, Translation Connectors, theme APIs, and enterprise distribution.',
    '- **Creative Cloud Desktop Extensibility (UXP & CEP)**: UXP plugin APIs, Bolt UXP, Webview UI, native C++ hybrid plugins, and CEP-to-UXP migration roadmaps for Photoshop, Premiere Pro, InDesign, and Illustrator.',
    '- **Adobe Experience Cloud & Edge Delivery Services**: High-performance web publishing, Edge Delivery Services (EDS), Adobe Developer App Builder (I/O Runtime, serverless architecture), and Adobe Commerce storefront blocks.',
    '- **Adobe Document Cloud & Acrobat Services**: Acrobat APIs, PDF Services, WebAssembly module splitting, document generation, and automated PDF accessibility tagging.',
    '',
  ];

  articles.forEach((p) => {
    lines.push(`- [${p.title}](${BASE_URL}${p.path}): ${cleanDescription(p.description, p.title)}`);
  });

  return `${lines.join('\n').trim()}\n`;
}

/**
 * Generate llms.txt from an articles array
 */
function generateLlmsFiles(articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    console.warn('⚠️ No articles provided to generateLlmsFiles');
    return;
  }

  const llmsTxt = buildLlmsTxt(articles);
  fs.writeFileSync(LLMS_OUT_PATH, llmsTxt, 'utf8');
  console.log(`✅ llms.txt updated successfully (${articles.length} total articles, ${llmsTxt.length} bytes)`);
}

/**
 * Main execution
 */
async function run() {
  const isWatch = process.argv.includes('--watch') || process.argv.includes('-w');

  const articles = await loadData();
  generateLlmsFiles(articles);

  if (isWatch) {
    console.log(`👀 Watching ${LOCAL_INDEX_PATH} for changes...`);
    let debounceTimer = null;
    fs.watch(LOCAL_INDEX_PATH, (eventType) => {
      if (eventType === 'change') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          console.log(`\n🔄 Detected change in ${LOCAL_INDEX_PATH}. Regenerating llms.txt...`);
          try {
            const updatedArticles = await loadData();
            generateLlmsFiles(updatedArticles);
          } catch (err) {
            console.error('❌ Error updating llms.txt:', err.message);
          }
        }, 300);
      }
    });
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('❌ Failed to generate llms.txt:', err);
    process.exit(1);
  });
}

module.exports = {
  generateLlmsFiles,
  buildLlmsTxt,
  cleanDescription,
  loadData,
};
