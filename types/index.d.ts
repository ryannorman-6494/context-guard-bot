export type ContextTier = 'ok' | 'warn' | 'danger'
export type ContextUsage = { tokens: number; percent: number; tier: ContextTier; message: string }

declare module 'claude-code' {
  interface PluginState {
    'context-guard-bot': { usage: ContextUsage }
  }
}
