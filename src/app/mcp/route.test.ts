import { afterEach, describe, expect, mock, test } from 'bun:test';
import { GET, POST } from './route';

const originalFetch = globalThis.fetch;

function mcpRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request('http://localhost:3000/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer bri_test.secret',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('/mcp', () => {
  test('exposes discovery and the six tools over Streamable HTTP', async () => {
    const discovery = await GET(new Request('http://localhost:3000/mcp'));
    expect(discovery.status).toBe(200);
    const discoveryText = await discovery.text();
    expect(discoveryText).toContain(
      '"authentication": "Authorization: Bearer <Bri API key>"'
    );
    expect(discoveryText).not.toContain('\\u003C');
    expect(JSON.parse(discoveryText).tools).toHaveLength(6);

    const response = await POST(
      mcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.result.tools.map(({ name }: { name: string }) => name)).toEqual([
      'list_notes',
      'read_note',
      'publish_note',
      'list_note_versions',
      'read_note_version',
      'restore_note_version',
    ]);
  });

  test('publishes with the caller API key against the configured Bri origin', async () => {
    const fetchMock = mock((_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer bri_test.secret');
      return Response.json({ data: { username: 'ege', slug: 'hello' } }, { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(
      mcpRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'publish_note',
          arguments: {
            title: 'Hello',
            content: '# Hello',
            visibility: 'private',
            expiresInDays: 7,
          },
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.structuredContent.url).toBe('http://localhost:3000/ege/hello');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/api/notes');
  });

  test('rejects missing credentials, invalid JSON, and oversized bodies', async () => {
    const unauthorized = await POST(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toBe('Bearer realm="Bri MCP"');

    const invalidJson = await POST(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer bri_test.secret',
          'Content-Type': 'application/json',
        },
        body: '{',
      })
    );
    expect(invalidJson.status).toBe(400);

    const oversized = await POST(
      mcpRequest({}, { 'Content-Length': '1500001' })
    );
    expect(oversized.status).toBe(413);

    const streamedOversized = await POST(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer bri_test.secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'x'.repeat(1_500_000) }),
      })
    );
    expect(streamedOversized.status).toBe(413);

    const sse = await GET(
      new Request('http://localhost:3000/mcp', {
        headers: { Accept: 'text/event-stream' },
      })
    );
    expect(sse.status).toBe(405);
    expect(sse.headers.get('allow')).toBe('POST');
  });
});
