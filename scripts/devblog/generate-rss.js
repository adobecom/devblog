/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://blog.developer.adobe.com';
const INDEX_URL = `${BASE_URL}/sorted-index/sorted-query-index.json`;
  
const FEED_TITLE = 'Adobe Developer Blog';
const FEED_DESCRIPTION = 'The latest developer news, tutorials, and resources from Adobe.';

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRfc822(timestamp) {
  const ms = Number(timestamp) * 1000;
  if (!ms || Number.isNaN(ms)) return new Date().toUTCString();
  return new Date(ms).toUTCString();
}

function getImageMimeType(url = '') {
  if (url.includes('.png')) return 'image/png';
  if (url.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function generateRss() {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);

  const { data } = await res.json();

  const items = data.map((post) => {
    const url = `${BASE_URL}${post.path}`;

    const rssDate =
      post.updatedDate && post.updatedDate !== ''
        ? post.updatedDate
        : post.sortDateTimestamp;

    const pubDate = toRfc822(rssDate);

    const description = post.description;

    const imageUrl = post.image ? `${BASE_URL}${post.image}` : '';
    const mimeType = getImageMimeType(imageUrl);

    return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[${description}]]></description>
      <dc:creator><![CDATA[${post.author}]]></dc:creator>
      <pubDate>${pubDate}</pubDate>
      ${imageUrl ? `<enclosure url="${escapeXml(imageUrl)}" type="${mimeType}" length="0"/>` : ''}
      ${imageUrl ? `<media:content url="${escapeXml(imageUrl)}" medium="image"/>` : ''}
    </item>`;
  });

  const latestTimestamp = data.reduce((max, post) => {
    const ts = Number(post.lastModified || 0);
    return ts > max ? ts : max;
  }, 0);
  const buildDate = latestTimestamp
    ? new Date(latestTimestamp * 1000).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${FEED_TITLE}</title>
    <link>${BASE_URL}</link>
    <description>${FEED_DESCRIPTION}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items.join('')}
  </channel>
</rss>`;

  const outPath = path.join(__dirname, '..', '..', 'rss.xml');
  fs.writeFileSync(outPath, xml.trim(), 'utf8');

  console.log(`✅ RSS feed written → ${outPath}`);
}

generateRss().catch((err) => {
  console.error('❌ RSS generation failed:', err);
  process.exit(1);
});