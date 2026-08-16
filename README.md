# bri

bri is a minimalist Next.js app for sharing Markdown instantly.

## Stack

- Next.js 16
- Bun
- Convex

## Local Development

1. Copy the required variables into `.env.local`.
2. Install dependencies:

```bash
bun i
```

3. Start the app:

```bash
bun dev
```

## CLI

Homebrew (recommended):

```bash
brew tap egeuysall/tap
brew install --formula egeuysall/tap/bri
```

The source installer remains available for machines without Homebrew:

```bash
curl -fsSL https://bri.fyi/install.sh | bash
```

The installer resolves the latest release tag, installs Bun if needed, downloads the source bundle, installs dependencies, auto-adds the install directory to `PATH`, and configures a daily background reinstall job.

Useful note commands:

```bash
bri notes history <note-id>
bri notes version <note-id> <version-id>
bri notes restore-version <note-id> <version-id>
```

The version-history API uses the same API key permissions:

```bash
curl -H "Authorization: Bearer $BRI_API_KEY" \
  "https://bri.fyi/api/notes/by-id/<note-id>/versions"
curl -H "Authorization: Bearer $BRI_API_KEY" \
  "https://bri.fyi/api/notes/by-id/<note-id>/versions?versionId=<version-id>"
curl -X PATCH -H "Authorization: Bearer $BRI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"restore","versionId":"<version-id>"}' \
  "https://bri.fyi/api/notes/by-id/<note-id>/versions"
```

Listing and reading require read permission; restoring requires write permission.

## MCP server

The stdio MCP server can list, read, publish, inspect versions, and restore Bri notes using the same scoped API keys as the CLI:

```bash
BRI_API_KEY=bri_... bri mcp
```

It also reads the API key and endpoint saved by `bri login`. To connect an MCP client from source, run `bri mcp` or `bun run mcp`. A read/write key is required for publish and restore tools; Bri enforces read and write permissions server-side.

The same tools are hosted over stateless, POST-only Streamable HTTP with JSON responses at `http://localhost:3000/mcp` in development and `https://bri.fyi/mcp` in production. Send each request with `Authorization: Bearer <Bri API key>`; the server does not store or share client credentials.

```bash
bun run mcp:test
```

The app will be available at `http://localhost:3000`.

## Required Environment Variables

```bash
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AI_GATEWAY_API_KEY=vck_...
AI_GATEWAY_MODEL=openai/gpt-oss-20b
BRIDGE_ADMIN_USERS=admin@example.com
BRIDGE_ADMIN_SECRET=
```

`AI_GATEWAY_API_KEY` is server-only. Do not expose it with a `NEXT_PUBLIC_` prefix.
Set both admin variables in the Next.js and Convex deployments; version-history admin operations require the authenticated user's email to match `BRIDGE_ADMIN_USERS` and the server secret.

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [LICENSE](LICENSE) file for details.
