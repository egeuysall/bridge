import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createBriMcpServer } from '../../../mcp/server';
import { readBridgeApiKeyFromRequest } from '@/lib/request-security';
import { DEFAULT_PUBLIC_SITE_URL } from '@/lib/site-url';

const MAX_BODY_BYTES = 1_500_000;
const TOOL_NAMES = [
  'list_notes',
  'read_note',
  'publish_note',
  'list_note_versions',
  'read_note_version',
  'restore_note_version',
] as const;

function jsonRpcError(status: number, code: number, message: string, headers?: HeadersInit) {
  return Response.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } }
  );
}

async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();

    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

export function GET(request: Request) {
  if (request.headers.get('accept')?.includes('text/event-stream')) {
    return jsonRpcError(405, -32000, 'SSE is not available in stateless JSON mode', {
      Allow: 'POST',
    });
  }

  return Response.json(
    {
      name: 'bri',
      transport: 'MCP Streamable HTTP (stateless JSON responses)',
      endpoint: '/mcp',
      methods: ['POST'],
      authentication: 'Authorization: Bearer <Bri API key>',
      tools: TOOL_NAMES,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const apiKey = readBridgeApiKeyFromRequest(request);
  if (!apiKey) {
    return jsonRpcError(401, -32001, 'Not authenticated', {
      'WWW-Authenticate': 'Bearer realm="Bri MCP"',
    });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonRpcError(413, -32000, 'Request body too large');
  }

  let rawBody: string;
  try {
    const body = await readBody(request);
    if (body === null) return jsonRpcError(413, -32000, 'Request body too large');
    rawBody = body;
  } catch {
    return jsonRpcError(400, -32700, 'Parse error: Invalid JSON');
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonRpcError(400, -32700, 'Parse error: Invalid JSON');
  }

  const siteUrl = new URL(
    process.env.NODE_ENV === 'production' ? DEFAULT_PUBLIC_SITE_URL : 'http://localhost:3000'
  );

  const server = createBriMcpServer({
    apiKey,
    endpoint: new URL('/api/notes', siteUrl),
    siteUrl,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return jsonRpcError(500, -32603, 'Internal MCP error');
  } finally {
    await server.close();
  }
}
