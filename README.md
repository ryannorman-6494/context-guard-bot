# context-guard-bot

A Claude Code mod: a slim, permanent context-usage bar above the prompt, with a
small animated sparkle. Green under 20%, amber 20–30%, red past 30% — each
tier has a few short phrases that rotate in. The tier only climbs during a
session (never drops back down quietly) and resets on a new one.

## Install

In a `claude` terminal session (not the desktop app's Code tab — plugin
install runs from the CLI):

```
/plugin install context-guard-bot --marketplace ryannorman-6494/context-guard-bot
```

Say `y` to add the marketplace, then pick the **user** scope (the default) so
it loads in every project, not just the current one.

## Develop

This folder is the mod itself — edit `hooks/register.tsx` directly. To try
changes without reinstalling, point a session at the folder:

```
claude --plugin-dir /path/to/context-guard-bot
```
