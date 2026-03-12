# Site Runtime SDK

Use this SDK in every frontend site as the common runtime layer.

## Purpose

- report site liveness to Site Master Pro
- report environment, SDK version, connector version, and response time
- keep backend as the source of truth for site health

## Required site env

```env
NEXT_PUBLIC_SITE_CODE=listing_next_main
NEXT_PUBLIC_MASTER_PANEL_URL=http://localhost:4000
MASTER_PANEL_RUNTIME_KEY=your-runtime-api-key
NEXT_PUBLIC_SITE_RUNTIME_ENV=production
NEXT_PUBLIC_SITE_RUNTIME_SDK_VERSION=site-runtime-v1
```

## Recommended pattern

1. Add a local route in the site:
   - `/api/site-runtime/heartbeat`
2. Keep `MASTER_PANEL_RUNTIME_KEY` server-only.
3. Use the browser/client SDK only to ping the local route.
4. Let the local route forward the heartbeat securely to Site Master Pro.

## Reference implementation

See:
- [/Users/yashnihalani/Downloads/Listing_next/lib/site-runtime/runtime-sdk.ts](/Users/yashnihalani/Downloads/Listing_next/lib/site-runtime/runtime-sdk.ts)
- [/Users/yashnihalani/Downloads/Listing_next/app/api/site-runtime/heartbeat/route.ts](/Users/yashnihalani/Downloads/Listing_next/app/api/site-runtime/heartbeat/route.ts)
- [/Users/yashnihalani/Downloads/Listing_next/components/runtime/site-runtime-beacon.tsx](/Users/yashnihalani/Downloads/Listing_next/components/runtime/site-runtime-beacon.tsx)
