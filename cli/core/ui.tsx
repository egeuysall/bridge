import type React from 'react';
import { Box, Text, renderToString } from 'ink';
import {
  Alert,
  Badge as InkBadge,
  StatusMessage,
  ThemeProvider,
  UnorderedList,
  defaultTheme,
  extendTheme,
} from '@inkjs/ui';

const defaultSiteUrl = (process.env.BRI_SITE_URL ?? 'https://bri.fyi').replace(/\/+$/, '');

type CommandRow = {
  command: string;
  description: string;
  group: 'publish' | 'library' | 'account' | 'system';
};

type StatusRow = {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'info' | 'muted';
};

type PublishResult = {
  enableColor: boolean;
  dryRun: boolean;
  source: string;
  slug: string;
  url: string;
  elapsedMs?: number;
};

type TableColumn<T> = {
  header: string;
  width: number;
  render: (row: T) => string;
};

const logo = [
  '██████╗ ██████╗ ██╗',
  '██╔══██╗██╔══██╗██║',
  '██████╔╝██████╔╝██║',
  '██╔══██╗██╔══██╗██║',
  '██████╔╝██║  ██║██║',
  '╚═════╝ ╚═╝  ╚═╝╚═╝',
];

const logoColors = ['#e2e2e2', '#cfcfcf', '#b9b9b9', '#a4a4a4', '#8f8f8f', '#787878'];

const palette = {
  accent: '#D77757',
  accentSoft: '#e6a086',
  command: '#f0c7b7',
  dim: '#8f8f8f',
  line: '#6f625d',
  ok: '#8fbf9f',
  warn: '#d7b56d',
  error: '#d77757',
  surface: '#2b2725',
};

const briTheme = extendTheme(defaultTheme, {
  components: {
    Badge: {
      styles: {
        container: () => ({
          backgroundColor: palette.accent,
        }),
        label: () => ({
          color: '#211814',
          bold: true,
        }),
      },
    },
    Alert: {
      styles: {
        container: () => ({
          borderStyle: 'round',
          borderColor: palette.accent,
          gap: 1,
          paddingX: 1,
        }),
        icon: () => ({
          color: palette.accent,
        }),
        title: () => ({
          bold: true,
          color: palette.command,
        }),
        message: () => ({
          color: palette.command,
        }),
      },
    },
    StatusMessage: {
      styles: {
        icon: ({ variant }: { variant: 'success' | 'error' | 'warning' | 'info' }) => ({
          color:
            variant === 'success'
              ? palette.ok
              : variant === 'warning'
                ? palette.warn
                : variant === 'error'
                  ? palette.error
                  : palette.accent,
        }),
        text: () => ({
          color: palette.command,
        }),
      },
    },
    UnorderedList: {
      styles: {
        marker: () => ({
          color: palette.accent,
        }),
        content: () => ({
          flexDirection: 'row',
          flexShrink: 1,
        }),
      },
      config: () => ({
        marker: '•',
      }),
    },
  },
});

function toneColor(tone: StatusRow['tone']): string {
  if (tone === 'warn') return palette.warn;
  if (tone === 'ok') return palette.ok;
  if (tone === 'muted') return palette.dim;
  return palette.command;
}

function color(enabled: boolean, value: string): string | undefined {
  return enabled ? value : undefined;
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

function stripPadding(value: string): string {
  return value.trimEnd();
}

function print(element: React.ReactNode, columns?: number): void {
  const terminalColumns = process.stdout.columns ?? 100;
  const output = renderToString(<ThemeProvider theme={briTheme}>{element}</ThemeProvider>, {
    columns: columns ?? Math.min(100, terminalColumns),
  });
  console.log(output);
}

function printError(element: React.ReactNode): void {
  const terminalColumns = process.stderr.columns ?? process.stdout.columns ?? 100;
  const output = renderToString(<ThemeProvider theme={briTheme}>{element}</ThemeProvider>, {
    columns: Math.min(100, terminalColumns),
  });
  process.stderr.write(`${output}\n`);
}

function Logo({ enableColor }: { enableColor: boolean }) {
  return (
    <Box flexDirection="column" width={22} flexShrink={0}>
      {logo.map((line, index) => (
        <Text key={`${index}-${line}`} color={color(enableColor, logoColors[index] ?? '#8f8f8f')}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

function Badge({ children, enableColor }: { children: string; enableColor: boolean }) {
  if (enableColor) {
    return <InkBadge color={palette.accent}>{children}</InkBadge>;
  }

  return <Text bold>{children}</Text>;
}

function toneBadgeColor(tone: StatusRow['tone']): string {
  return tone === 'muted' ? palette.line : palette.accent;
}

function statusVariant(tone: StatusRow['tone']): 'success' | 'warning' | 'info' {
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  return 'info';
}

function SectionTitle({ children, enableColor }: { children: string; enableColor: boolean }) {
  return (
    <Box marginTop={1}>
      <Text bold color={color(enableColor, palette.accent)}>
        {children}
      </Text>
      <Text color={color(enableColor, palette.line)}> ─────────────────────────</Text>
    </Box>
  );
}

function CommandList({ rows, enableColor }: { rows: CommandRow[]; enableColor: boolean }) {
  const groups: Array<{ id: CommandRow['group']; title: string }> = [
    { id: 'publish', title: 'Publish' },
    { id: 'library', title: 'Library' },
    { id: 'account', title: 'Account' },
    { id: 'system', title: 'System' },
  ];

  return (
    <Box flexDirection="column">
      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.group === group.id);
        if (groupRows.length === 0) return null;

        return (
          <Box key={group.id} flexDirection="column">
            <SectionTitle enableColor={enableColor}>{group.title}</SectionTitle>
            {groupRows.map((row) => (
              <Box key={row.command}>
                <Box width={3}>
                  <Text color={color(enableColor, palette.accent)}>›</Text>
                </Box>
                <Box width={34}>
                  <Text color={color(enableColor, palette.command)}>{row.command}</Text>
                </Box>
                <Text color={color(enableColor, palette.dim)}>{row.description}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

export function renderCliHelp(enableColor: boolean, version: string): void {
  const rows: CommandRow[] = [
    {
      command: 'bri publish --path <file>',
      description: 'Publish markdown note',
      group: 'publish',
    },
    { command: 'bri publish --stdin', description: 'Publish piped markdown', group: 'publish' },
    { command: 'bri slug --path <file>', description: 'Preview generated slug', group: 'publish' },
    { command: 'bri notes list', description: 'List your notes', group: 'library' },
    { command: 'bri notes read <user> <slug>', description: 'Read note content', group: 'library' },
    { command: 'bri notes history <id>', description: 'List note versions', group: 'library' },
    {
      command: 'bri notes version <id> <version>',
      description: 'Read a note version',
      group: 'library',
    },
    {
      command: 'bri notes restore-version <id> <version>',
      description: 'Restore a note version',
      group: 'library',
    },
    {
      command: 'bri notes ask <user> <slug> --question <q>',
      description: 'Ask AI about a note',
      group: 'library',
    },
    { command: 'bri links list', description: 'List quick links', group: 'library' },
    { command: 'bri links create --key <key>', description: 'Create quick link', group: 'library' },
    { command: 'bri notifications list', description: 'Show invites and alerts', group: 'account' },
    { command: 'bri login --api-key <key>', description: 'Save API key locally', group: 'account' },
    { command: 'bri config list', description: 'Show local defaults', group: 'account' },
    { command: 'bri doctor', description: 'Check runtime and endpoint', group: 'system' },
    { command: 'bri mcp', description: 'Start stdio MCP server', group: 'system' },
    { command: 'bri self-update --check-only', description: 'Check CLI release', group: 'system' },
  ];

  print(
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={color(enableColor, palette.accent)}
        paddingX={2}
        paddingY={1}
      >
        <Box flexDirection="column" width={72}>
          <Box>
            <Logo enableColor={enableColor} />
            <Box marginLeft={3} flexDirection="column" width={43} flexShrink={0}>
              <Box>
                <Badge enableColor={enableColor}>CLI</Badge>
                <Text color={color(enableColor, palette.dim)}> v{version}</Text>
              </Box>
              <Text color={color(enableColor, palette.accentSoft)}>
                Markdown publishing and links from terminal
              </Text>
              <Text color={color(enableColor, palette.dim)}>Auth, dry runs, copy/open.</Text>
            </Box>
          </Box>
        </Box>
      </Box>
      <CommandList rows={rows} enableColor={enableColor} />
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor={color(enableColor, palette.line)}
        paddingX={1}
      >
        <Box flexDirection="column">
          <Box>
            <Text color={color(enableColor, palette.accent)}>try </Text>
            <Text color={color(enableColor, palette.command)}>
              bri publish --path ./post.md --dry-run
            </Text>
          </Box>
          <Text color={color(enableColor, palette.dim)}>help bri publish --help</Text>
          <Text color={color(enableColor, palette.dim)}>
            install curl -fsSL {defaultSiteUrl}/install.sh | bash
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export function renderPanel(input: {
  title: string;
  rows: StatusRow[];
  enableColor: boolean;
  footer?: string;
  stderr?: boolean;
}): void {
  const alertRow =
    input.rows.length === 1 && input.rows[0]?.tone === 'warn' ? input.rows[0] : undefined;
  const element = (
    <Box flexDirection="column">
      {alertRow ? (
        <Alert variant="warning" title={input.title}>
          {alertRow.value}
        </Alert>
      ) : (
        <Box
          borderStyle="round"
          borderColor={color(input.enableColor, palette.accent)}
          paddingX={1}
        >
          <Box>
            <Text color={color(input.enableColor, palette.accent)}>● </Text>
            <Text bold color={color(input.enableColor, palette.command)}>
              {input.title}
            </Text>
          </Box>
        </Box>
      )}
      {alertRow ? null : (
        <Box flexDirection="column" marginTop={1}>
          {input.rows.map((row) => (
            <Box key={row.label}>
              <Box width={16}>
                {row.label === 'status' && input.enableColor ? (
                  <InkBadge color={toneBadgeColor(row.tone)}>{row.value}</InkBadge>
                ) : (
                  <Text color={color(input.enableColor, palette.dim)}>
                    {stripPadding(row.label)}
                  </Text>
                )}
              </Box>
              <Text color={color(input.enableColor, palette.line)}>│ </Text>
              {row.label === 'status' ? (
                <StatusMessage variant={statusVariant(row.tone)}>{row.value}</StatusMessage>
              ) : (
                <Text color={color(input.enableColor, toneColor(row.tone))}>{row.value}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
      {input.footer ? (
        <Box
          marginTop={1}
          borderStyle="single"
          borderColor={color(input.enableColor, palette.line)}
          paddingX={1}
        >
          <Text color={color(input.enableColor, palette.dim)}>{input.footer}</Text>
        </Box>
      ) : null}
    </Box>
  );

  if (input.stderr) {
    printError(element);
    return;
  }

  print(element);
}

export function renderPublishResult(input: PublishResult): void {
  const variant = input.dryRun ? 'warning' : 'success';
  const title = input.dryRun ? 'Publish dry run' : 'Published';
  const elapsed = typeof input.elapsedMs === 'number' ? `${input.elapsedMs} ms` : undefined;
  const badge = input.dryRun ? 'DRY RUN' : 'LIVE';

  print(
    <Box flexDirection="column">
      <Alert variant={variant} title={title}>
        {input.dryRun ? 'Input valid. No request sent.' : 'Post is live.'}
      </Alert>
      <Box marginTop={1}>
        <InkBadge color={palette.accent}>{badge}</InkBadge>
        <Text color={color(input.enableColor, palette.dim)}> bri publish</Text>
      </Box>
      <Box marginTop={1}>
        <UnorderedList>
          <UnorderedList.Item>
            <Box width={9}>
              <Text color={color(input.enableColor, palette.dim)}>source</Text>
            </Box>
            <Text color={color(input.enableColor, palette.command)}>{input.source}</Text>
          </UnorderedList.Item>
          <UnorderedList.Item>
            <Box width={9}>
              <Text color={color(input.enableColor, palette.dim)}>slug</Text>
            </Box>
            <Text color={color(input.enableColor, palette.ok)}>{input.slug}</Text>
          </UnorderedList.Item>
          <UnorderedList.Item>
            <Box width={9}>
              <Text color={color(input.enableColor, palette.dim)}>url</Text>
            </Box>
            <Text color={color(input.enableColor, palette.accentSoft)}>{input.url}</Text>
          </UnorderedList.Item>
          {elapsed ? (
            <UnorderedList.Item>
              <Box width={9}>
                <Text color={color(input.enableColor, palette.dim)}>elapsed</Text>
              </Box>
              <Text color={color(input.enableColor, palette.command)}>{elapsed}</Text>
            </UnorderedList.Item>
          ) : null}
        </UnorderedList>
      </Box>
    </Box>
  );
}

export function renderTable<T>(input: {
  title: string;
  rows: T[];
  columns: Array<TableColumn<T>>;
  enableColor: boolean;
  empty: string;
}): void {
  const availableColumns = Math.max(60, Math.min(100, process.stdout.columns ?? 100) - 2);
  const columns = input.columns.map((column) => ({ ...column }));
  let overflow = columns.reduce((sum, column) => sum + column.width + 2, 0) - availableColumns;

  for (let index = columns.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const column = columns[index];
    if (!column) continue;
    const reduction = Math.min(overflow, Math.max(0, column.width - 12));
    column.width -= reduction;
    overflow -= reduction;
  }

  if (input.rows.length === 0) {
    renderPanel({
      title: input.title,
      enableColor: input.enableColor,
      rows: [{ label: 'status', value: input.empty, tone: 'muted' }],
    });
    return;
  }

  print(
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={color(input.enableColor, palette.accent)} paddingX={1}>
        <Text bold color={color(input.enableColor, palette.command)}>
          {input.title}
        </Text>
        <Text color={color(input.enableColor, palette.dim)}> {input.rows.length} rows</Text>
      </Box>
      <Box marginTop={1}>
        {columns.map((column) => (
          <Box key={column.header} width={column.width + 2}>
            <Text bold color={color(input.enableColor, palette.accent)}>
              {truncate(column.header, column.width)}
            </Text>
          </Box>
        ))}
      </Box>
      <Box>
        {columns.map((column) => (
          <Box key={column.header} width={column.width + 2}>
            <Text color={color(input.enableColor, palette.line)}>{'─'.repeat(column.width)}</Text>
          </Box>
        ))}
      </Box>
      {input.rows.map((row, rowIndex) => (
        <Box key={rowIndex}>
          {columns.map((column) => (
            <Box key={column.header} width={column.width + 2}>
              <Text
                color={color(
                  input.enableColor,
                  rowIndex % 2 === 0 ? palette.command : palette.accentSoft
                )}
              >
                {truncate(column.render(row), column.width)}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
