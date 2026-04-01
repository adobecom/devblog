/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { SITE } from './devblog.js';

// Removed base64; use simple slug for author name
function getPageName(authorName) {
  return authorName.toLowerCase().replace(/[^0-9a-z]/gi, '-');
}

// Removed decoding; reverse slug to name + fixed length bug
function getAuthorName(pageName) {
  if (!pageName) return null;
  // Convert slug to name (hyphens → spaces, capitalize words) => e.g. "ingo-eichel" → "Ingo Eichel"

  return pageName
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getImageFilename(authorName) {
  return authorName?.trim().toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/gi, '-').replace(/-$/gi, '');
}

// Use pathname only; extract author info + fixed length bug
export function getAuthorInfoFromPathAndHash(pagePath) {
  if (!pagePath) return {};
  const matchGroups = pagePath.match(/en\/authors\/(.*)/);
  if (!matchGroups || matchGroups.length < 2) return {};
  const pageName = matchGroups[1];
  const authorName = getAuthorName(pageName);
  const info = {
    authorName,
    authorImageFilename: getImageFilename(authorName)
  };
  return info;
}

export function getAuthorPagePath(codeRoot, authorName) {
  return authorName ? `${codeRoot}${SITE.authorsRoot}/${getPageName(authorName)}` : null;
}