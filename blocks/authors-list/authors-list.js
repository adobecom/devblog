export default async function decorate(block) {
  const DATA_URL              = '/scripts/author-validation/data/authors.json';
  const DEFAULT_FALLBACK_IMAGE = 'https://main--milo--adobecom.aem.live/libs/blocks/article-header/adobe-logo.svg';
  const AUTHOR_IMAGE_BASE      = '/images/authors/';

  let cachedPageContent = null;

  async function getPageContent() {
    if (cachedPageContent) return cachedPageContent;
    try {
      const res = await fetch('/en/authors/index.plain.html', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      cachedPageContent = {
        heading:     doc.querySelector('h1, h2')?.textContent?.trim() || '',
        description: doc.querySelector('p')?.textContent?.trim()      || '',
      };
    } catch {
      return null;
    }
    return cachedPageContent;
  }

  const getAuthorImage = ({ docImage, image, slug }) =>
  docImage?.trim() || image?.trim() || `${AUTHOR_IMAGE_BASE}${slug}.png`;

  function badge(condition, type, label) {
    return condition ? `<span class="author-name-badge ${type}">${label}</span>` : '';
  }

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Failed to fetch authors.json: ${response.status}`);

    const authorsData = await response.json();
    const authors = authorsData
      .filter((a) => a.hasDoc)
      .sort((a, b) => {
        const dateA = new Date(a.latestArticle?.date || 0).getTime();
        const dateB = new Date(b.latestArticle?.date || 0).getTime();
        return dateB - dateA;
      });

    if (!authors.length) {
      block.innerHTML = '<div class="authors-error"><p>No authors with individual profile pages found.</p></div>';
      return;
    }

    const container = document.createElement('div');
    container.className = 'authors-list-container';

    authors.forEach((author) => {
      const allLinksHtml = [
        author.linkedin
          ? `<a href="${author.linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`
          : '<span class="missing">No LinkedIn</span>',
        ...(author.links || []).map(
          ({ url, label }) =>
            `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
        ),
      ].join('');

      // Missing field warnings
      const missingFields = [
        !author.title    && 'Title',
        !author.linkedin && 'LinkedIn',
      ].filter(Boolean);

      const card = document.createElement('div');
      card.className = 'author-card';
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');

      card.innerHTML = `
        <div class="author-card-image">
          <img src="${getAuthorImage(author)}"
               alt="${author.name}"
               loading="lazy"
               onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_IMAGE}';">
        </div>
        <div class="author-card-content">
          <h3 class="author-name">
            <span class="author-name-with-badges">
              <span>${author.name}</span>
              ${badge(String(author.isAdobeEmployee) === 'true', 'adobe', 'Adobe')}
              ${badge(String(author.isDeveloperChampion) === 'true', 'champion', 'Champion')}
            </span>
          </h3>
          <p class="author-title">
            ${author.title || '<span class="missing">Missing Title</span>'}
          </p>
          <div class="author-links">${allLinksHtml}</div>
          ${missingFields.length
            ? `<p class="missing-info">Missing: ${missingFields.join(', ')}</p>`
            : ''}
        </div>
      `;

      // card click handling
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        window.location.href = author.profileUrl;
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          window.location.href = author.profileUrl;
        }
      });

      container.appendChild(card);
    });

    block.textContent = '';

    // Fetch heading/description from doc — shown only if present.

    const pageContent = await getPageContent();
    if (pageContent) {
      const header = document.createElement('div');
      header.className = 'authors-header';
      header.innerHTML = `
        <div class="authors-header-inner">
          ${pageContent.heading     ? `<h1>${pageContent.heading}</h1>`         : ''}
          ${pageContent.description ? `<p>${pageContent.description}</p>`       : ''}
        </div>
      `;
      block.appendChild(header);
    }
    block.appendChild(container);

  } catch (error) {
    console.error('Error loading authors:', error);
    block.innerHTML = `
      <div class="authors-error">
        <p><strong>Unable to load author data.</strong></p>
        <p>${error.message}</p>
      </div>
    `;
  }
}