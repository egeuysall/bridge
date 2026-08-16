#!/usr/bin/env bun

import process from 'node:process';
import Pastel from 'pastel';
import { renderTopHelp, VERSION, normalizeArgv } from './core/shared';

export async function main(argv = process.argv.slice(2), commandMeta: ImportMeta = import.meta): Promise<void> {
  if (argv[0] === 'mcp') {
    if (argv.some((arg) => arg === '-h' || arg === '--help' || arg === 'help')) {
      console.log('bri mcp');
      console.log('');
      console.log(
        'Start the stdio MCP server. Uses BRI_API_KEY/BRI_ENDPOINT or `bri login` config.'
      );
      console.log(
        'Tools: list_notes, read_note, publish_note, list_note_versions, read_note_version, restore_note_version.'
      );
      return;
    }

    await import('../mcp/index');
    return;
  }

  const wantsTopHelp = argv.some((arg) => arg === '-h' || arg === '--help' || arg === 'help');
  const topLevelOnlyFlags = argv.every((arg) =>
    ['--no-color', '--no-update-check', '-h', '--help', 'help'].includes(arg)
  );
  const hasCommand = argv.some((arg) =>
    [
      'publish',
      'slug',
      'doctor',
      'self-update',
      'login',
      'logout',
      'notes',
      'links',
      'notifications',
      'config',
      'mcp',
    ].includes(arg)
  );

  if (argv.length === 0 || ((wantsTopHelp || topLevelOnlyFlags) && !hasCommand)) {
    renderTopHelp(process.stdout.isTTY && !argv.includes('--no-color'));
    return;
  }

  const app = new Pastel({
    importMeta: commandMeta,
    name: 'bri',
    version: VERSION,
    description: 'bri CLI: publish markdown to bri',
  });

  await app.run(normalizeArgv(process.argv));
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
