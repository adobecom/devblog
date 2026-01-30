# Adobe Developers Blog on Edge Delivery Services

This code powers https://blog.developer.adobe.com/ using [Adobe AEM Edge Delivery Services](https://www.aem.live/) (EDS).

It was initially created by [Bertrand Delacretaz](https://github.com/bdelacretaz/), porting the content from its
previous location, based on a simplified version of the [Adobe for Business blog](https://business.adobe.com/blog/) code.

Like many other adobe.com websites, it uses the [Milo](https://github.com/adobecom/milo) library.

If you have access to it, the `#aem-dev` Slack channel is a good place to ask questions about EDS.

# URLs

- https://main--devblog--adobecom.aem.page/ serves content that's been previewed in EDS
- https://main--devblog--adobecom.aem.live/ is the production origin, serves content that's been published in EDS
- https://blog.developer.adobe.com/ is the public URL, backed by a CDN.

If there are any `*.hlx.page` or `*.hlx.live` references in tickets or older documents, they must not be used anymore,
it's only `*.aem.*` now, like the above URLs.

## Branches and forks

EDS also publishes branches and forks, like for example https://search--devblogsearch--t0risutan.aem.live/ which
uses the code from https://github.com/t0risutan/devblogsearch/tree/search to build the website.

## CDN cache invalidation

EDS takes care of invalidating the CDN when content changes, as I'm writing this this happens quickly, within seconds.

The code can take longer to be updated as seen from the client side, I think around an hour currently.

## /libs serves Milo code

On the public URL, `/libs` is mounted at the CDN level to serve Milo code directly,
mapping for example https://blog.developer.adobe.com/libs/blocks/article-feed/article-feed.js
to https://main--milo--adobecom.aem.live/libs/blocks/article-feed/article-feed.js

# Local development

The [aem.live Developer Tutorial](https://www.aem.live/developer/tutorial) has information on how to work locally.

The [AEM CLI](https://www.aem.live/developer/cli-reference) works well and produces a faithful rendition compared
to what EDS generates once the code is pushed to Github. Code changes are reflected quickly for the `aem.*` URLs,
and in our case a bit more slowly at the public URL, as mentioned above.

Note that we have not used https://da.live/ so far in development, just editing in Google Docs and using `aem up` locally
to see the results.

# The Code

## Automated tests

Tests pass with `npm test` but the test coverage is fairly low.

## Scripts

The `scripts` folder has the default EDS scripts, not changed much from the code
inherited from the business blog.

The `scripts/devblog` folder has more specific EDS scripts that were created
for this website.

## Standard Milo blocks

Most of the EDS blocks come directly from Milo, as I write this this repository
only has 3 specific blocks defined in the [blocks folder](./blocks/)

An in-browser JavaScript debugger is a great way to see where the code for each
block comes from, remembering the `/libs` mounting mentioned above.

## Post-processing blocks

Two blocks have `post-process` in their name, they run after the standard Milo blocks
to tweak their outputs. The mapping to those blocks is defined in the 
[devblog.js](./scripts/devblog/devblog.js) script.

## Redirects

Many redirects are defined in the `redirects` sheet in the content, as URLs have
changed compared to the previous website.

Most legacy URLs redirect to the legacy website, and a smaller number redirect
to the `/en/publish` folder here.

That redirects sheet does include some comments in extra columns to help maintenance.
Only its first two columns are used by EDS. Formatting is also ignored, which can also
be useful.

## Generic pages, folder mapping

The `folders` section of [fstab.yaml](./fstab.yaml) currently defines three 
[mapped folders](https://www.aem.live/developer/folder-mapping) for the authors,
topics and tagged sections of the website.

These point to pages like `en/generic-author` in the content, which in this case
contains the skeleton for all pages under `/en/authors`.

The `buildDevblogAutoBlocks` function in [devblog.js](./scripts/devblog/devblog.js)
then generates the corresponding page.

It looks like that [folder mapping](https://www.aem.live/developer/folder-mapping)
functionality is deprecated in EDS, there might be a need to move to something else.

## Custom sorted index, generated here

A sorted query index is created by a [GitHub Action](.github/workflows/sort-query-index.yml ) 
that runs in this repository. The result is then published by EDS at
https://blog.developer.adobe.com/sorted-index/sorted-query-index.json from this repository.

There might be a standard way in EDS now to sort indexes, but when I wrote that code
that was not the case.

The index is used by the `article-feed` block on the blog's homepage, author and topics pages.

If needed, those pages can revert to the unsorted index by using `/en/query-index.json` as
the value of the `feed` parameter for that block in the source document, instead
of `/sorted-index/sorted-query-index.json` which is the one generated in this repository.

The sorting action is currently configured to run once every hour at minute 03 (old style unix cron times!),
which means that changes to the blog's "native" index might take up to an hour to propagate to blocks
that use the sorted index, unless the sorting action is executed manually earlier in this repository.

The sorting code currently only considers year and month, from the document's path: as the last modified
dates do not seem to be reliable in our documents, it only considers the numbers found in the document's
path. So the sorting order of documents from the same month is undefined.
