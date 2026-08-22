# Holocron Docs Template

This is a Holocron documentation site. MDX pages live in `src/`, site config and navigation live in `docs.jsonc`.

Before editing docs content, styling, or navigation, load the Holocron skill:

```
https://raw.githubusercontent.com/remorses/holocron/refs/heads/main/skills/holocron/SKILL.md
```

The skill covers writing style, MDX components, navigation placement, Aside usage, diagram conventions, and more.

## Schemas

- **docs.jsonc** config schema: `https://holocron.so/docs.json` (already set via `$schema` in docs.jsonc)
- **Frontmatter** schema: `https://holocron.so/frontmatter.json` (already set via `$schema` in each MDX file)

Both schemas provide autocomplete and validation in editors that support JSON Schema.

## Adding pages

1. Create a new `.mdx` file in `src/` with frontmatter:

```mdx
---
"$schema": https://holocron.so/frontmatter.json
title: My Page
description: Short description of this page.
---

# My Page

Content here.
```

2. Add the page slug to `docs.jsonc` navigation. Pages not listed in navigation won't appear in the sidebar.

## Config

`docs.jsonc` controls site name, colors, navbar, footer, and the full navigation tree (tabs, groups, pages, anchors). See the config schema for all supported fields.
