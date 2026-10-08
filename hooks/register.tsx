import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ContextTier, ContextUsage } from '../types'

// A Claude Code dev mod (~/.claude/dev-mods), unrelated to the KYB onboarding
// project this session otherwise works in.

const WARN_PERCENT = 20
const DANGER_PERCENT = 30
const TRACK_COLOR = '#F5F5F2' // off-white, not theme-grey: Ryan asked for this literally

const TIER_RANK: Record<ContextTier, number> = { ok: 0, warn: 1, danger: 2 }
// One literal hex per tier, used for the bar fill, the text and the sparkle
// alike (a sandboxed <svg> can't read the app's theme tokens, so this can't
// be a ThemeKey). Amber, not the brownish amber-600 from the first pass.
const TIER_HEX: Record<ContextTier, string> = { ok: '#16A34A', warn: '#F59E0B', danger: '#DC2626' }
const TIER_PHRASES: Record<ContextTier, string[]> = {
  ok: ['plenty of room', 'cruising', 'all good here', 'In the green zone'],
  warn: ['getting cosy', 'climbing — keep an eye on it', 'snacking through tokens', 'Think about wrapping up'],
  danger: ['burning tokens fast', "context's about to pop", 'living dangerously (and expensively)', 'time to bail — new session']
}

function tierOf(percent: number): ContextTier {
  if (percent >= DANGER_PERCENT) return 'danger'
  if (percent >= WARN_PERCENT) return 'warn'
  return 'ok'
}

// One random line per tier, picked when that tier is first entered and kept
// until the tier changes again — not reshuffled on every token, so it reads
// as a line someone wrote, not a slot machine.
function pickPhrase(tier: ContextTier): string {
  const options = TIER_PHRASES[tier]
  return options[Math.floor(Math.random() * options.length)] ?? options[0]!
}

const usageAtom = atom(
  { plugin: 'context-guard-bot', key: 'usage' } as const,
  { tokens: 0, percent: 0, tier: 'ok', message: pickPhrase('ok') } as ContextUsage
)

// A four-point sparkle, not Anthropic's literal mark (no asset to draw from
// here) — a generic "AI" glyph in the same family, recoloured by tier. One
// fixed slow duration for everyone: varying it by tier changed the element's
// source string on every escalation, which restarted (and stuttered) the
// spin; now it only remounts on an actual tier change, otherwise it just
// spins, smoothly, forever.
function sparkleSvg(color: string) {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c0 4.2 1 6.8 2.6 8.4C16.2 12 18.8 13 23 13c-4.2 0-6.8 1-8.4 2.6C13 17.2 12 19.8 12 24c0-4.2-1-6.8-2.6-8.4C7.8 14 5.2 13 1 13c4.2 0 6.8-1 8.4-2.6C11 8.8 12 6.2 12 2z" fill="${color}"><animateTransform attributeName="transform" type="rotate" from="0 12 13" to="360 12 13" dur="9s" calcMode="linear" repeatCount="indefinite"/></path></svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Seed with what the session already has: this fires on a true new
    // session (genuinely 0) and on every hot reload (already under way).
    const { context } = await $.session.usage()
    const tokens = context.tokens ?? 0
    const percent = context.percent ?? 0
    const tier = tierOf(percent)

    await update($, usageAtom, () => ({ tokens, percent, tier, message: pickPhrase(tier) }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const tokens = e.context.tokens ?? 0
      const percent = e.context.percent ?? 0

      await update($, usageAtom, (prev) => {
        // Sticky: the tier only climbs within a session, never drops back down.
        const tier = TIER_RANK[tierOf(percent)] > TIER_RANK[prev.tier] ? tierOf(percent) : prev.tier
        // A fresh phrase only on an actual tier change, not on every token.
        const message = tier === prev.tier ? prev.message : pickPhrase(tier)

        return { tokens, percent, tier, message }
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, usageAtom)
    const components = $.ui.resolve(e)
    const { Box, Text } = components
    // Not every surface's table has Svg (the terminal has no image leaf); fall
    // back to a plain glyph there instead of the animated mark.
    const Svg = 'Svg' in components ? components.Svg : undefined

    const trackWidth = Math.max(12, Math.min(40, (e.props.bodyColumns ?? 60) - 26))
    const filled = usage.percent > 0 ? Math.max(1, Math.round((usage.percent / 100) * trackWidth)) : 0
    const color = TIER_HEX[usage.tier]

    const icon = Svg ? (
      <Svg source={sparkleSvg(color)} alt="Claude" width={13} height={13} isInteractive />
    ) : (
      <Text color={color} bold>✦</Text>
    )

    return (
      <Box flexDirection="row" alignItems="center" gap={1} paddingX={1}>
        {icon}
        <Box position="relative" width={trackWidth} height={1}>
          <Box width={trackWidth} height={1} backgroundColor={TRACK_COLOR} borderStyle="round" borderColor="#D4D4D4" />
          {filled > 0 && (
            <Box
              position="absolute"
              top={0}
              left={0}
              width={filled}
              height={1}
              backgroundColor={color}
              borderStyle="round"
              borderColor={color}
            />
          )}
        </Box>
        <Text color={usage.tier === 'ok' ? undefined : color} dimColor={usage.tier === 'ok'} bold={usage.tier !== 'ok'}>
          {Math.round(usage.percent)}%
        </Text>
        <Text dimColor>· {Math.round(usage.tokens / 1000)}k</Text>
        <Text color={color}>· {usage.message}</Text>
      </Box>
    )
  })
}
