# Site Runtime Contract

## Required identity
Each site instance must provide:
- `siteCode`
- `frontendUrl`
- `siteName`
- `siteType`
- `supportedTasks`

## Required public endpoints
Each site should expose or consume the standard contract needed by Master Site Panel:
- bootstrap/config source
- public feed source
- sitemap
- robots
- indexing status source when enabled
- optional SEO health endpoint

## Required SEO contract
Each site should be able to consume runtime SEO config from the panel:
- default title
- title template
- default description
- default OG image
- keywords
- per-page overrides
- robots index/follow flags

## Required operational contract
The panel should be able to track:
- sitemap reachable status
- sitemap URL count
- publish activity
- indexing submission/check timestamps
- host/runtime status

## Non-goal
This contract does not prescribe visual layout. It exists to standardize operations and SEO at scale.
