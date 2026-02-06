import { getLibs } from '../../scripts/devblog/devblog.js';

// These will be loaded dynamically in the functions that need them
let createOptimizedPicture, decorateIcons, fetchPlaceholders;
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

export async function fetchData(source) {
  const response = await fetch(source);
  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error('error loading API response', response);
    return null;
  }

  const json = await response.json();
  if (!json) {
    // eslint-disable-next-line no-console
    console.error('empty API response', source);
    return null;
  }

  return json.data;
}

async function renderResult(result, searchTerms, titleTag) {
  await loadMiloUtils();
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = result.path;
  if (result.image) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search-result-image';

    // Fallback if createOptimizedPicture isn't available
    if (typeof createOptimizedPicture === 'function') {
      const pic = createOptimizedPicture(result.image, '', false, [{ width: '375' }]);
      wrapper.append(pic);
    } else {
      // Simple img fallback
      const img = document.createElement('img');
      img.src = result.image;
      img.alt = result.title || '';
      img.loading = 'lazy';
      wrapper.append(img);
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
  li.append(a);
  return li;
}
  
function clearSearchResults(component) {
  // looks for the results in theshadow dom first else it will fallback to the light dom
  let searchResults = component.shadowRoot?.querySelector('.search-results') || component.querySelector('.search-results');
  if (searchResults) {
    searchResults.innerHTML = '';
  }
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

async function renderResults(component, config, filteredData, searchTerms) {
  const renderId = ++currentRenderId;

  clearSearchResults(component);
  // looks for the results in theshadow dom first else it will fallback to the light dom
  let searchResults = component.shadowRoot?.querySelector('.search-results') || component.querySelector('.search-results');
  if (!searchResults) return;

  const headingTag = searchResults.dataset.h;

  if (filteredData.length) {
    searchResults.classList.remove('no-results');
    
    // Render all results in parallel
    const results = await Promise.all(
      filteredData.map(result => renderResult(result, searchTerms, headingTag))
    );
    
    // Check if this render is still current (not cancelled by a newer search)
    if (renderId !== currentRenderId) return;  // ← ADD THIS CHECK
    
    // Append all results at once
    results.forEach(li => searchResults.append(li));
  } else {
    if (renderId !== currentRenderId) return;  // ← ADD THIS CHECK ALSO

    const noResultsMessage = document.createElement('li');
    searchResults.classList.add('no-results');
    noResultsMessage.textContent = config.placeholders.searchNoResults || 'No results found.';
    searchResults.append(noResultsMessage);
  }
}

function compareFound(hit1, hit2) {
  return hit1.minIdx - hit2.minIdx;
}

// Write documentation for the updated version of the filter function later

function filterData(searchTerms, data) {
  const fullPhrase = searchTerms.join(' ');
  const exactMatches = [];
  const phraseMatches = [];
  const foundInHeader = [];
  const foundInMeta = [];

  data.forEach((result) => {
    const title = (result.header || result.title).toLowerCase();
    const metaContents = `${result.title} ${result.description} ${result.path.split('/').pop()}`.toLowerCase();

    if (title.includes(fullPhrase)) {
      exactMatches.push({minIdx: title.indexOf(fullPhrase), result});
      return;
    }

    if (metaContents.includes(fullPhrase)) {
      phraseMatches.push({minIdx: metaContents.indexOf(fullPhrase), result});
      return;
    }

    let minIdx = -1;
    let matchCount = 0;

    searchTerms.forEach((term) => {
      const idx = title.indexOf(term);
      if (idx >= 0) {
        matchCount++;
        if (minIdx === -1 || idx < minIdx) minIdx = idx;
      }
    });

    if (minIdx >= 0) {
      foundInHeader.push({minIdx, result, matchCount });
      return;
    }

    minIdx = -1;
    matchCount = 0;

    searchTerms.forEach((term) => {
      const idx = metaContents.indexOf(term);
      if (idx >= 0) {
        matchCount++;
        if (minIdx === -1 || idx < minIdx) minIdx = idx;
      }
    });

    if (minIdx >= 0) {
      foundInMeta.push({minIdx, result, matchCount });
    }
  });
  // First, sort everything
  const sorted = [
    ...exactMatches.sort((a, b) => a.minIdx - b.minIdx),
    ...phraseMatches.sort((a, b) => a.minIdx - b.minIdx),
    ...foundInHeader.sort((a, b) => b.matchCount - a.matchCount || a.minIdx - b.minIdx),
    ...foundInMeta.sort((a, b) => b.matchCount - a.matchCount || a.minIdx - b.minIdx),
  ];

  // Then deduplicate by title, keeping first occurrence (best ranked)
  const seen = new Set();
  const uniqueResults = [];
  
  sorted.forEach(item => {
    const key = item.result.title.toLowerCase();  // Note: item.result.title, not item.title
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(item.result);  // Push the actual result, not the wrapper
    }
  });
  
  return uniqueResults;
}

async function handleSearch(e, component, config) {
  const searchValue = e.target.value;

  searchParams.set('q', searchValue);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = searchParams.toString();
    window.history.replaceState({}, '', url.toString());
  }

  if (searchValue.length < 3) {
    clearSearch(component);
    return;
  }

  const searchTerms = searchValue.toLowerCase().split(/\s+/).filter((term) => term.length >= 3);

  try {
    const data = await fetchData(config.source);
    const filteredData = filterData(searchTerms, data);
    await renderResults(component, config, filteredData, searchTerms);
  } catch (error) {
    console.error('Error in handleSearch:', error);
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
    const currentTarget = e.target;  // Capture the input element reference
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
  
class BlogSearch extends HTMLElement {
  async connectedCallback() {               // expected to be synchronous (should not be asynchronous)
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
    
    // the css gets loaded int othe shadow dom
    const cssResponse = await fetch('/web-components/search/blog-search.css');
    const cssText = await cssResponse.text();
    const styleSheet = new CSSStyleSheet();
    await styleSheet.replace(cssText);
    this.shadowRoot.adoptedStyleSheets = [styleSheet]; 
    
    const placeholders = await fetchPlaceholders();
    const source = this.getAttribute('data-source') || '/en/query-index.json';
    
    
    // Detect if this search should be nav-style
    const isNavSearch = document.querySelector('header') || this.classList.contains('nav-search');
    if (isNavSearch) {
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

    // if (searchParams.get('q')) {
    //   const input = this.shadowRoot.querySelector('input') || this.querySelector('input');
    //   if (input) {
    //     input.value = searchParams.get('q');
    //     input.dispatchEvent(new Event('input'));
    //   }
    // }

    if (typeof decorateIcons === 'function') {
      decorateIcons(this.shadowRoot);
    }
    
  }
}

customElements.define('blog-search', BlogSearch);