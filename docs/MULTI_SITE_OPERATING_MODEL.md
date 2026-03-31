# Multi-Site Operating Model

## Purpose
Master Site Panel is the control plane for every site created from the automation template.

It should centralize:
- site registration
- site runtime status
- publish activity
- sitemap visibility
- indexing status
- SEO audit status
- API keys and task permissions

It should not become a visual page builder.

## Role boundaries

### Panel owns
- site identity registry
- site code uniqueness
- frontend URL and runtime metadata
- supported tasks
- page-level SEO overrides
- indexing and sitemap monitoring
- site health and crawlability checks
- publish logs and task activity

### Site owns
- design system
- component composition
- homepage storytelling
- card layouts and interactions
- brand-specific visuals

## Scale rule
Every new site should integrate with the panel through the same contract:
- unique `siteCode`
- same feed/bootstrap conventions
- same SEO runtime config shape
- same health and indexing reporting shape

## Why this matters
This keeps 100+ sites manageable without forcing all of them into the same visual output.
