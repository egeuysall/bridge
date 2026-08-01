import { afterEach, describe, expect, mock, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBriMcpServer } from './server';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Bri MCP server', () => {
  test('lists, reads, and publishes through the MCP protocol', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });

      if (init?.method === 'POST') {
        return Response.json({ data: { username: 'ege', slug: 'hello' } }, { status: 201 });
      }
      if (init?.method === 'PATCH') {
        return Response.json({ data: { restored: true } });
      }
      if (url.includes('/versions?versionId=')) {
        return Response.json({
          data: { id: 'ver_1', title: 'Hello old', content: '# Old' },
        });
      }
      if (url.includes('/versions')) {
        return Response.json({
          data: [
            {
              id: 'ver_1',
              version: 1,
              title: 'Hello old',
              createdAt: 1710000000000,
              actor: 'update',
            },
          ],
        });
      }
      if (url.includes('/api/public/notes/')) {
        return Response.json({
          data: { username: 'ege', slug: 'hello', title: 'Hello', content: '# Hello' },
        });
      }
      return Response.json({ data: [{ username: 'ege', slug: 'hello', title: 'Hello' }] });
    }) as unknown as typeof fetch;

    const server = createBriMcpServer({
      apiKey: 'bri_test.secret',
      endpoint: new URL('https://bri.test/api/notes'),
      siteUrl: new URL('https://bri.test'),
    });
    const client = new Client({ name: 'bri-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toEqual([
      'list_notes',
      'read_note',
      'publish_note',
      'list_note_versions',
      'read_note_version',
      'restore_note_version',
    ]);

    const listed = await client.callTool({ name: 'list_notes', arguments: { state: 'active' } });
    expect(listed.isError).not.toBe(true);

    const read = await client.callTool({
      name: 'read_note',
      arguments: { username: 'ege', slug: 'hello' },
    });
    expect(read.structuredContent).toEqual({
      note: { username: 'ege', slug: 'hello', title: 'Hello', content: '# Hello' },
    });

    const published = await client.callTool({
      name: 'publish_note',
      arguments: {
        title: 'Hello',
        content: '# Hello',
        visibility: 'private',
        expiresInDays: 7,
      },
    });
    expect(published.structuredContent).toMatchObject({
      username: 'ege',
      slug: 'hello',
      url: 'https://bri.test/ege/hello',
    });

    const versions = await client.callTool({
      name: 'list_note_versions',
      arguments: { noteId: 'note_1' },
    });
    expect(versions.structuredContent).toEqual({
      versions: [
        {
          id: 'ver_1',
          version: 1,
          title: 'Hello old',
          createdAt: 1710000000000,
          actor: 'update',
        },
      ],
    });

    const version = await client.callTool({
      name: 'read_note_version',
      arguments: { noteId: 'note_1', versionId: 'ver_1' },
    });
    expect(version.structuredContent).toEqual({
      version: { id: 'ver_1', title: 'Hello old', content: '# Old' },
    });

    const restored = await client.callTool({
      name: 'restore_note_version',
      arguments: { noteId: 'note_1', versionId: 'ver_1' },
    });
    expect(restored.structuredContent).toEqual({ result: { restored: true } });

    expect(requests).toHaveLength(6);
    expect(new Headers(requests[2]?.init?.headers).get('authorization')).toBe(
      'Bearer bri_test.secret'
    );
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({
      title: 'Hello',
      content: '# Hello',
      visibility: 'private',
      expiresInDays: 7,
    });
    expect(requests[3]?.url).toBe('https://bri.test/api/notes/by-id/note_1/versions');
    expect(requests[4]?.url).toBe(
      'https://bri.test/api/notes/by-id/note_1/versions?versionId=ver_1'
    );
    expect(requests[5]?.url).toBe('https://bri.test/api/notes/by-id/note_1/versions');
    expect(JSON.parse(String(requests[5]?.init?.body))).toEqual({
      action: 'restore',
      versionId: 'ver_1',
    });

    await client.close();
    await server.close();
  });

  test('rejects invalid write input before calling Bri', async () => {
    const fetchMock = mock(() => Response.json({ data: {} }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const server = createBriMcpServer({
      apiKey: 'bri_test.secret',
      endpoint: new URL('https://bri.test/api/notes'),
      siteUrl: new URL('https://bri.test'),
    });
    const client = new Client({ name: 'bri-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: 'publish_note',
      arguments: { title: '', content: '', visibility: 'public', expiresInDays: 31 },
    });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });

  test('rejects invalid version IDs before calling Bri', async () => {
    const fetchMock = mock(() => Response.json({ data: {} }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const server = createBriMcpServer({
      apiKey: 'bri_test.secret',
      endpoint: new URL('https://bri.test/api/notes'),
      siteUrl: new URL('https://bri.test'),
    });
    const client = new Client({ name: 'bri-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: 'restore_note_version',
      arguments: { noteId: '../bad', versionId: 'ver_1' },
    });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });
});
