# Site Master Pro Roadmap

## Phase 1: Core Contract

- Keep all posting in the backend only.
- Treat every frontend site as a rendering client.
- Use one public contract per site:
  - `GET /api/v1/public/:siteCode/bootstrap`
  - `GET /api/v1/public/:siteCode/feed`
- Store site capabilities in `Site.config`:
  - `frontendUrl`
  - `siteType`
  - `supportedTasks`
  - `feedPath`
  - `metrics`
  - `connectorVersion`

## Phase 2: Token Model

- Generate one API key per task or automation flow.
- Bind each API key to one or more sites through `ApiKeySitePermission`.
- Standard task presets:
  - `listing`
  - `article`
  - `image`
  - `profile`
  - `classified`
  - `social`
- Use the admin panel to create task keys and expose the raw token once.

## Phase 3: Frontend Connector

- Every site gets the same connector layer in its root codebase.
- Connector responsibilities:
  - fetch bootstrap metadata
  - fetch site feed
  - map backend payload to UI model
  - expose supported task views
- Site-specific UI only decides how to render data.

## Phase 4: Template Strategy

- Finish one production-grade `Listing_next` template first.
- Use it as the reference implementation for:
  - listing pages
  - token-based posting
  - on-demand revalidation
  - public bootstrap/feed contract
- Fork the connector and rendering pattern into article, image, profile, and classified templates.

## Phase 5: Scale-Out

- Add background jobs for metrics sync and posting audit logs.
- Add rate limits and per-key quotas.
- Add site health checks:
  - connector reachable
  - feed latency
  - revalidation status
  - task coverage
- Add per-site/per-task analytics in the admin panel.
