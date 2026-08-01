import { afterEach, describe, expect, mock, test } from 'bun:test';
import { runNotesHistory, runNotesRestoreVersion, runNotesVersion } from './resources';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.BRI_API_KEY;
const originalConsoleLog = console.log;

const cliCommand = { getOptionValueSource: () => 'cli' as const };
const options = { endpoint: 'https://bri.test/api/notes', json: true, color: false };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.BRI_API_KEY = originalApiKey;
  console.log = originalConsoleLog;
});

describe('note version CLI actions', () => {
  test('uses the version REST paths and restore body', async () => {
    process.env.BRI_API_KEY = 'bri_test.secret';
    console.log = mock(() => undefined) as unknown as typeof console.log;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock((input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return Response.json({ data: [] });
    }) as unknown as typeof fetch;

    await runNotesHistory('note_1', options, cliCommand);
    await runNotesVersion('note_1', 'ver_1', options, cliCommand);
    await runNotesRestoreVersion('note_1', 'ver_1', options, cliCommand);

    expect(requests.map((request) => request.url)).toEqual([
      'https://bri.test/api/notes/by-id/note_1/versions',
      'https://bri.test/api/notes/by-id/note_1/versions?versionId=ver_1',
      'https://bri.test/api/notes/by-id/note_1/versions',
    ]);
    expect(requests[2]?.init?.method).toBe('PATCH');
    expect(JSON.parse(String(requests[2]?.init?.body))).toEqual({
      action: 'restore',
      versionId: 'ver_1',
    });
  });

  test('rejects unsafe IDs before fetch', async () => {
    const fetchMock = mock(() => Response.json({ data: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(runNotesVersion('../note', 'ver_1', options, cliCommand)).rejects.toThrow(
      'note id'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
