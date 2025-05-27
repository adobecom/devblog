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
const path = require('path');
const https = require('https');
const compareNumbersInPaths = require('./sort-paths.js');

const QUERY_INDEX_URL = 'https://blog.developer.adobe.com/en/query-index.json';
const OUT_FILE = 'sorted-index/sorted-query-index.json';

function fetchData(url) {
  return new Promise((resolve, reject) => {
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

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

async function fetchAndSort() {
  try {
    console.log(`Fetching ${QUERY_INDEX_URL}`);
    const response = await fetchData(QUERY_INDEX_URL);
    const blogData = JSON.parse(response);
    blogData.generatedAt = new Date().toISOString();
    
    if (!blogData.data || !Array.isArray(blogData.data)) {
      throw new Error(`Invalid structure: "data" field is missing or not an array at ${QUERY_INDEX_URL}`);
    }
    
    console.log(`Found ${blogData.data.length} blog posts in the query index`);
    
    const sortedData = {
      ...blogData,
      data: blogData.data.sort((a,b) => compareNumbersInPaths(a.path,b.path))
    };
    
    // Find out if there are data changes
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
    
  } catch (error) {
    console.error('❌ Error sorting query index', error.message);
    process.exit(1);
  }
}

fetchAndSort();