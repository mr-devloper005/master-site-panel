export type RuntimeHeartbeatPayload = {
  siteCode: string
  environment?: string
  frontendUrl?: string
  sdkVersion?: string
  connectorVersion?: string
  responseTimeMs?: number
  supportedTasks?: string[]
  capabilities?: Record<string, unknown>
  meta?: Record<string, unknown>
  lastError?: string
  status?: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
  timestamp?: string
}

export type SiteRuntimeClientOptions = {
  endpoint: string
  buildPayload: () => RuntimeHeartbeatPayload
  intervalMs?: number
}

export function createSiteRuntimeClient(options: SiteRuntimeClientOptions) {
  const intervalMs = options.intervalMs ?? 60_000
  let timer: ReturnType<typeof setInterval> | null = null

  const send = async () => {
    const payload = {
      ...options.buildPayload(),
      timestamp: new Date().toISOString(),
    }

    await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  }

  return {
    start() {
      void send()
      timer = setInterval(() => {
        void send()
      }, intervalMs)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    send,
  }
}

