declare module '@sentry/react' {
  export function init(options: {
    dsn?: string
    enabled?: boolean
    tracesSampleRate?: number
    environment?: string
    [key: string]: unknown
  }): void

  export function captureException(
    error: unknown,
    context?: { extra?: Record<string, unknown>; [key: string]: unknown }
  ): string
}
