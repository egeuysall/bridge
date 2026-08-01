import { loadConfig } from '../config';
import { fetchWithApiKey } from '../core/http';
import {
  DEFAULT_API_ENDPOINT,
  DEFAULT_MAX_BYTES,
  DEFAULT_SITE_URL,
  VERSION,
  type InviteOptions,
  type LinksCreateOptions,
  type LinksDeleteOptions,
  type LinksListOptions,
  type LinksUpdateOptions,
  type NotesDeleteOptions,
  type NotesRestoreVersionOptions,
  type NotesListOptions,
  type NotesReadOptions,
  type NotesAskOptions,
  type NotesUpdateOptions,
  type NotesVersionOptions,
  type NotificationsActionOptions,
  type NotificationsListOptions,
  getStringSetting,
  openInBrowser,
  optionProvidedByCli,
  parseOptionalPositiveInt,
  parsePositiveInt,
  parseTitleFromMarkdown,
  parseVisibility,
  printJson,
  readMarkdownFile,
  readMarkdownStdin,
  validateResourceId,
  validateUrl,
  type CommandLike,
} from '../core/shared';
import { renderPanel, renderTable } from '../core/ui';

export async function runNotesList(options: NotesListOptions, command: CommandLike): Promise<void> {
  const config = await loadConfig();
  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const endpoint = validateUrl(endpointRaw, 'endpoint');
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');
  const state = options.state === 'deleted' ? 'deleted' : 'active';
  endpoint.searchParams.set('state', state);

  const data = (await fetchWithApiKey({ endpoint, apiKey })) as Array<Record<string, unknown>>;
  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  const color = optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY;
  if (!Array.isArray(data) || data.length === 0) {
    renderTable({
      title: `bri notes (${state})`,
      rows: [],
      columns: [],
      enableColor: color,
      empty: 'no notes',
    });
    return;
  }

  renderTable({
    title: `bri notes (${state})`,
    rows: data,
    enableColor: color,
    empty: 'no notes',
    columns: [
      { header: 'id', width: 16, render: (row) => (typeof row.id === 'string' ? row.id : '') },
      {
        header: 'path',
        width: 28,
        render: (row) => {
          const username = typeof row.username === 'string' ? row.username : '';
          const slug = typeof row.slug === 'string' ? row.slug : '';
          return `${username}/${slug}`;
        },
      },
      {
        header: 'title',
        width: 42,
        render: (row) => (typeof row.title === 'string' ? row.title : 'untitled'),
      },
    ],
  });
}

export async function runNotesRead(
  username: string,
  slug: string,
  options: NotesReadOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const siteRaw = optionProvidedByCli(command, 'endpoint')
    ? (options.endpoint ?? DEFAULT_SITE_URL)
    : (process.env.BRI_SITE_URL ?? config.siteUrl ?? DEFAULT_SITE_URL);
  const base = validateUrl(siteRaw, 'site-url');
  const endpoint = new URL(
    `/api/public/notes/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    base
  );
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();

  const response = await fetch(endpoint, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });

  const raw = await response.text();
  const parsed = raw ? (JSON.parse(raw) as { data?: unknown; error?: string }) : {};
  if (!response.ok) throw new Error(parsed.error || `request failed (${response.status})`);

  if (options.json) {
    printJson(
      parsed.data ?? {},
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  const data = parsed.data as { title?: string; content?: string };
  console.log(data.title || `${username}/${slug}`);
  console.log('');
  console.log(data.content || '');
}

function getApiKey(configApiKey?: string): string {
  const apiKey = (configApiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');
  return apiKey;
}

function getNotesByIdEndpoint(
  command: CommandLike,
  options: { endpoint?: string },
  configEndpoint: string | undefined,
  noteId: string
): URL {
  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    configEndpoint,
    DEFAULT_API_ENDPOINT
  );
  return new URL(
    `/api/notes/by-id/${encodeURIComponent(validateResourceId(noteId, 'note id'))}`,
    validateUrl(endpointRaw, 'endpoint')
  );
}

export async function runNotesHistory(
  id: string,
  options: NotesVersionOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const endpoint = getNotesByIdEndpoint(command, options, config.endpoint, id);
  endpoint.pathname = `${endpoint.pathname}/versions`;
  const apiKey = getApiKey(config.apiKey);

  const data = (await fetchWithApiKey({ endpoint, apiKey })) as Array<Record<string, unknown>>;
  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  renderTable({
    title: 'bri note versions',
    rows: Array.isArray(data) ? data : [],
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    empty: 'no versions',
    columns: [
      { header: 'id', width: 18, render: (row) => (typeof row.id === 'string' ? row.id : '') },
      {
        header: 'title',
        width: 38,
        render: (row) => (typeof row.title === 'string' ? row.title : 'untitled'),
      },
      {
        header: 'updated',
        width: 22,
        render: (row) =>
          typeof row.createdAt === 'number' ? new Date(row.createdAt).toISOString() : '',
      },
    ],
  });
}

export async function runNotesVersion(
  noteId: string,
  versionId: string,
  options: NotesVersionOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const endpoint = getNotesByIdEndpoint(command, options, config.endpoint, noteId);
  endpoint.pathname = `${endpoint.pathname}/versions`;
  endpoint.searchParams.set('versionId', validateResourceId(versionId, 'version id'));
  const apiKey = getApiKey(config.apiKey);

  const data = (await fetchWithApiKey({ endpoint, apiKey })) as Record<string, unknown>;
  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  console.log(typeof data.title === 'string' ? data.title : versionId);
  console.log('');
  console.log(typeof data.content === 'string' ? data.content : '');
}

export async function runNotesAsk(
  username: string,
  slug: string,
  options: NotesAskOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const siteRaw = optionProvidedByCli(command, 'endpoint')
    ? (options.endpoint ?? DEFAULT_SITE_URL)
    : (process.env.BRI_SITE_URL ?? config.siteUrl ?? DEFAULT_SITE_URL);
  const base = validateUrl(siteRaw, 'site-url');
  const endpoint = new URL(
    `/api/notes/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/ask`,
    base
  );
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  const question = options.stdin
    ? (await readMarkdownStdin(4_096)).trim()
    : (options.question ?? '').trim();

  if (!question) {
    throw new Error('missing question. pass --question or --stdin');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `bri/${VERSION}`,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const raw = await response.text();
      let message = `request failed (${response.status})`;
      try {
        const parsed = raw ? (JSON.parse(raw) as { error?: string }) : {};
        message = parsed.error || message;
      } catch {
        if (raw.trim()) {
          message = raw.trim();
        }
      }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let answer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      answer += chunk;
      if (!options.json) {
        process.stdout.write(chunk);
      }
    }

    const finalChunk = decoder.decode();
    if (finalChunk) {
      answer += finalChunk;
      if (!options.json) {
        process.stdout.write(finalChunk);
      }
    }

    if (options.json) {
      printJson(
        { data: { answer } },
        optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
      );
    } else {
      process.stdout.write('\n');
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function runNotesUpdate(
  id: string,
  options: NotesUpdateOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = getApiKey(config.apiKey);
  const endpoint = getNotesByIdEndpoint(command, options, config.endpoint, id);

  const maxBytes = optionProvidedByCli(command, 'maxBytes')
    ? parsePositiveInt(options.maxBytes, 'max-bytes')
    : DEFAULT_MAX_BYTES;

  let content = '';
  if (options.stdin) {
    content = await readMarkdownStdin(maxBytes);
  } else if (options.path) {
    const loaded = await readMarkdownFile(options.path, maxBytes);
    content = loaded.content;
  } else {
    throw new Error('missing input. use --path or --stdin');
  }

  const title = options.title?.trim() || parseTitleFromMarkdown(content);
  if (!title) throw new Error('missing title. pass --title or include markdown H1');

  const visibility = parseVisibility(options.visibility);
  const parsedDays = parseOptionalPositiveInt(options.expireDays);
  const expiresInDays = parsedDays ? Math.min(30, parsedDays) : 30;

  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'PATCH',
    body: {
      action: 'update',
      title,
      content,
      visibility,
      expiresInDays,
    },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }
  renderPanel({
    title: 'bri note',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [{ label: 'status', value: 'updated', tone: 'ok' }],
  });
}

export async function runNotesDelete(
  id: string,
  options: NotesDeleteOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = getApiKey(config.apiKey);
  const endpoint = getNotesByIdEndpoint(command, options, config.endpoint, id);

  const action = options.permanent ? 'permanentDelete' : 'softDelete';
  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'PATCH',
    body: { action },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }
  renderPanel({
    title: 'bri note',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [
      { label: 'status', value: options.permanent ? 'deleted forever' : 'deleted', tone: 'ok' },
    ],
  });
}

export async function runNotesRestoreVersion(
  noteId: string,
  versionId: string,
  options: NotesRestoreVersionOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = getApiKey(config.apiKey);
  const endpoint = getNotesByIdEndpoint(command, options, config.endpoint, noteId);
  endpoint.pathname = `${endpoint.pathname}/versions`;

  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'PATCH',
    body: { action: 'restore', versionId: validateResourceId(versionId, 'version id') },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }
  renderPanel({
    title: 'bri note',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [{ label: 'status', value: 'version restored', tone: 'ok' }],
  });
}

export async function runLinksList(options: LinksListOptions, command: CommandLike): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL('/api/quick-links', baseEndpoint);

  const data = (await fetchWithApiKey({ endpoint, apiKey })) as Array<Record<string, unknown>>;
  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  const color = optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY;
  if (!Array.isArray(data) || data.length === 0) {
    renderTable({
      title: 'bri links',
      rows: [],
      columns: [],
      enableColor: color,
      empty: 'no links',
    });
    return;
  }

  renderTable({
    title: 'bri links',
    rows: data,
    enableColor: color,
    empty: 'no links',
    columns: [
      { header: 'id', width: 16, render: (row) => (typeof row.id === 'string' ? row.id : '') },
      {
        header: 'path',
        width: 24,
        render: (row) => {
          const username = typeof row.username === 'string' ? row.username : '';
          const key = typeof row.key === 'string' ? row.key : '';
          return `${username}/${key}`;
        },
      },
      {
        header: 'target',
        width: 42,
        render: (row) => (typeof row.targetUrl === 'string' ? row.targetUrl : ''),
      },
      {
        header: 'clicks',
        width: 8,
        render: (row) => (typeof row.clicks === 'number' ? String(row.clicks) : '0'),
      },
    ],
  });
}

export async function runLinksCreate(
  options: LinksCreateOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const key = options.key?.trim() || '';
  const targetUrl = options.target?.trim() || '';
  if (!key) throw new Error('missing key');
  if (!targetUrl) throw new Error('missing target url');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL('/api/quick-links', baseEndpoint);

  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'POST',
    body: {
      key,
      targetUrl,
      label: options.label?.trim() || null,
    },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }
  renderPanel({
    title: 'bri link',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [
      { label: 'status', value: 'created', tone: 'ok' },
      { label: 'key', value: key, tone: 'info' },
    ],
  });
}

export async function runLinksUpdate(
  id: string,
  options: LinksUpdateOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const key = options.key?.trim() || '';
  const targetUrl = options.target?.trim() || '';
  if (!key) throw new Error('missing key');
  if (!targetUrl) throw new Error('missing target url');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL(`/api/quick-links/${encodeURIComponent(id)}`, baseEndpoint);

  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'PATCH',
    body: {
      key,
      targetUrl,
      label: options.label?.trim() || null,
    },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }
  renderPanel({
    title: 'bri link',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [
      { label: 'status', value: 'updated', tone: 'ok' },
      { label: 'id', value: id, tone: 'muted' },
    ],
  });
}

export async function runLinksDelete(
  id: string,
  options: LinksDeleteOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL(`/api/quick-links/${encodeURIComponent(id)}`, baseEndpoint);

  const data = await fetchWithApiKey({ endpoint, apiKey, method: 'DELETE' });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  renderPanel({
    title: 'bri link',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [
      { label: 'status', value: 'deleted', tone: 'ok' },
      { label: 'id', value: id, tone: 'muted' },
    ],
  });
}

export async function runInvite(
  kind: 'note' | 'link',
  id: string,
  options: InviteOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const inviteeUsername = options.username?.trim().toLowerCase() || '';
  if (!inviteeUsername) throw new Error('missing invitee username');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL('/api/invitations', baseEndpoint);

  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'POST',
    body: {
      kind,
      id,
      inviteeUsername,
    },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }
  renderPanel({
    title: `bri ${kind} invite`,
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [
      { label: 'status', value: 'invited', tone: 'ok' },
      { label: 'username', value: `@${inviteeUsername}`, tone: 'info' },
    ],
  });
}

export async function runNotificationsList(
  options: NotificationsListOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL('/api/notifications', baseEndpoint);

  const data = (await fetchWithApiKey({ endpoint, apiKey })) as {
    username?: string | null;
    items?: Array<{
      id?: string;
      kind?: string;
      message?: string;
      createdAt?: number;
      noteId?: string | null;
      linkId?: string | null;
    }>;
  };

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  const rows = Array.isArray(data?.items) ? data.items : [];
  if (rows.length === 0) {
    renderTable({
      title: 'bri notifications',
      rows: [],
      columns: [],
      enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
      empty: 'no notifications',
    });
    return;
  }

  renderTable({
    title: 'bri notifications',
    rows,
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    empty: 'no notifications',
    columns: [
      { header: 'id', width: 16, render: (row) => (typeof row.id === 'string' ? row.id : '') },
      {
        header: 'kind',
        width: 12,
        render: (row) => (typeof row.kind === 'string' ? row.kind : 'notice'),
      },
      {
        header: 'message',
        width: 48,
        render: (row) => (typeof row.message === 'string' ? row.message : ''),
      },
      {
        header: 'created',
        width: 24,
        render: (row) =>
          typeof row.createdAt === 'number' ? new Date(row.createdAt).toISOString() : 'unknown',
      },
    ],
  });
}

export async function runNotificationsOpen(
  notificationId: string,
  options: NotificationsActionOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const siteUrlRaw = process.env.BRI_SITE_URL ?? config.siteUrl ?? DEFAULT_SITE_URL;
  const siteUrl = validateUrl(siteUrlRaw, 'site-url');
  const endpoint = new URL('/api/notifications', baseEndpoint);

  const data = (await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'PATCH',
    body: {
      action: 'open',
      notificationId,
    },
  })) as { href?: string | null };

  const href = typeof data?.href === 'string' ? data.href : null;

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  if (!href) {
    renderPanel({
      title: 'bri notification',
      enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
      rows: [{ label: 'status', value: 'target unavailable', tone: 'warn' }],
    });
    return;
  }

  const targetUrl = new URL(href, siteUrl).toString();
  renderPanel({
    title: 'bri notification',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [
      { label: 'status', value: 'opened', tone: 'ok' },
      { label: 'url', value: targetUrl, tone: 'info' },
    ],
  });
  void openInBrowser(targetUrl);
}

export async function runNotificationsDismiss(
  notificationId: string,
  options: NotificationsActionOptions,
  command: CommandLike
): Promise<void> {
  const config = await loadConfig();
  const apiKey = (config.apiKey || process.env.BRI_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing api key. run `bri login --api-key <key>`');

  const endpointRaw = getStringSetting(
    command,
    'endpoint',
    options.endpoint,
    process.env.BRI_ENDPOINT,
    config.endpoint,
    DEFAULT_API_ENDPOINT
  );
  const baseEndpoint = validateUrl(endpointRaw, 'endpoint');
  const endpoint = new URL('/api/notifications', baseEndpoint);

  const data = await fetchWithApiKey({
    endpoint,
    apiKey,
    method: 'PATCH',
    body: {
      action: 'dismiss',
      notificationId,
    },
  });

  if (options.json) {
    printJson(
      { data },
      optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY
    );
    return;
  }

  renderPanel({
    title: 'bri notification',
    enableColor: optionProvidedByCli(command, 'color') ? options.color : process.stdout.isTTY,
    rows: [{ label: 'status', value: 'dismissed', tone: 'ok' }],
  });
}
