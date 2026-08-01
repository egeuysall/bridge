#!/usr/bin/env bun

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBriMcpServer, loadBriMcpOptions } from './server';

const server = createBriMcpServer(await loadBriMcpOptions());
await server.connect(new StdioServerTransport());
