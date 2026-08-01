import { safeJsonStringify } from '@vercel/flags';
import { DEFAULT_TIMEOUT_MS, VERSION } from './runtime';

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishMarkdown(input: {
  endpoint: URL;
  apiKey: string;
  title: string;
  visibility: 'public' | 'private';
  expiresInDays: number | null;
  content: string;
  timeoutMs: number;
  retries: number;
}): Promise<{ slug: string; username: string; elapsedMs: number; statusCode: number }> {
  const payload = safeJsonStringify({
    title: input.title,
    content: input.content,
    visibility: input.visibility,
    expiresInDays: input.expiresInDays,
  });

  const start = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= input.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(input.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `bri/${VERSION}`,
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: payload,
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        if (response.status >= 500 && attempt < input.retries) {
          await wait(250 * (attempt + 1));
          continue;
        }

        throw new Error(`server returned ${response.status}: ${responseText}`);
      }

      const parsed = JSON.parse(responseText) as {
        data?: { slug?: unknown; username?: unknown };
      };
      const resolvedSlug = parsed?.data?.slug;
      const resolvedUsername = parsed?.data?.username;

      if (typeof resolvedSlug !== 'string' || !resolvedSlug.trim()) {
        throw new Error('server response missing data.slug');
      }
      if (typeof resolvedUsername !== 'string' || !resolvedUsername.trim()) {
        throw new Error('server response missing data.username');
      }

      return {
        slug: resolvedSlug,
        username: resolvedUsername,
        elapsedMs: Date.now() - start,
        statusCode: response.status,
      };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastError = normalized;

      if (attempt < input.retries) {
        await wait(250 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError?.message ?? 'publish failed');
}

export async function fetchWithApiKey(input: {
  endpoint: URL;
  apiKey: string;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input.endpoint, {
      method: input.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `bri/${VERSION}`,
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: input.body !== undefined ? safeJsonStringify(input.body) : undefined,
      signal: controller.signal,
    });

    const raw = await response.text();
    const parsed = raw ? (JSON.parse(raw) as { data?: unknown; error?: string }) : {};

    if (!response.ok) {
      throw new Error(parsed.error || `request failed (${response.status})`);
    }

    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}
