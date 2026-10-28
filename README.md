# context-guard-bot

A Claude Code mod: a slim, permanent context-usage bar above the prompt, with a
chomping Pac-Man. Green under 20%, amber 20–30%, red past 30% — each
tier has three Xplorer-themed phrases, one picked when the tier is entered. The tier only climbs during a
session (never drops back down quietly) and resets on a new one.

## Install

In a `claude` terminal session (not the desktop app's Code tab — plugin
install runs from the CLI):

```
/plugin install context-guard-bot --marketplace ryannorman-6494/context-guard-bot
```

Say `y` to add the marketplace, then pick the **user** scope (the default) so
it loads in every project, not just the current one.

## Updating

Updates are published here by bumping `version` in `.claude-plugin/plugin.json`.
A third-party marketplace does not refresh itself unless you turn that on, so
either update by hand:

```
claude plugin marketplace update context-guard-bot
claude plugin update context-guard-bot@context-guard-bot
```

or switch on auto-update for the marketplace once (in a `claude` session:
`/plugin`, open **Marketplaces**, pick `context-guard-bot`, enable auto-update),
after which new versions install themselves on the next start. Restart Claude
Code after an update to load it.

## Develop

This folder is the mod itself — edit `hooks/register.tsx` directly. To try
changes without reinstalling, point a session at the folder:

```
claude --plugin-dir /path/to/context-guard-bot
```
