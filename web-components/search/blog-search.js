import { getLibs } from '../../scripts/devblog/devblog.js';
import filterData from './blog-search-filter-data.js';
import { wrapWithPlayOverlay } from '../../scripts/utils.js';

// These will be loaded dynamically in the functions that need them
let createOptimizedPicture;
let decorateIcons;
let fetchPlaceholders;
let currentRenderId = 0;
let searchDebounceTimer;

async function loadMiloUtils() {
  if (!createOptimizedPicture) {
    const miloLibs = getLibs();
    const utils = await import(`${miloLibs}/utils/utils.js`);
    createOptimizedPicture = utils.createOptimizedPicture;
    decorateIcons = utils.decorateIcons;

    // Try to get fetchPlaceholders, fallback to empty function
    fetchPlaceholders = utils.fetchPlaceholders || (() => Promise.resolve({}));
  }
}

const searchParams = new URLSearchParams(window.location.search);
const DEFAULT_INDEX_SOURCE = '/sorted-index/sorted-query-index.json';

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

function getArticleSortTimestamp(article) {
  if (article.updatedDate) {
    const updatedTs = parseDateToTimestamp(article.updatedDate);
    if (updatedTs !== 0) return updatedTs;
  }

  if (article.sortDateTimestamp != null && !Number.isNaN(article.sortDateTimestamp)) {
    return parseInt(article.sortDateTimestamp, 10);
  }

  if (article.sortDate) {
    return parseDateToTimestamp(article.sortDate);
  }

  return 0;
}

// adobeCloud/adobeApp are authored as comma-separated strings in a single meta
// tag; split them so each product surfaces as its own facet value.
function splitProductValues(...fields) {
  return fields
    .filter(Boolean)
    .flatMap((field) => field.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

function comparePathNumbers(a, b) {
  const numbersA = a.match(/\d+/g)?.map(Number) || [];
  const numbersB = b.match(/\d+/g)?.map(Number) || [];
  const maxLength = Math.max(numbersA.length, numbersB.length);

  for (let i = 0; i < maxLength; i += 1) {
    const numA = numbersA[i] || 0;
    const numB = numbersB[i] || 0;
    if (numA !== numB) return numB - numA;
  }

  return 0;
}

function sortArticlesByPublicationDate(articles) {
  return [...articles].sort((a, b) => {
    const tsA = getArticleSortTimestamp(a);
    const tsB = getArticleSortTimestamp(b);

    if (tsA !== 0 && tsB !== 0) return tsB - tsA;
    if (tsA !== 0) return -1;
    if (tsB !== 0) return 1;

    return comparePathNumbers(a.path, b.path);
  });
}

function findNextHeading(el) {
  let preceedingEl = el.parentElement.previousElement || el.parentElement.parentElement;
  let h = 'H2';
  while (preceedingEl) {
    const lastHeading = [...preceedingEl.querySelectorAll('h1, h2, h3, h4, h5, h6')].pop();
    if (lastHeading) {
      const level = parseInt(lastHeading.nodeName[1], 10);
      h = level < 6 ? `H${level + 1}` : 'H6';
      preceedingEl = false;
    } else {
      preceedingEl = preceedingEl.previousElement || preceedingEl.parentElement;
    }
  }
  return h;
}

function highlightTextElements(terms, elements) {
  elements.forEach((element) => {
    if (!element || !element.textContent) return;

    const matches = [];
    const { textContent } = element;
    terms.forEach((term) => {
      let start = 0;
      let offset = textContent.toLowerCase().indexOf(term.toLowerCase(), start);
      while (offset >= 0) {
        matches.push({ offset, term: textContent.substring(offset, offset + term.length) });
        start = offset + term.length;
        offset = textContent.toLowerCase().indexOf(term.toLowerCase(), start);
      }
    });

    if (!matches.length) {
      return;
    }

    matches.sort((a, b) => a.offset - b.offset);
    let currentIndex = 0;
    const fragment = matches.reduce((acc, { offset, term }) => {
      if (offset < currentIndex) return acc;
      const textBefore = textContent.substring(currentIndex, offset);
      if (textBefore) {
        acc.appendChild(document.createTextNode(textBefore));
      }
      const markedTerm = document.createElement('mark');
      markedTerm.textContent = term;
      acc.appendChild(markedTerm);
      currentIndex = offset + term.length;
      return acc;
    }, document.createDocumentFragment());
    const textAfter = textContent.substring(currentIndex);
    if (textAfter) {
      fragment.appendChild(document.createTextNode(textAfter));
    }
    element.innerHTML = '';
    element.appendChild(fragment);
  });
}

// eslint-disable-next-line no-console
const logError = (ctx, msg, err = null) => console.error(`[blog-search][${new Date().toISOString()}] ${ctx}: ${msg}`, err || '');

async function fetchData(source) {
  let response;
  try {
    response = await fetch(source);
  } catch (err) {
    logError('fetchData', `network error fetching ${source}`, err);
    return null;
  }
  if (!response.ok) {
    logError('fetchData', 'non-2xx response', response);
    return null;
  }

  const json = await response.json();
  if (!json) {
    logError('fetchData', `empty response from ${source}`);
    return null;
  }

  return json.data;
}

function formatLongMonthDate(date) {
  if (!date) return '';

  const [year, month, day] = date.split('-');
  const jsDate = new Date(Date.UTC(year, month - 1, day));

  return jsDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatArticleCardDate(sortDate, updatedDate) {
  if (updatedDate && sortDate) {
    return `${formatLongMonthDate(updatedDate)} • First published ${formatLongMonthDate(sortDate)}`;
  }
  if (sortDate) return formatLongMonthDate(sortDate);
  if (updatedDate) return formatLongMonthDate(updatedDate);
  return '';
}

async function renderResult(result, searchTerms, titleTag, { showDate = false } = {}) {
  await loadMiloUtils();
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = result.path;
  if (result.image) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search-result-image';

    let mediaEl;

    if (result.image?.includes('/vi/')) {
      const match = result.image.match(/\/vi\/([^/?]+)/);
      if (match?.[1]) {
        const videoId = match[1];
        const img = document.createElement('img');
        img.src = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        img.alt = result.title || '';
        img.loading = 'lazy';
        img.onerror = () => { if (!img.src.includes('hqdefault')) img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; };
        mediaEl = img;
      }
    } else if (typeof createOptimizedPicture === 'function') {
      mediaEl = createOptimizedPicture(result.image, '', false, [{ width: '375' }]);
    } else {
      const img = document.createElement('img');
      img.src = result.image;
      img.alt = result.title || '';
      img.loading = 'lazy';
      mediaEl = img;
    }

    if (mediaEl) {
      wrapper.append(result.isHeroVideo === true ? wrapWithPlayOverlay(mediaEl) : mediaEl);
    }
    a.append(wrapper);
  }
  // This is for the tag of the search result
  if (result.tags) {
    try {
      const tagsArray = JSON.parse(result.tags);
      if (tagsArray.length && tagsArray.length > 0) {
        const tagElement = document.createElement('span');
        tagElement.className = 'search-result-tags';
        tagElement.textContent = tagsArray[0].toUpperCase().replace(/-/g, ' ');
        a.append(tagElement);
      }
    } catch (e) {
      if (result.tags) {
        const tagElement = document.createElement('span');
        tagElement.className = 'search-result-tag';
        tagElement.textContent = result.tags.toUpperCase().replace(/-/g, ' ');
        a.append(tagElement);
      }
    }
  }
  if (result.title) {
    const title = document.createElement(titleTag);
    title.className = 'search-result-title';
    const link = document.createElement('a');
    link.href = result.path;
    link.textContent = result.title;
    highlightTextElements(searchTerms, [link]);
    title.append(link);
    a.append(title);
  }
  if (result.description) {
    const description = document.createElement('p');
    description.textContent = result.description;
    highlightTextElements(searchTerms, [description]);
    a.append(description);
  }
  if (showDate) {
    const dateDisplay = formatArticleCardDate(result.sortDate, result.updatedDate);
    if (dateDisplay) {
      const dateElement = document.createElement('p');
      dateElement.className = 'search-result-date';
      dateElement.textContent = dateDisplay;
      a.append(dateElement);
    }
  }
  li.append(a);
  return li;
}

function clearSearchResults(component) {
  const searchResults = getSearchResultsEl(component);
  if (searchResults) {
    searchResults.innerHTML = '';
  }
}

function getSearchResultsEl(component) {
  return component.shadowRoot?.querySelector('.search-results') || component.querySelector('.search-results');
}

function clearSearch(component) {
  clearSearchResults(component);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = '';
    searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  }
}

function exploreResultsContainer(component) {
  const grid = document.createElement('ul');
  grid.className = 'explore-results';
  grid.dataset.h = findNextHeading(component);
  return grid;
}

async function renderExploreResults(component, config, filteredData, searchTerms) {
  currentRenderId += 1;
  const renderId = currentRenderId;

  const exploreResults = component.shadowRoot?.querySelector('.explore-results');
  if (!exploreResults) return;

  const headingTag = exploreResults.dataset.h;

  if (filteredData.length) {
    const dateOpts = { showDate: true };
    const results = await Promise.all(
      filteredData.map((result) => renderResult(result, searchTerms, headingTag, dateOpts)),
    );
    if (renderId !== currentRenderId) return;

    exploreResults.classList.remove('no-results');
    exploreResults.replaceChildren(...results);
  } else {
    if (renderId !== currentRenderId) return;

    const noResultsMessage = document.createElement('li');
    noResultsMessage.className = 'explore-no-results-message';
    noResultsMessage.setAttribute('role', 'status');

    const noResultsTitle = document.createElement('p');
    noResultsTitle.className = 'explore-no-results-title';
    noResultsTitle.textContent = config.placeholders.searchNoResults || 'No results found.';

    const noResultsHint = document.createElement('p');
    noResultsHint.className = 'explore-no-results-hint';
    noResultsHint.textContent = 'Try a different search term or adjust your filter selection.';

    noResultsMessage.append(noResultsTitle, noResultsHint);
    exploreResults.classList.add('no-results');
    exploreResults.replaceChildren(noResultsMessage);
  }
}

async function renderResults(component, config, filteredData, searchTerms) {
  currentRenderId += 1;
  const renderId = currentRenderId;

  const searchResults = getSearchResultsEl(component);
  if (!searchResults) return;

  const headingTag = searchResults.dataset.h;

  if (filteredData.length) {
    const results = await Promise.all(
      filteredData.map((result) => renderResult(result, searchTerms, headingTag)),
    );

    if (renderId !== currentRenderId) return;

    searchResults.classList.remove('no-results');
    // replaceChildren avoids a paint frame where :empty hides the panel (display: none)
    searchResults.replaceChildren(...results);
  } else {
    if (renderId !== currentRenderId) return;

    const noResultsMessage = document.createElement('li');
    noResultsMessage.textContent = config.placeholders.searchNoResults || 'No results found.';
    searchResults.classList.add('no-results');
    searchResults.replaceChildren(noResultsMessage);
  }
}

// filterData: see ./blog-search-filter-data.js (unit-tested in Node)

const topicMatch = window.location.pathname.match(/\/topics\/([^/?]+)/);
const currentTopic = topicMatch ? topicMatch[1] : null;

async function handleSearch(e, component, config) {
  const searchValue = e.target.value;

  searchParams.set('q', searchValue);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = searchParams.toString();
    window.history.replaceState({}, '', url.toString());
  }

  if (component.classList.contains('explore-facets')) {
    await component.refreshExploreView();
    return;
  }

  if (searchValue.length < 3) {
    clearSearch(component);
    return;
  }

  const searchTerms = searchValue.toLowerCase().split(/\s+/).filter((term) => term.length >= 3);

  try {
    let data = component.searchIndexData;
    if (!data) {
      data = await fetchData(config.source);
      if (data) component.searchIndexData = data;
    }
    if (!data) return;

    let scopedData = data;

    if (currentTopic) {
      scopedData = data.filter((item) => {
        if (!item.tags) return false;
        try {
          const tags = JSON.parse(item.tags);
          return tags.includes(currentTopic);
        } catch {
          return item.tags.includes(currentTopic);
        }
      });
    }

    const filteredData = filterData(searchTerms, scopedData);
    const facetFilteredData = component.applyFilters(filteredData, component.activeFilters);
    await renderResults(component, config, facetFilteredData, searchTerms);
  } catch (error) {
    logError('handleSearch', error.message, error);
  }
}

function searchResultsContainer(component) {
  const results = document.createElement('ul');
  results.className = 'search-results';
  results.dataset.h = findNextHeading(component);
  return results;
}

function searchInput(component, config) {
  const input = document.createElement('input');
  input.setAttribute('type', 'search');
  input.className = 'search-input';

  const searchPlaceholder = config.placeholders.searchPlaceholder || 'Search...';
  input.placeholder = searchPlaceholder;
  input.setAttribute('aria-label', searchPlaceholder);

  input.addEventListener('input', (e) => {
    const currentTarget = e.target; // Capture the input element reference
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      // Create a fake event object with the target
      handleSearch({ target: currentTarget }, component, config);
    }, 300);
  });

  input.addEventListener('keyup', (e) => {
    if (e.code === 'Escape') {
      clearSearch(component);
    }
  });

  // Additional event listeners for debugging
  input.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      // Allow space character in the input and prevent nav/global handlers from intercepting it
      e.stopPropagation();
    }
  }, true);

  return input;
}

function searchIcon() {
  const icon = document.createElement('span');
  icon.classList.add('icon', 'icon-search');
  icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="M21 21 l-4.3 -4.3"></path></svg>';
  return icon;
}

function searchBox(component, config) {
  const box = document.createElement('div');
  box.classList.add('search-box');
  const icon = searchIcon();
  const input = searchInput(component, config);

  box.append(icon, input);

  // Check if this is a nav search variant
  if (component.classList.contains('nav-search')) {
    // Close search on escape key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch(component);
        input.value = '';
        input.blur();
      }
    });
  }

  return box;
}

/**
 * @typedef {Object} ActiveFilters
 * @property {string[]} cat
 * @property {string[]} prod
 * @property {string[]} cloud
 * @property {string[]} author
 * @property {string[]} date
 * @property {string[]} type
 */

class BlogSearch extends HTMLElement {
  constructor() {
    super();
    this.activeFilters = {
      cat: [],
      prod: [],
      cloud: [],
      author: [],
      date: [],
      type: [],
    };
  }

  // Note: async connectedCallback is valid; the browser awaits the returned promise.
  async connectedCallback() {
    // shadow dom gets created first
    this.attachShadow({ mode: 'open' });

    if (searchParams.get('q')) {
      searchParams.delete('q');
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.search = searchParams.toString();
        window.history.replaceState({}, '', url.toString());
      }
    }

    await loadMiloUtils();

    // the css gets loaded into the shadow dom
    const cssResponse = await fetch('/web-components/search/blog-search.css');
    const cssText = await cssResponse.text();
    const styleSheet = new CSSStyleSheet();
    await styleSheet.replace(cssText);
    this.shadowRoot.adoptedStyleSheets = [styleSheet];

    const placeholders = await fetchPlaceholders();
    const source = this.getAttribute('data-source') || DEFAULT_INDEX_SOURCE;
    this.config = { source, placeholders };

    const isExploreFacets = this.classList.contains('explore-facets')
      || this.getAttribute('variant') === 'explore';
    const isNavSearch = !isExploreFacets
      && (this.classList.contains('nav-search') || !!this.closest('header, .feds-topnav, .feds-nav'));

    if (isExploreFacets) {
      this.classList.add('explore-facets');
      const toolbar = document.createElement('div');
      toolbar.className = 'explore-toolbar';

      const filtersLabel = document.createElement('span');
      filtersLabel.className = 'explore-filters-label';
      filtersLabel.textContent = 'Filters:';
      toolbar.append(filtersLabel);

      const searchWrap = document.createElement('div');
      searchWrap.className = 'explore-search';
      const icon = searchIcon();
      icon.classList.add('explore-search-trigger');
      icon.setAttribute('role', 'button');
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-label', placeholders.searchPlaceholder || 'Search');
      const input = searchInput(this, { source, placeholders });
      input.classList.add('explore-search-input');
      input.hidden = true;
      const collapseSearch = () => {
        searchWrap.classList.remove('expanded');
        input.hidden = true;
      };
      const toggleSearch = () => {
        const expanded = searchWrap.classList.toggle('expanded');
        input.hidden = !expanded;
        if (expanded) input.focus();
      };
      icon.addEventListener('click', toggleSearch);
      icon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSearch();
        }
      });
      // Native search clear (X) fires a 'search' event; collapse the field when emptied.
      input.addEventListener('search', () => {
        if (input.value === '') {
          collapseSearch();
          this.refreshExploreView();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          input.value = '';
          collapseSearch();
          this.refreshExploreView();
        }
      });
      searchWrap.append(icon, input);
      toolbar.append(searchWrap);

      this.shadowRoot.append(toolbar, exploreResultsContainer(this));

      const articleFeed = document.querySelector('.article-feed');
      if (articleFeed) {
        articleFeed.classList.add('explore-facets-suppressed');
        articleFeed.parentElement?.querySelector('.filter-container')?.classList.add('explore-facets-suppressed');
        articleFeed.parentElement?.querySelector('.selected-container')?.classList.add('explore-facets-suppressed');
      }
    } else if (isNavSearch) {
      this.classList.add('nav-search');

      // For nav search, everything goes in Shadow DOM but uses positioning to span full width
      const topNav = document.querySelector('.feds-topnav');
      if (topNav) {
        topNav.classList.add('has-blog-nav-search');

        // creates nav-search-container which is important for the positioning
        const searchContainer = document.createElement('div');
        searchContainer.className = 'nav-search-container';

        const icon = searchIcon();
        const input = searchInput(this, { source, placeholders });
        const results = searchResultsContainer(this);

        // adds all elements to the shadow dom
        searchContainer.append(icon, input, results);
        this.shadowRoot.appendChild(searchContainer);

        // Close search on escape key
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            clearSearch(this);
            input.value = '';
            input.blur();
          }
        });
      } else {
        // Fallback to normal behavior in Shadow DOM
        this.shadowRoot.append(
          searchBox(this, { source, placeholders }),
          searchResultsContainer(this),
        );
      }
    } else {
      // Regular search - all in Shadow DOM
      this.shadowRoot.append(
        searchBox(this, { source, placeholders }),
        searchResultsContainer(this),
      );
    }

    if (typeof decorateIcons === 'function') {
      decorateIcons(this.shadowRoot);
    }

    if (isExploreFacets) {
      await this.initFacets({ explore: true });
      return;
    }

    if (isNavSearch) {
      fetchData(source).then((data) => {
        if (data) this.searchIndexData = data;
      });
      return;
    }

    await this.initFacets({ explore: false });
  }

  async refreshExploreView() {
    if (!this.allData) return;

    let scopedData = this.allData;
    if (currentTopic) {
      scopedData = this.allData.filter((item) => {
        if (!item.tags) return false;
        try {
          const tags = JSON.parse(item.tags);
          return tags.includes(currentTopic);
        } catch {
          return item.tags.includes(currentTopic);
        }
      });
    }

    const queryInput = this.shadowRoot.querySelector('.explore-search-input');
    const searchValue = queryInput?.value?.trim() || '';
    let searchTerms = [];
    let data = scopedData;

    if (searchValue.length >= 3) {
      searchTerms = searchValue.toLowerCase().split(/\s+/).filter((term) => term.length >= 3);
      data = filterData(searchTerms, scopedData);
    }

    const facetFilteredData = this.applyFilters(data, this.activeFilters);
    const orderedData = searchTerms.length
      ? facetFilteredData
      : sortArticlesByPublicationDate(facetFilteredData);
    this.updateFilterCounts(facetFilteredData);
    await renderExploreResults(this, this.config, orderedData, searchTerms);
  }

  applyFilterChange() {
    if (this.classList.contains('explore-facets')) {
      this.refreshExploreView();
      return;
    }
    const queryInput = this.shadowRoot.querySelector('input[type="search"]');
    if (queryInput && queryInput.value.length >= 3) {
      handleSearch({ target: queryInput }, this, this.config);
    }
  }

  async initFacets({ explore }) {
    const { source } = this.config;
    this.allData = await fetchData(source);
    if (!this.allData) {
      logError('initFacets', `data load failed for ${source}, filter bar skipped`);
      return;
    }

    this.activeFilters = this.loadFiltersFromURL();
    const facets = this.generateFacets(this.allData);
    this.renderFilterBar(facets, { explore });
    this.renderChips(this.activeFilters);
    this.updateFilterCounts(this.allData);

    this.shadowRoot.querySelector('.filter-bar')?.addEventListener('change', (e) => {
      if (e.target.tagName === 'SELECT') {
        const { value } = e.target;
        this.activeFilters.date = value ? [value] : [];
        this.renderChips(this.activeFilters);
        this.updateURLState(this.activeFilters);
        this.applyFilterChange();
        return;
      }
      if (e.target.type !== 'checkbox') return;
      const { group } = e.target.closest('.filter-dropdown').dataset;
      const { value } = e.target;
      if (e.target.checked) {
        this.activeFilters[group].push(value);
      } else {
        this.activeFilters[group] = this.activeFilters[group].filter((v) => v !== value);
      }
      this.renderChips(this.activeFilters);
      this.updateURLState(this.activeFilters);
      this.applyFilterChange();
    });

    this.addEventListener('remove-filter', (e) => {
      const { group, value } = e.detail;
      this.activeFilters[group] = this.activeFilters[group].filter((v) => v !== value);
      this.renderChips(this.activeFilters);
      this.updateURLState(this.activeFilters);
      this.applyFilterChange();
    });

    this.addEventListener('clear-all-filters', () => {
      Object.keys(this.activeFilters).forEach((key) => {
        this.activeFilters[key] = [];
      });
      this.closeFacetPanels(this.shadowRoot.querySelector('.filter-bar'));
      // Reset the visible controls so the UI matches the cleared state.
      this.shadowRoot.querySelectorAll('.filter-bar input[type="checkbox"]:checked').forEach((checkbox) => {
        checkbox.checked = false;
      });
      const dateSelect = this.shadowRoot.querySelector('.filter-date-select');
      if (dateSelect) dateSelect.value = '';
      const searchField = this.shadowRoot.querySelector('.explore-search-input');
      if (searchField) {
        searchField.value = '';
        searchField.hidden = true;
      }
      this.shadowRoot.querySelector('.explore-search')?.classList.remove('expanded');
      this.renderChips(this.activeFilters);
      this.updateURLState(this.activeFilters);
      this.applyFilterChange();
    });

    if (explore) {
      await this.refreshExploreView();
    }

    this.bindOutsideClickClose();
  }

  bindOutsideClickClose() {
    if (this.outsideClickHandler) return;
    this.outsideClickHandler = (e) => {
      if (e.composedPath().includes(this)) return;
      this.closeFacetPanels(this.shadowRoot?.querySelector('.filter-bar'));
    };
    document.addEventListener('click', this.outsideClickHandler);
  }

  disconnectedCallback() {
    if (!this.outsideClickHandler) return;
    document.removeEventListener('click', this.outsideClickHandler);
    this.outsideClickHandler = null;
  }

  // eslint-disable-next-line class-methods-use-this
  generateFacets(data) {
    const catSet = new Set();
    const prodSet = new Set();
    const cloudSet = new Set();
    const authorSet = new Set();
    const dateSet = new Set();
    const typeSet = new Set();

    data.forEach((article) => {
      if (article.tags) {
        try {
          const tags = JSON.parse(article.tags);
          if (Array.isArray(tags)) {
            tags.forEach((tag) => {
              if (tag) catSet.add(tag);
            });
          }
        } catch {
          // eslint-disable-next-line no-console
        }
      }
      splitProductValues(article.adobeApp).forEach((product) => prodSet.add(product));
      splitProductValues(article.adobeCloud).forEach((cloud) => cloudSet.add(cloud));
      if (article.author) authorSet.add(article.author);
      if (article.sortDate) dateSet.add(article.sortDate);
      if (article.articleType) typeSet.add(article.articleType);
    });

    const sorted = (set) => [...set].sort();

    return {
      cat: sorted(catSet),
      prod: sorted(prodSet),
      cloud: sorted(cloudSet),
      author: sorted(authorSet),
      date: sorted(dateSet),
      type: sorted(typeSet),
    };
  }

  // eslint-disable-next-line class-methods-use-this
  applyFilters(data, activeFilters) {
    return data.filter((article) => (
      Object.entries(activeFilters).every(([group, activeValues]) => {
        if (activeValues.length === 0) return true;

        if (group === 'date') {
          if (!article.sortDate) return false;
          const articleDate = new Date(article.sortDate);
          const now = new Date();
          const cutoff = new Date(now);
          const preset = activeValues[0];
          if (preset === 'last-week') cutoff.setDate(now.getDate() - 7);
          else if (preset === 'last-month') cutoff.setMonth(now.getMonth() - 1);
          else if (preset === 'last-year') cutoff.setFullYear(now.getFullYear() - 1);
          return articleDate >= cutoff;
        }

        let values = [];
        switch (group) {
          case 'cat':
            if (article.tags) {
              try {
                const parsed = JSON.parse(article.tags);
                if (Array.isArray(parsed)) values = parsed.filter(Boolean);
              } catch { /* invalid JSON, no match */ }
            }
            break;
          case 'prod':
            values = splitProductValues(article.adobeApp);
            break;
          case 'cloud':
            values = splitProductValues(article.adobeCloud);
            break;
          case 'author':
            if (article.author) values = [article.author];
            break;
          case 'type':
            if (article.articleType) values = [article.articleType];
            break;
          default:
            break;
        }

        return activeValues.some((v) => values.includes(v));
      })
    ));
  }

  // eslint-disable-next-line class-methods-use-this
  loadFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    return {
      cat: params.getAll('cat').filter(Boolean),
      prod: params.getAll('prod').filter(Boolean),
      cloud: params.getAll('cloud').filter(Boolean),
      author: params.getAll('author').filter(Boolean),
      date: params.getAll('date').filter(Boolean),
      type: params.getAll('type').filter(Boolean),
    };
  }

  // eslint-disable-next-line class-methods-use-this
  updateURLState(activeFilters) {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');

    const newParams = new URLSearchParams();

    if (q) newParams.set('q', q);

    Object.entries(activeFilters).forEach(([group, values]) => {
      if (values.length > 0) {
        values.forEach((value) => {
          newParams.append(group, value);
        });
      }
    });

    const url = new URL(window.location.href);
    url.search = newParams.toString();
    window.history.replaceState({}, '', url.toString());
  }

  // eslint-disable-next-line class-methods-use-this
  closeFacetPanels(filterBar, { exceptToggle = null } = {}) {
    if (!filterBar) return;
    filterBar.querySelectorAll('.filter-dropdown-toggle').forEach((toggle) => {
      if (toggle === exceptToggle) return;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.parentElement?.querySelector('ul')?.classList.remove('show');
    });
    filterBar.querySelector('.filter-date-select')?.blur();
  }

  renderFilterBar(facets, { explore = false } = {}) {
    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    if (explore) filterBar.classList.add('filter-bar-explore');

    const labels = explore
      ? {
        cat: 'Tags',
        prod: 'Products',
        cloud: 'Adobe Cloud',
        type: 'Topic',
        author: 'Author',
      }
      : {
        cat: 'Tags',
        prod: 'Products',
        cloud: 'Adobe Cloud',
        author: 'Author',
        type: 'Type',
      };
    // Date filter is disabled for now (not enough content); re-add 'date' to
    // these arrays to bring it back.
    const exploreGroups = new Set(['cloud', 'prod', 'cat', 'type', 'author']);
    const order = explore
      ? ['cloud', 'prod', 'cat', 'type', 'author']
      : ['cat', 'cloud', 'prod', 'author', 'type'];
    const facetEntries = order.map((group) => [group, facets[group]]);

    facetEntries.forEach(([group, values]) => {
      if (group === 'date') {
        if (explore && !exploreGroups.has('date')) return;
        const dateSelect = document.createElement('select');
        dateSelect.className = 'filter-date-select';
        dateSelect.setAttribute('aria-label', 'Date');
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Date';
        // In explore mode the select itself acts as the "Date" label, so hide the
        // placeholder from the open list and offer an explicit "All dates" reset.
        if (explore) {
          defaultOption.hidden = true;
        } else {
          defaultOption.textContent = 'All dates';
        }
        dateSelect.append(defaultOption);
        if (explore) {
          const allDatesOption = document.createElement('option');
          allDatesOption.value = '';
          allDatesOption.textContent = 'All dates';
          dateSelect.append(allDatesOption);
        }
        [
          { value: 'last-week', label: 'Last week' },
          { value: 'last-month', label: 'Last month' },
          { value: 'last-year', label: 'Last year' },
        ].forEach(({ value, label }) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          dateSelect.append(option);
        });
        const [activeDate] = this.activeFilters.date;
        if (explore && activeDate) {
          dateSelect.value = activeDate;
        }
        const closeCustomDropdowns = () => {
          filterBar.querySelectorAll('.filter-dropdown-toggle[aria-expanded="true"]').forEach((toggle) => {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.parentElement?.querySelector('ul')?.classList.remove('show');
          });
        };
        dateSelect.addEventListener('mousedown', closeCustomDropdowns);
        dateSelect.addEventListener('focus', closeCustomDropdowns);
        filterBar.append(dateSelect);
        return;
      }

      if (explore && !exploreGroups.has(group)) return;
      if (values.length === 0) return;
      const toggle = document.createElement('button');

      toggle.className = 'filter-dropdown-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      const baseLabel = labels[group] || group;
      toggle.textContent = baseLabel;
      // Keep the plain label so we can re-append a selection count later.
      toggle.dataset.baseLabel = baseLabel;

      const menu = document.createElement('ul');

      values.forEach((value, index) => {
        const item = document.createElement('li');

        const checkboxId = `filter-${group}-${index}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = value;

        const label = document.createElement('label');
        label.setAttribute('for', checkboxId);
        label.textContent = value;

        item.append(checkbox, label);
        item.addEventListener('click', (e) => {
          if (e.target.closest('input[type="checkbox"], label')) return;
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
        menu.append(item);
      });

      toggle.addEventListener('click', () => {
        const currentlyOpen = toggle.getAttribute('aria-expanded') === 'true';
        if (currentlyOpen) {
          toggle.setAttribute('aria-expanded', 'false');
          menu.classList.remove('show');
          return;
        }
        this.closeFacetPanels(filterBar);
        toggle.setAttribute('aria-expanded', 'true');
        menu.classList.add('show');
      });

      const dropdown = document.createElement('div');
      dropdown.className = 'filter-dropdown';
      // used to identify the group of the filter
      dropdown.dataset.group = group;
      dropdown.append(toggle, menu);
      filterBar.append(dropdown);
    });

    const toolbar = this.shadowRoot.querySelector('.explore-toolbar');
    if (explore && toolbar) {
      const searchWrap = toolbar.querySelector('.explore-search');
      toolbar.insertBefore(filterBar, searchWrap);
    } else {
      this.shadowRoot.append(filterBar);
    }
    return filterBar;
  }

  syncExploreControls(activeFilters) {
    const filterBar = this.shadowRoot.querySelector('.filter-bar-explore');
    if (filterBar) {
      filterBar.querySelectorAll('.filter-dropdown').forEach((dropdown) => {
        const { group } = dropdown.dataset;
        const toggle = dropdown.querySelector('.filter-dropdown-toggle');
        const base = toggle.dataset.baseLabel || toggle.textContent;
        const count = (activeFilters[group] || []).length;
        toggle.textContent = count ? `${base} (${count})` : base;
        toggle.classList.toggle('has-active', count > 0);
      });
    }

    const toolbar = this.shadowRoot.querySelector('.explore-toolbar');
    if (!toolbar) return;
    let clearBtn = toolbar.querySelector('.explore-clear-all');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.className = 'filter-clear-all explore-clear-all';
      clearBtn.textContent = 'Clear all';
      clearBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('clear-all-filters', { bubbles: true }));
      });
      const searchWrap = toolbar.querySelector('.explore-search');
      toolbar.insertBefore(clearBtn, searchWrap);
    }
    const anyActive = Object.values(activeFilters).some((values) => values.length > 0);
    clearBtn.hidden = !anyActive;
  }

  renderChips(activeFilters) {
    // Explore mode shows selection counts on the filter buttons instead of chips.
    if (this.classList.contains('explore-facets')) {
      this.syncExploreControls(activeFilters);
      return;
    }
    this.shadowRoot.querySelector('.filter-chips')?.remove();
    if (!Object.values(activeFilters).some((values) => values.length > 0)) return;
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'filter-chips';

    Object.entries(activeFilters).forEach(([group, values]) => {
      values.forEach((value) => {
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.textContent = value;

        const removeButton = document.createElement('button');
        removeButton.className = 'filter-chip-remove';
        removeButton.textContent = 'x';
        removeButton.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('remove-filter', { detail: { group, value }, bubbles: true }));
        });

        chip.append(removeButton);
        chipsContainer.append(chip);
      });
    });

    const clearButton = document.createElement('button');
    clearButton.className = 'filter-clear-all';
    clearButton.textContent = 'Clear all';
    clearButton.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('clear-all-filters', { bubbles: true }));
    });
    chipsContainer.append(clearButton);
    const chipsParent = this.classList.contains('explore-facets')
      ? this.shadowRoot.querySelector('.explore-toolbar')
      : this.shadowRoot.querySelector('.filter-bar');
    chipsParent?.append(chipsContainer);
  }

  // eslint-disable-next-line class-methods-use-this
  getArticleValues(article, group) {
    switch (group) {
      case 'cat':
        if (article.tags) {
          try {
            return JSON.parse(article.tags).filter(Boolean);
          } catch { /* invalid JSON, no match */ }
        }
        return [];
      case 'prod':
        return splitProductValues(article.adobeApp);
      case 'cloud':
        return splitProductValues(article.adobeCloud);
      case 'author':
        return article.author ? [article.author] : [];
      case 'type':
        return article.articleType ? [article.articleType] : [];
      default:
        return [];
    }
  }

  updateFilterCounts(data) {
    // Explore mode keeps option lists clean (names only, no per-option counts).
    if (this.classList.contains('explore-facets')) return;
    const filterBar = this.shadowRoot.querySelector('.filter-bar');
    if (!filterBar) return;
    const filterDropdowns = filterBar.querySelectorAll('.filter-dropdown');
    filterDropdowns.forEach((dropdown) => {
      const { group } = dropdown.dataset;

      dropdown.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        const { value } = checkbox;
        const count = data.filter((article) => (
          this.getArticleValues(article, group).includes(value)
        )).length;

        const label = checkbox.nextElementSibling;
        label.textContent = '';

        const textNode = document.createTextNode(`${value} `);
        const countSpan = document.createElement('span');
        countSpan.className = 'filter-count';
        countSpan.textContent = `(${count})`;

        label.append(textNode, countSpan);
      });
    });
  }
}
customElements.define('blog-search', BlogSearch);
export default BlogSearch;
