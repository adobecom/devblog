import './test-utils.mjs'; // Patch bugs for testing
import { expect } from 'chai';
import { getAuthorPagePath, getAuthorInfoFromPathAndHash } from '../scripts/devblog/authors.js';

describe('Test author pages paths mapping', () => {
  const codeRoot = '/code/root';

  // These are the mappings before the May 16 2025 changes
  // Including problematic strings such as '--' or and ending '-'
  const testCases = [
    { name:'Paul Blokk', path:'/code/root/en/authors/Paul_Blokk#UGF1bCBCbG9raw%3D%3D', imageFilename:'paul-blokk' },
    { name:'Mark A. Bee', path:'/code/root/en/authors/Mark_A__Bee#TWFyayBBLiBCZWU%3D', imageFilename:'mark-a-bee' },
    { name:'Simon F. Gee (The Boss)', path:'/code/root/en/authors/Simon_F__Gee__The_Boss_#U2ltb24gRi4gR2VlIChUaGUgQm9zcyk%3D', imageFilename:'simon-f-gee-the-boss' },
    { name:'C', path:'/code/root/en/authors/C#Qw%3D%3D', imageFilename:'c' },
    { name:'CafeBa b  e.', path:'/code/root/en/authors/CafeBa_b__e_#Q2FmZUJhIGIgIGUu', imageFilename:'cafeba-b-e' },
    { name:'Michel F. Scherrer', path:'/code/root/en/authors/Michel_F__Scherrer#TWljaGVsIEYuIFNjaGVycmVy', imageFilename:'michel-f-scherrer'},
    { name:'Simon G Gardner (Gardisto)', path:'/code/root/en/authors/Simon_G_Gardner__Gardisto_#U2ltb24gRyBHYXJkbmVyIChHYXJkaXN0byk%3D', imageFilename:'simon-g-gardner-gardisto'}
  ];

  const invalidPathsTestCases = [
    { path:'', name:undefined, imageFilename:undefined },
    { path:'someBadPath', name:undefined, imageFilename:undefined },
    { path:'pathWithBadHash#BAD_HASH', name:undefined, imageFilename:undefined }
  ]

  testCases.forEach(tc => {
    it(`Correctly maps [${tc.name}] to its page path`, () => {
      const path = getAuthorPagePath(codeRoot, tc.name);
      expect(path).to.equal(tc.path);

    });
  });

  testCases.forEach(tc => {
    it(`Correctly maps the author path [${tc.path}] back to its name and image filename`, () => {
      const info = getAuthorInfoFromPathAndHash(tc.path);
      expect(info.authorName).to.equal(tc.name);
      expect(info.authorImageFilename).to.equal(tc.imageFilename);
    });
  });

  invalidPathsTestCases.forEach(tc => {
    it(`Correctly handles invalid path [${tc.path}]`, () => {
      const info = getAuthorInfoFromPathAndHash(tc.path);
      expect(info.authorName).to.equal(tc.name);
      expect(info.authorImageFilename).to.equal(tc.imageFilename);
    });
  });
});