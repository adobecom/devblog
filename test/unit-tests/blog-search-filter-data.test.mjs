/**
 * Unit tests for filterData (blog search ranking over query-index rows).
 * Logic lives in web-components/search/blog-search-filter-data.js (imported by blog-search.js).
 */
import filterData from '../../web-components/search/blog-search-filter-data.js';
import { expect } from 'chai';

describe('filterData (blog-search)', () => {
  const sample = [
    {
      title: 'Creative Cloud Updates',
      description: 'Monthly news for subscribers',
      path: '/en/publish/2024/creative-cloud-updates',
    },
    {
      title: 'Photoshop Tips',
      description: 'Creative workflows',
      path: '/en/publish/2024/photoshop-tips',
    },
    {
      title: 'Unrelated',
      description: 'Nothing here',
      path: '/en/publish/2024/other',
    },
  ];

  it('returns empty array when nothing matches', () => {
    expect(filterData(['zzzmissing'], sample)).to.deep.equal([]);
  });

  it('finds articles whose title contains the full phrase (exact tier)', () => {
    const out = filterData(['creative', 'cloud'], sample);
    expect(out.map((r) => r.title)).to.include('Creative Cloud Updates');
  });

  it('matches fuzzy terms in title when full phrase is not contiguous', () => {
    const out = filterData(['photoshop'], sample);
    expect(out.some((r) => r.title === 'Photoshop Tips')).to.equal(true);
  });

  it('deduplicates by title, keeping best-ranked hit once', () => {
    const dup = [
      { title: 'Same Title', description: 'a', path: '/en/publish/a' },
      { title: 'Same Title', description: 'b', path: '/en/publish/b' },
    ];
    const out = filterData(['same'], dup);
    expect(out).to.have.length(1);
    expect(out[0].title).to.equal('Same Title');
  });
});
