/**
 * Pure search ranking over query-index rows (no DOM / no fetch).
 * Used by blog-search.js and unit-tested in Node.
 */

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
      exactMatches.push({ minIdx: title.indexOf(fullPhrase), result });
      return;
    }

    if (metaContents.includes(fullPhrase)) {
      phraseMatches.push({ minIdx: metaContents.indexOf(fullPhrase), result });
      return;
    }

    let minIdx = -1;
    let matchCount = 0;

    searchTerms.forEach((term) => {
      const idx = title.indexOf(term);
      if (idx >= 0) {
        matchCount += 1;
        if (minIdx === -1 || idx < minIdx) minIdx = idx;
      }
    });

    if (minIdx >= 0) {
      foundInHeader.push({ minIdx, result, matchCount });
      return;
    }

    minIdx = -1;
    matchCount = 0;

    searchTerms.forEach((term) => {
      const idx = metaContents.indexOf(term);
      if (idx >= 0) {
        matchCount += 1;
        if (minIdx === -1 || idx < minIdx) minIdx = idx;
      }
    });

    if (minIdx >= 0) {
      foundInMeta.push({ minIdx, result, matchCount });
    }
  });
  const sorted = [
    ...exactMatches.sort((a, b) => a.minIdx - b.minIdx),
    ...phraseMatches.sort((a, b) => a.minIdx - b.minIdx),
    ...foundInHeader.sort((a, b) => b.matchCount - a.matchCount || a.minIdx - b.minIdx),
    ...foundInMeta.sort((a, b) => b.matchCount - a.matchCount || a.minIdx - b.minIdx),
  ];

  const seen = new Set();
  const uniqueResults = [];

  sorted.forEach((item) => {
    const key = item.result.title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(item.result);
    }
  });

  return uniqueResults;
}

export default filterData;
