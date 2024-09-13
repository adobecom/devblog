// Hack to avoid having to setup a taxonomy, which
// we only need for the topics page.
// 
// This hooks window.fetch to return 
// a dynamically built minimal taxonomy
// that allows the current topic page to
// display results.

function getLocalTaxonomy() {
  const match = window.location.pathname.match(/\/topics\/(.*)/);
  const currentTag = match && match.length == 2 ? match[1] : 'NO_TAG';
  const tax = {
    "total": 1,
    "offset": 0,
    "limit": 1,
    "data": [
      {
        "Type": "Categories",
        "Level 1": currentTag,
        "Level 2": "",
        "Level 3": "",
        "Name": currentTag,
        "Link": "",
        "Hidden": ""
      }
    ], ":type": "sheet"
  };
  return tax;
}

export function setupTaxonomyProxy() {
  const oldFetch = window.fetch;
  window.fetch = (resource, options) => {
    if (resource.endsWith('/taxonomy.json')) {
      console.log('Proxying taxonomy fetch');
      return new Promise(async (resolve) => {
        const body = getLocalTaxonomy();
        console.log('taxonomy', body);
        const options = {
          headers: {
            'Content-Type': 'application/json'
          }
        }
        const response = new Response(JSON.stringify(body), options);
        resolve(response);
      });
    }
    return oldFetch(resource, options);
  }
}
