# TODO

- Review this
- Add Repository info, owners
- Add info: local development, origin URLs, aem.live
- Code: sorted index, scripts, post-processing
- Content: redirect, generic pages

## Developing
1. Install the [Helix CLI](https://github.com/adobe/helix-cli): `sudo npm install -g @adobe/helix-cli`
1. Run `hlx up` this repo's folder. (opens your browser at `http://localhost:3000`)
1. Open this repo's folder in your favorite editor and start coding.

## Testing
```sh
npm run test
```
or:
```sh
npm run test:watch
```
This will give you several options to debug tests. Note: coverage may not be accurate.

## Custom sorted index

A sorted query index is created by a [GitHub Action](.github/workflows/sort-query-index.yml ) 
that runs in this repository.

It is used by the `article-feed` block on the blog's homepage, author and topics pages.

If needed, those pages can revert to the unsorted index by using `/en/query-index.json` as
the value of the `feed` parameter for that block, instead of `/sorted-index/sorted-query-index.json`
which is the one generated in this repository.

The sorting action is currently configured to run once every hour at minute 03, which means
that changes to the blog's "native" index might take up to an hour to propagate, if using
the sorted index, unless the sorting action is executed manually earlier.

Currently the sorting code only considers year and month: as the last modified dates do not
seem to be reliable in our documents, it only considers the numbers found in the document's
path. So the sorting order of documents from the same month is undefined.
