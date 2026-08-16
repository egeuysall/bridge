import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commandsRoot = join(root, 'cli', 'commands');
const outputDir = join(root, 'build', 'cli-release');
const outputPath = join(outputDir, 'bri-standalone.ts');

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : /\.(js|ts|tsx)$/.test(entry.name) ? [path] : [];
  }).sort();
}

const files = listFiles(commandsRoot);
const imports = files.map((file, index) => {
  let path = relative(outputDir, file).replaceAll('\\', '/');
  if (!path.startsWith('.')) path = `./${path}`;
  return `import * as command${index} from '${path}';`;
}).join('\n');
const entries = files.map((file, index) => {
  const key = relative(commandsRoot, file).replaceAll('\\', '/').replace(/\.(js|ts|tsx)$/, '');
  return `  ${JSON.stringify(key)}: command${index},`;
}).join('\n');
const wrappers = files.map((file) => {
  const key = relative(commandsRoot, file).replaceAll('\\', '/').replace(/\.(js|ts|tsx)$/, '');
  const path = relative(commandsRoot, file).replaceAll('\\', '/').replace(/\.(js|ts|tsx)$/, '.js');
  return `  [${JSON.stringify(key)}, ${JSON.stringify(path)}],`;
}).join('\n');

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${imports}
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { main } from '../../cli/bri';

const commands = {
${entries}
};

const commandFiles = [
${wrappers}
];
const root = await mkdtemp(join(tmpdir(), 'bri-commands-'));
const commandsDirectory = join(root, 'commands');
(globalThis as { __bri_commands?: Record<string, unknown> }).__bri_commands = commands;

try {
  for (const [key, relativePath] of commandFiles) {
    const path = join(commandsDirectory, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, [
      'const command = globalThis.__bri_commands[' + JSON.stringify(key) + '];',
      'export const description = command.description;',
      'export const isDefault = command.isDefault;',
      'export const alias = command.alias;',
      'export const options = command.options;',
      'export const args = command.args;',
      'export default command.default;',
      '',
    ].join('\\n'));
  }
  await main(undefined, { url: pathToFileURL(join(root, 'entry.js')).href } as ImportMeta);
} finally {
  await rm(root, { recursive: true, force: true });
}
`);
console.log(outputPath);
