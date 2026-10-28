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
  ok: [
    "Fresh boots, full map. Let’s Xplor!",
    "Plenty of trail ahead. Xplor away!",
    "Compass charged, curiosity high. Time to Xplor."
  ],
  warn: [
    "Halfway up the mountain. Still Xploring, slightly sweaty.",
    "Snack break? The Xplorer is starting to puff.",
    "Backpack’s getting heavy with all this Xploring."
  ],
  danger: [
    "Base camp is calling. This Xplorer needs a nap.",
    "Map’s full of scribbles. Time for a fresh one, Xplorer!",
    "Too much Xploring, not enough oxygen. Head back to camp."
  ]
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

// One fixed chomp speed per tier, not a continuous function of percent:
// percent changes far more often than the tier does, and tying the SVG's
// source string to a fast-changing value is exactly what made the sparkle
// stutter before (it remounted, and restarted, on every tick). The mouth only
// speeds up on a real zone crossing, same as the colour already does.
const TIER_CHOMP_SECONDS: Record<ContextTier, number> = { ok: 1.1, warn: 0.65, danger: 0.35 }

function arcPoint(angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [12 + 10 * Math.cos(rad), 12 + 10 * Math.sin(rad)]
}

// A single pie boundary, one continuous path, not a circle-plus-cutout: two
// separately-drawn arcs that are only numerically the same circle leave a
// hair's-width seam between them once you're down at a 13px icon — that was
// the "tiny sliver still" left by the evenodd version. One arc, one curve,
// nothing to seam against.
//
// From point1 (angle -theta) to point2 (angle +theta), the body is the long
// way around (through 180°, not through the mouth gap) — large-arc-flag 1.
// SVG's sweep-flag 1 means increasing angle, which on screen (y grows
// downward) reads clockwise; the long way from -theta to +theta is
// decreasing angle (through -90, -180, back up to +theta from the far side),
// so sweep is 0, not the 1 guessed originally — that earlier guess is what
// filled the mouth and left the body empty.
function pacPath(theta: number): string {
  const [x1, y1] = arcPoint(-theta)
  const [x2, y2] = arcPoint(theta)
  return `M12,12 L${x1.toFixed(2)},${y1.toFixed(2)} A10,10 0 1 0 ${x2.toFixed(2)},${y2.toFixed(2)} Z`
}

const PAC_CLOSED = pacPath(2)
const PAC_OPEN = pacPath(35)

// The bar is an SVG so it can be a few pixels tall: a Box is at least one text row high, and its border
// adds more, which is what made the bar look thick. Static (no animation), so a re-draw per token is harmless.
const BAR_HEIGHT_PX = 5
const BAR_PX_PER_CELL = 8
function barSvg(widthPx: number, percent: number, color: string) {
  const h = BAR_HEIGHT_PX
  const r = h / 2
  const fillPx = percent > 0 ? Math.min(widthPx, Math.max(h, Math.round((percent / 100) * widthPx))) : 0
  const fill = fillPx > 0 ? `<rect x="0" y="0" width="${fillPx}" height="${h}" rx="${r}" fill="${color}"/>` : ''
  return `<svg viewBox="0 0 ${widthPx} ${h}" width="${widthPx}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="${widthPx - 1}" height="${h - 1}" rx="${r}" fill="${TRACK_COLOR}" stroke="#D4D4D4"/>${fill}</svg>`
}

function pacmanSvg(color: string, chompSeconds: number) {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${PAC_OPEN}" fill="${color}"><animate attributeName="d" values="${PAC_OPEN};${PAC_CLOSED};${PAC_OPEN}" dur="${chompSeconds}s" calcMode="linear" repeatCount="indefinite"/></path></svg>`
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
      <Svg source={pacmanSvg(color, TIER_CHOMP_SECONDS[usage.tier])} alt="Pac-Man" width={13} height={13} isInteractive />
    ) : (
      <Text color={color} bold>C</Text>
    )

    return (
      <Box flexDirection="row" alignItems="center" gap={1} paddingX={1}>
        {icon}
        {Svg ? (
          <Svg source={barSvg(trackWidth * BAR_PX_PER_CELL, usage.percent, color)} alt={`Context used: ${Math.round(usage.percent)}%`} width={trackWidth * BAR_PX_PER_CELL} height={BAR_HEIGHT_PX} />
        ) : (
          // Terminal: no image leaf, so a one-row Box pair with no border (a border adds rows).
          <Box position="relative" width={trackWidth} height={1}>
            <Box width={trackWidth} height={1} backgroundColor={TRACK_COLOR} />
            {filled > 0 && <Box position="absolute" top={0} left={0} width={filled} height={1} backgroundColor={color} />}
          </Box>
        )}
        <Text color={usage.tier === 'ok' ? undefined : color} dimColor={usage.tier === 'ok'} bold={usage.tier !== 'ok'}>
          {Math.round(usage.percent)}%
        </Text>
        <Text dimColor>· {Math.round(usage.tokens / 1000)}k</Text>
        <Text color={color}>· {usage.message}</Text>
      </Box>
    )
  })
}
