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

const input = [
  '/en/publish/2025/03/build-adobe-express-add-ons-for-these-key-categories-and-get-funded',
  '/en/publish/2020/03/something',
  '/en/publish/2024/12/another-story',
  '/en/publish/2020/11/old-story',
  '/en/publish/2025/01/new-year-story',
  '/api/v2/users/123/posts',
  '/api/v1/users/456/posts',
  '/en/publish/2025/03/15/detailed-date-story'
];

const expected = [
  '/en/publish/2025/03/15/detailed-date-story',
  '/en/publish/2025/03/build-adobe-express-add-ons-for-these-key-categories-and-get-funded',
  '/en/publish/2025/01/new-year-story',
  '/en/publish/2024/12/another-story',
  '/en/publish/2020/11/old-story',
  '/en/publish/2020/03/something',
  '/api/v2/users/123/posts',
  '/api/v1/users/456/posts'
];

import { expect } from 'chai';
import compareNumbersInPaths from './sort-paths-wrapper.mjs';

describe('Test chronological sorting of paths', () => {
  it(`Correctly sorts the paths`, () => {
    const result = input.sort(compareNumbersInPaths);
    expect(result).to.deep.equal(expected);
  });
});
