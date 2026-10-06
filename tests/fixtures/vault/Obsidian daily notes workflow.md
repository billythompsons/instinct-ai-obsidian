# Obsidian daily notes workflow

My daily note is the inbox for everything. The template lives in
`templates/daily.md` and stamps the date, a `#log` section, and three
prompts: *What did I finish? What's stuck? What's tomorrow's first task?*

## Capture rules

1. One line per thought — expand later, never at capture time.
2. Link liberally: `[[project names]]` even before those notes exist. The
   graph fills itself in.
3. Tasks get `- [ ]` checkboxes; anything still open after 48 hours is
   either done, delegated, or deleted.

## Weekly review

Every Sunday I open the week's seven daily notes and distill them into
`weekly/2026-W40.md`: wins, open loops, and next week's three priorities.
Anything that survived two weekly reviews without action gets archived to
`archive/` — if it mattered, it would have moved.

## What actually stuck

The plugin stack is deliberately small: core Daily Notes, Templates,
Dataview for the weekly rollup, and nothing else. Fancy setups died within
a month; the boring one survived two years because opening the app and
typing is the whole ritual.
