import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../cli/config';
import { fetchWithApiKey, publishMarkdown } from '../cli/core/http';
import {
  DEFAULT_API_ENDPOINT,
  DEFAULT_RETRIES,
  DEFAULT_SITE_URL,
  DEFAULT_TIMEOUT_MS,
  validateUrl,
} from '../cli/core/runtime';

export type BriMcpOptions = {
  apiKey: string;
  endpoint: URL;
  siteUrl: URL;
};

type Note = {
  id?: string;
  username: string;
  slug: string;
  title: string;
  content?: string;
  visibility?: 'public' | 'private';
  createdAt?: number;
  updatedAt?: number;
};

const idSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, 'Use a valid Bri ID.');

function text(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
}

function requireApiKey(apiKey: string): string {
  if (!apiKey) throw new Error('Missing Bri API key. Set BRI_API_KEY or run `bri login`.');
  return apiKey;
}

export async function loadBriMcpOptions(): Promise<BriMcpOptions> {
  const config = await loadConfig();

  return {
    apiKey: (process.env.BRI_API_KEY ?? config.apiKey ?? '').trim(),
    endpoint: validateUrl(
      process.env.BRI_ENDPOINT ?? config.endpoint ?? DEFAULT_API_ENDPOINT,
      'BRI_ENDPOINT'
    ),
    siteUrl: validateUrl(
      process.env.BRI_SITE_URL ?? config.siteUrl ?? DEFAULT_SITE_URL,
      'BRI_SITE_URL'
    ),
  };
}

export function createBriMcpServer(options: BriMcpOptions): McpServer {
  const server = new McpServer({ name: 'bri', version: '1.0.0' });

  server.registerTool(
    'list_notes',
    {
      title: 'List Bri notes',
      description: 'Lists active or deleted notes available to the configured Bri API key.',
      inputSchema: z.object({
        state: z.enum(['active', 'deleted']).default('active'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ state }) => {
      const endpoint = new URL(options.endpoint);
      endpoint.searchParams.set('state', state);
      const notes = (await fetchWithApiKey({
        endpoint,
        apiKey: requireApiKey(options.apiKey),
      })) as Note[];

      return { content: text(notes), structuredContent: { notes } };
    }
  );

  server.registerTool(
    'read_note',
    {
      title: 'Read a Bri note',
      description: 'Reads one Bri note by username and slug.',
      inputSchema: z.object({
        username: z.string().trim().min(1).max(64),
        slug: z.string().trim().min(1).max(128),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ username, slug }) => {
      const endpoint = new URL(
        `/api/public/notes/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
        options.siteUrl
      );
      const note = (await fetchWithApiKey({
        endpoint,
        apiKey: requireApiKey(options.apiKey),
      })) as Note;

      return { content: text(note), structuredContent: { note } };
    }
  );

  server.registerTool(
    'publish_note',
    {
      title: 'Publish a Bri note',
      description: 'Publishes a Markdown note to Bri. This creates external state.',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(120),
        content: z.string().trim().min(1).max(1_048_576),
        visibility: z.enum(['public', 'private']).default('public'),
        expiresInDays: z.number().int().min(1).max(30).nullable().default(30),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, content, visibility, expiresInDays }) => {
      const published = await publishMarkdown({
        endpoint: options.endpoint,
        apiKey: requireApiKey(options.apiKey),
        title,
        content,
        visibility,
        expiresInDays,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retries: DEFAULT_RETRIES,
      });
      const url = new URL(`/${published.username}/${published.slug}`, options.siteUrl).toString();
      const result = { ...published, url };

      return { content: text(result), structuredContent: result };
    }
  );

  server.registerTool(
    'list_note_versions',
    {
      title: 'List Bri note versions',
      description: 'Lists version metadata for a Bri note by note ID.',
      inputSchema: z.object({
        noteId: idSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ noteId }) => {
      const endpoint = new URL(
        `/api/notes/by-id/${encodeURIComponent(noteId)}/versions`,
        options.endpoint
      );
      const versions = (await fetchWithApiKey({
        endpoint,
        apiKey: requireApiKey(options.apiKey),
      })) as unknown[];

      return { content: text(versions), structuredContent: { versions } };
    }
  );

  server.registerTool(
    'read_note_version',
    {
      title: 'Read a Bri note version',
      description: 'Reads full content for one Bri note version by note ID and version ID.',
      inputSchema: z.object({
        noteId: idSchema,
        versionId: idSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ noteId, versionId }) => {
      const endpoint = new URL(
        `/api/notes/by-id/${encodeURIComponent(noteId)}/versions`,
        options.endpoint
      );
      endpoint.searchParams.set('versionId', versionId);
      const version = await fetchWithApiKey({
        endpoint,
        apiKey: requireApiKey(options.apiKey),
      });

      return { content: text(version), structuredContent: { version } };
    }
  );

  server.registerTool(
    'restore_note_version',
    {
      title: 'Restore a Bri note version',
      description: 'Restores a Bri note to a prior version. This updates external state.',
      inputSchema: z.object({
        noteId: idSchema,
        versionId: idSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ noteId, versionId }) => {
      const endpoint = new URL(
        `/api/notes/by-id/${encodeURIComponent(noteId)}/versions`,
        options.endpoint
      );
      const result = await fetchWithApiKey({
        endpoint,
        apiKey: requireApiKey(options.apiKey),
        method: 'PATCH',
        body: { action: 'restore', versionId },
      });

      return { content: text(result), structuredContent: { result } };
    }
  );

  return server;
}
