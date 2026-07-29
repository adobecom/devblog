/**
 * unit tests for faceted filter functions
 *
 * tested methods: applyFilters, generateFacets, loadFiltersFromURL
 *
 * browser globals are set as minimal inert stubs to allow blog-search.js to load in Node
 */

globalThis.HTMLElement = class {};
globalThis.window = { location: { search: '', pathname: '/' } };
globalThis.customElements = { define: () => {} };

const { default: BlogSearch } = await import('../../web-components/search/blog-search.js');
import { expect } from 'chai';

const applyFilters = (data, filters) => BlogSearch.prototype.applyFilters.call({}, data, filters);
const generateFacets = (data) => BlogSearch.prototype.generateFacets.call({}, data);
const loadFiltersFromURL = () => BlogSearch.prototype.loadFiltersFromURL.call({});

const EMPTY_FILTERS = { cat: [], prod: [], author: [], date: [], type: [] };

const ARTICLE_UXP = {
  title: 'UXP Developer Guide',
  tags: '["UXP","Developer Tools"]',
  adobeCloud: 'Creative Cloud',
  adobeApp: 'Photoshop',
  author: 'Raymond Camden',
  sortDate: '2024-06-01',
  articleType: '',
};

const ARTICLE_FIREFLY = {
  title: 'Firefly API Overview',
  tags: '["Firefly","AI"]',
  adobeCloud: 'Creative Cloud',
  adobeApp: 'Firefly',
  author: 'Ingo Eichel',
  sortDate: '2024-03-15',
  articleType: '',
};

const ARTICLE_AEM = {
  title: 'AEM Headless Introduction',
  tags: '["AEM","CMS"]',
  adobeCloud: 'Experience Cloud',
  adobeApp: 'AEM',
  author: 'Raymond Camden',
  sortDate: '2023-11-20',
  articleType: '',
};

const ARTICLE_NO_TYPE = {
  title: 'General Article',
  tags: '["General"]',
  adobeApp: 'Acrobat',
  author: 'Test Author',
  sortDate: '2023-01-01',
};

// T01: OR logic within a single filter group

describe('T01 — applyFilters: OR within group', () => {
  it('returns only articles tagged "UXP" or "Firefly", excludes all others', () => {
    const data = [ARTICLE_UXP, ARTICLE_FIREFLY, ARTICLE_AEM];
    const filters = { ...EMPTY_FILTERS, cat: ['UXP', 'Firefly'] };
    const result = applyFilters(data, filters);
    expect(result).to.have.length(2);
    expect(result.map((a) => a.title)).to.include('UXP Developer Guide');
    expect(result.map((a) => a.title)).to.include('Firefly API Overview');
    expect(result.map((a) => a.title)).to.not.include('AEM Headless Introduction');
  });
});

// T02: AND logic across filter groups

describe('T02 — applyFilters: AND across groups', () => {
  it('returns only articles matching both criteria (cat=UXP AND prod=AEM)', () => {
    const data = [ARTICLE_UXP, ARTICLE_FIREFLY, ARTICLE_AEM];
    const filters = { ...EMPTY_FILTERS, cat: ['UXP'], prod: ['AEM'] };
    const result = applyFilters(data, filters);
    expect(result).to.have.length(0);
  });
});

// T03: Articles missing articleType field are handled gracefully

describe('T03 — applyFilters: missing articleType fields', () => {
  it('returns empty array when no article has articleType, throws no error', () => {
    const data = [ARTICLE_UXP, ARTICLE_FIREFLY, ARTICLE_NO_TYPE];
    const filters = { ...EMPTY_FILTERS, type: ['Tutorial'] };
    let result;
    expect(() => { result = applyFilters(data, filters); }).to.not.throw();
    expect(result).to.deep.equal([]);
  });
});

// T04: generateFacets: structure and deduplication

describe('T04 — generateFacets: structure, uniqueness, correct groups', () => {
  it('returns object with unique values per group and no duplicates', () => {
    const data = [ARTICLE_UXP, ARTICLE_FIREFLY, ARTICLE_AEM];
    const facets = generateFacets(data);

    expect(facets).to.have.all.keys('cat', 'prod', 'author', 'date', 'type');
    expect(facets.author.filter((a) => a === 'Raymond Camden')).to.have.length(1);
    expect(facets.prod.filter((p) => p === 'Creative Cloud')).to.have.length(1);
    expect(facets.author).to.include('Ingo Eichel');
  });
});

// T05: loadFiltersFromURL: reads URL params into correct groups

describe('T05 — loadFiltersFromURL: reads URL parameters correctly', () => {
  afterEach(() => {
    globalThis.window.location.search = '';
  });

  it('returns { cat: ["UXP", "Firefly"] } for URL ?cat=UXP&cat=Firefly', () => {
    globalThis.window.location.search = '?cat=UXP&cat=Firefly';
    const filters = loadFiltersFromURL();
    expect(filters.cat).to.deep.equal(['UXP', 'Firefly']);
    expect(filters.prod).to.deep.equal([]);
    expect(filters.author).to.deep.equal([]);
  });
});
