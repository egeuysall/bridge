# Bri documentation

This directory contains the **Holocron documentation site** for Bri. The main Bri app serves product routes; the production Vercel rewrite exposes this site at [`https://bri.fyi/docs`](https://bri.fyi/docs).

## Local development

```bash
bun install
bun run dev
```

Open [`http://localhost:5173/docs/`](http://localhost:5173/docs/) after the dev server starts. Edit MDX pages in `src/` and navigation in `docs.jsonc`.

## Build and run production output

```bash
bun run build
bun run start
```

The server listens on port `3000` by default. Set `PORT` when running the docs app separately.

## Deploy

From the repository root:

```bash
bun run docs:deploy
```

That deploys the linked **`bri-docs` Vercel project**. Keep the `/docs/` base path in `vite.config.ts`; the main app rewrite and all generated asset URLs depend on it.

## Content rules

- Put new pages under the folder for their navigation group.
- Add every page slug to `docs.jsonc`.
- Use relative links to the real `.mdx` file, not guessed route paths.
- Run `bun run build` before committing content changes.
