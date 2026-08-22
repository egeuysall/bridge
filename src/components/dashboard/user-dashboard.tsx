'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { toast } from 'sonner';
import { AppSidebar, type DashboardPanel } from '@/components/app-sidebar';
import { BriTiptapEditor } from '@/components/dashboard/tiptap-note-editor';
import { CodeBlock } from '@/components/markdown/code-block';
import { MathBlock } from '@/components/markdown/math-block';
import { markdownUrlTransform } from '@/components/markdown/url-transform';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { formatQuickLinkTitle } from '@/lib/quick-link-display';
import { getInstallCommand } from '@/lib/site-url';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';

type NoteRecord = {
  id: string;
  username: string;
  slug: string;
  title: string;
  content: string;
  visibility: 'public' | 'private';
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  deletedAt: number | null;
  purgeAt: number | null;
};

type ApiKeyRecord = {
  id: string;
  prefix: string;
  permissions: 'read' | 'write' | 'read_write';
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

type QuickLinkRecord = {
  id: string;
  username: string;
  key: string;
  targetUrl: string;
  label: string | null;
  clicks: number;
  createdAt: number;
  updatedAt: number;
  lastClickedAt: number | null;
};

type PinnedRecord = {
  id: string;
  kind: 'note' | 'link';
  noteId: string | null;
  linkId: string | null;
  title: string;
  href: string;
  createdAt: number;
};

type AnalyticsRecord = {
  totalViews: number;
  totalPageViews?: number;
  totalLinkClicks?: number;
  days: number;
  viewsBySlug: Record<string, number>;
  topPages: Array<{ slug: string; views: number }>;
  daily: Array<{ date: string; views: number; pageViews?: number; linkClicks?: number }>;
};

type NotificationRecord = {
  id: string;
  kind: 'invitation' | 'achievement' | 'notice';
  title: string;
  message: string;
  noteId: string | null;
  linkId: string | null;
  createdAt: number;
};

type InviteSummaryRecord = {
  id: string;
  invitedCount: number;
  invitees: string[];
};

type SortMode = 'newest' | 'mostViewed' | 'recentlyUpdated';

function formatDate(value: number | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatExpiresIn(value: number | null): string {
  if (!value) return 'no expiry';

  const diffMs = value - Date.now();
  if (diffMs <= 0) return 'expired';

  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `in ${diffHours}h`;

  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return `in ${diffDays}d`;
}

function excerpt(input: string, maxLength = 200): string {
  const plain = input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim();
}

function stripLeadingHeading(content: string, title: string): string {
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  if (!firstLine.startsWith('# ')) return content;

  const headingText = firstLine.replace(/^#\s+/, '');
  if (normalizeHeading(headingText) !== normalizeHeading(title)) return content;

  return lines.slice(1).join('\n').trimStart();
}

function DashboardMarkdownPreview({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: 'warn', throwOnError: false, trust: false, output: 'mathml' }]]}
      urlTransform={markdownUrlTransform}
      components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children, ...props }) => {
          const normalizedContent = String(children);
          const isBlock = className?.includes('language-') || normalizedContent.includes('\n');
          if (!isBlock) {
            return (
              <code
                {...props}
                className="rounded border border-neutral-800 bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[0.9em] font-normal text-neutral-200"
              >
                {children}
              </code>
            );
          }
          const language = className?.replace(/^language-/, '') || 'text';
          const normalizedLanguage = language.toLowerCase();

          if (
            normalizedLanguage === 'math' ||
            normalizedLanguage === 'tex' ||
            normalizedLanguage === 'latex'
          ) {
            return <MathBlock>{normalizedContent}</MathBlock>;
          }

          return <CodeBlock language={language}>{normalizedContent.replace(/\n$/, '')}</CodeBlock>;
        },
        input: ({ type, checked }) =>
          type === 'checkbox' ? (
            <input
              type="checkbox"
              checked={Boolean(checked)}
              readOnly
              className="mr-2 align-middle"
            />
          ) : (
            <input type={type} readOnly />
          ),
        img: ({ alt, src }) =>
          typeof src === 'string' && (src.startsWith('http') || src.startsWith('data:image/')) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt ?? 'note image'}
              className="my-3 max-h-[28rem] max-w-full rounded-md border border-neutral-800 object-contain"
            />
          ) : null,
        table: ({ children }) => (
          <div className="not-prose bri-markdown-table max-w-full overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th>{children}</th>,
        td: ({ children }) => <td>{children}</td>,
      }}
    >
      {normalizeMarkdownTables(content)}
    </ReactMarkdown>
  );
}

function comboboxInputClass(widthClass = 'w-56') {
  return `${widthClass} h-8 border-neutral-800 bg-transparent text-xs`;
}

const dashboardActionButtonClass =
  '!border-[var(--line)] bg-[var(--bg)] !text-[var(--fg)] hover:!border-[var(--fg)] hover:bg-[var(--background)] hover:!text-[var(--fg)]';

const chartConfig = {
  pageViews: {
    label: 'Pages',
    color: 'var(--fg)',
  },
  linkClicks: {
    label: 'Links',
    color: 'var(--fg)',
  },
} satisfies ChartConfig;

function formatChartDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function expirationValueFromExpiresAt<T extends string>(
  expiresAt: number | null,
  options: ReadonlyArray<{ value: T; days: number }>
): T {
  const fallback = options[options.length - 1]?.value ?? options[0]?.value;
  if (!fallback) {
    throw new Error('Missing expiration options');
  }
  if (!expiresAt) return fallback;
  const remainingDays = (expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(remainingDays) || remainingDays <= 0) return fallback;

  let selected = options[options.length - 1] ?? options[0];
  let smallestDiff = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const diff = Math.abs(option.days - remainingDays);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      selected = option;
    }
  }
  return selected?.value ?? fallback;
}

function MobileSidebarTrigger() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={toggleSidebar}
      className="h-8 w-8 justify-start px-1 text-xs tracking-wide"
    >
      ///
    </Button>
  );
}

export function UserDashboard({ apiKeySession = false }: { apiKeySession?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const initialPanel: DashboardPanel =
    tabFromQuery === 'notes' ||
    tabFromQuery === 'new' ||
    tabFromQuery === 'links' ||
    tabFromQuery === 'profile' ||
    tabFromQuery === 'settings' ||
    tabFromQuery === 'deleted'
      ? tabFromQuery
      : 'notes';

  const DESKTOP_PAGE_SIZE = 16;
  const MOBILE_PAGE_SIZE = 8;
  const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
  const visibilityOptions = [
    { value: 'public', label: 'public' },
    { value: 'private', label: 'private' },
  ] as const;
  const expirationOptions = [
    { value: '1h', label: '1 hour', days: 1 / 24 },
    { value: '6h', label: '6 hours', days: 6 / 24 },
    { value: '1d', label: '1 day', days: 1 },
    { value: '7d', label: '7 days', days: 7 },
    { value: '30d', label: '30 days', days: 30 },
  ] as const;
  const permissionOptions = [
    { value: 'read', label: 'read' },
    { value: 'write', label: 'write' },
    { value: 'read_write', label: 'read + write' },
  ] as const;

  const [panel, setPanel] = useState<DashboardPanel>(initialPanel);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<NoteRecord[]>([]);
  const [notesPage, setNotesPage] = useState<number>(1);
  const [linksPage, setLinksPage] = useState<number>(1);
  const [deletedPage, setDeletedPage] = useState<number>(1);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLinkRecord[]>([]);
  const [pins, setPins] = useState<PinnedRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [noteInviteSummaryById, setNoteInviteSummaryById] = useState<
    Record<string, InviteSummaryRecord>
  >({});
  const [linkInviteSummaryById, setLinkInviteSummaryById] = useState<
    Record<string, InviteSummaryRecord>
  >({});
  const [generatedApiKey, setGeneratedApiKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  const [notesFilter, setNotesFilter] = useState<
    'all' | 'public' | 'private' | 'expiringSoon' | 'mostViewed'
  >('all');
  const [linksFilter, setLinksFilter] = useState<'all' | 'mostViewed'>('all');
  const [deletedFilter, setDeletedFilter] = useState<'all' | 'expiringSoon' | 'mostViewed'>('all');
  const [notesSort, setNotesSort] = useState<SortMode>('newest');
  const [linksSort, setLinksSort] = useState<SortMode>('newest');
  const [deletedSort, setDeletedSort] = useState<SortMode>('newest');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedDeletedId, setSelectedDeletedId] = useState<string | null>(null);

  const [noteTitle, setNoteTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [expirationValue, setExpirationValue] =
    useState<(typeof expirationOptions)[number]['value']>('30d');

  const [keyLabel, setKeyLabel] = useState<string>('cli');
  const [keyPermissions, setKeyPermissions] = useState<'read' | 'write' | 'read_write'>('read');

  const [quickLinkKey, setQuickLinkKey] = useState<string>('');
  const [quickLinkUrl, setQuickLinkUrl] = useState<string>('');
  const [quickLinkLabel, setQuickLinkLabel] = useState<string>('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState<string>('');
  const [editingNoteContent, setEditingNoteContent] = useState<string>('');
  const [editingNoteVisibility, setEditingNoteVisibility] = useState<'public' | 'private'>(
    'public'
  );
  const [editingNoteExpirationValue, setEditingNoteExpirationValue] =
    useState<(typeof expirationOptions)[number]['value']>('30d');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLinkKey, setEditingLinkKey] = useState<string>('');
  const [editingLinkUrl, setEditingLinkUrl] = useState<string>('');
  const [editingLinkLabel, setEditingLinkLabel] = useState<string>('');
  const [inviteDialogOpen, setInviteDialogOpen] = useState<boolean>(false);
  const [inviteTargetKind, setInviteTargetKind] = useState<'note' | 'link' | null>(null);
  const [inviteTargetId, setInviteTargetId] = useState<string | null>(null);
  const [inviteeUsername, setInviteeUsername] = useState<string>('');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState<boolean>(false);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState<boolean>(false);
  const [dismissedAchievementIds, setDismissedAchievementIds] = useState<string[]>([]);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>([]);
  const dashboardPageSize = isDesktop ? DESKTOP_PAGE_SIZE : MOBILE_PAGE_SIZE;

  const cliInstallCommand = useMemo(() => {
    return getInstallCommand();
  }, []);
  const profileHandle = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments[0] ?? '';
  }, [pathname]);
  const publicProfileUrl = useMemo(() => {
    if (!profileHandle) return '';
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/${profileHandle}?public=1`;
    }
    return `/${profileHandle}?public=1`;
  }, [profileHandle]);

  const viewsBySlug = useMemo<Record<string, number>>(() => {
    if (!analytics) return {};
    if (analytics.viewsBySlug) return analytics.viewsBySlug;
    return analytics.topPages.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.slug] = row.views;
      return accumulator;
    }, {});
  }, [analytics]);
  const pinnedNoteIds = useMemo(
    () =>
      new Set(
        pins
          .filter((pin) => pin.kind === 'note' && typeof pin.noteId === 'string')
          .map((pin) => pin.noteId as string)
      ),
    [pins]
  );
  const pinnedLinkIds = useMemo(
    () =>
      new Set(
        pins
          .filter((pin) => pin.kind === 'link' && typeof pin.linkId === 'string')
          .map((pin) => pin.linkId as string)
      ),
    [pins]
  );
  const noteViewsById = useMemo(() => {
    const allNotes = [...notes, ...deletedNotes];
    return allNotes.reduce<Record<string, number>>((accumulator, note) => {
      accumulator[note.id] = viewsBySlug[note.slug] ?? 0;
      return accumulator;
    }, {});
  }, [deletedNotes, notes, viewsBySlug]);
  const linkClicksById = useMemo(
    () =>
      quickLinks.reduce<Record<string, number>>((accumulator, link) => {
        accumulator[link.id] = link.clicks;
        return accumulator;
      }, {}),
    [quickLinks]
  );
  const pinnedSidebarItems = useMemo(
    () =>
      pins.map((pin) => ({
        id: pin.id,
        title: pin.title,
        href: pin.href,
        count:
          pin.kind === 'note'
            ? pin.noteId
              ? (noteViewsById[pin.noteId] ?? 0)
              : 0
            : pin.linkId
              ? (linkClicksById[pin.linkId] ?? 0)
              : 0,
      })),
    [linkClicksById, noteViewsById, pins]
  );
  const chartData = useMemo(() => {
    const source = analytics?.daily ?? [];
    return source.slice(-14).map((row) => ({
      date: row.date,
      pageViews: row.pageViews ?? row.views ?? 0,
      linkClicks: row.linkClicks ?? 0,
    }));
  }, [analytics]);
  const invitationNotifications = useMemo(
    () => notifications.filter((row) => row.kind === 'invitation').slice(0, 12),
    [notifications]
  );
  const achievementItems = useMemo(() => {
    const items: Array<{ id: string; message: string }> = [];
    const seen = new Set<string>();
    const add = (id: string, message: string) => {
      if (!message || seen.has(id)) return;
      seen.add(id);
      items.push({ id, message });
    };

    for (const row of notifications) {
      if (row.kind === 'achievement') add(row.id, row.message || row.title);
    }

    const totalViews = analytics?.totalViews ?? 0;
    const topDailyViews = (analytics?.daily ?? []).reduce(
      (max, row) => Math.max(max, row.views ?? 0),
      0
    );

    if (notes.length >= 1) add('local:achievement:first-note', 'first note published');
    if (quickLinks.length >= 1) add('local:achievement:first-link', 'first quick link created');
    if (notes.length >= 10) add('local:achievement:ten-notes', '10 notes published');
    if (topDailyViews >= 500) add('local:achievement:500-daily', '500 views in 1 day');
    if (totalViews >= 500) add('local:achievement:500-total', '500 views milestone');
    if (totalViews >= 1000) add('local:achievement:1000-total', '1k views milestone');

    return items.filter((row) => !dismissedAchievementIds.includes(row.id));
  }, [
    analytics?.daily,
    analytics?.totalViews,
    dismissedAchievementIds,
    notes.length,
    notifications,
    quickLinks.length,
  ]);
  const noticeItems = useMemo(() => {
    const items: Array<{ id: string; message: string }> = [];
    const seen = new Set<string>();
    const add = (id: string, message: string) => {
      if (!message || seen.has(id)) return;
      seen.add(id);
      items.push({ id, message });
    };

    for (const row of notifications) {
      if (row.kind === 'notice') add(row.id, row.message || row.title);
    }

    const now = Date.now();
    const soonThreshold = now + 3 * 24 * 60 * 60 * 1000;
    for (const note of notes) {
      if (note.expiresAt !== null && note.expiresAt <= soonThreshold) {
        add(
          `local:notice:expiry:${note.id}`,
          `note "${note.title}" expires ${formatExpiresIn(note.expiresAt)}`
        );
      }
    }

    return items.filter((row) => !dismissedNoticeIds.includes(row.id));
  }, [dismissedNoticeIds, notes, notifications]);

  const filteredSortedNotes = useMemo(() => {
    const now = Date.now();
    let rows = [...notes];
    if (notesFilter === 'public') rows = rows.filter((note) => note.visibility === 'public');
    if (notesFilter === 'private') rows = rows.filter((note) => note.visibility === 'private');
    if (notesFilter === 'expiringSoon') {
      rows = rows.filter(
        (note) =>
          note.expiresAt !== null &&
          note.expiresAt > now &&
          note.expiresAt <= now + EXPIRING_SOON_MS
      );
    }
    if (notesFilter === 'mostViewed')
      rows = rows.filter((note) => (viewsBySlug[note.slug] ?? 0) > 0);

    rows.sort((a, b) => {
      if (notesSort === 'mostViewed')
        return (viewsBySlug[b.slug] ?? 0) - (viewsBySlug[a.slug] ?? 0);
      if (notesSort === 'recentlyUpdated') return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });
    return rows;
  }, [EXPIRING_SOON_MS, notes, notesFilter, notesSort, viewsBySlug]);

  const filteredSortedLinks = useMemo(() => {
    let rows = [...quickLinks];
    if (linksFilter === 'mostViewed') rows = rows.filter((link) => link.clicks > 0);
    rows.sort((a, b) => {
      if (linksSort === 'mostViewed') return b.clicks - a.clicks;
      if (linksSort === 'recentlyUpdated') return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });
    return rows;
  }, [linksFilter, linksSort, quickLinks]);

  const filteredSortedDeletedNotes = useMemo(() => {
    const now = Date.now();
    let rows = [...deletedNotes];
    if (deletedFilter === 'expiringSoon') {
      rows = rows.filter(
        (note) =>
          note.purgeAt !== null && note.purgeAt > now && note.purgeAt <= now + EXPIRING_SOON_MS
      );
    }
    if (deletedFilter === 'mostViewed')
      rows = rows.filter((note) => (noteViewsById[note.id] ?? 0) > 0);

    rows.sort((a, b) => {
      if (deletedSort === 'mostViewed')
        return (noteViewsById[b.id] ?? 0) - (noteViewsById[a.id] ?? 0);
      if (deletedSort === 'recentlyUpdated') return b.updatedAt - a.updatedAt;
      return (b.deletedAt ?? b.updatedAt ?? 0) - (a.deletedAt ?? a.updatedAt ?? 0);
    });
    return rows;
  }, [EXPIRING_SOON_MS, deletedFilter, deletedNotes, deletedSort, noteViewsById]);

  const notePages = Math.max(1, Math.ceil(filteredSortedNotes.length / dashboardPageSize));
  const linksPages = Math.max(1, Math.ceil(filteredSortedLinks.length / dashboardPageSize));
  const deletedPages = Math.max(
    1,
    Math.ceil(filteredSortedDeletedNotes.length / dashboardPageSize)
  );
  const visibleNotes = useMemo(
    () =>
      filteredSortedNotes.slice((notesPage - 1) * dashboardPageSize, notesPage * dashboardPageSize),
    [dashboardPageSize, filteredSortedNotes, notesPage]
  );
  const visibleDeletedNotes = useMemo(
    () =>
      filteredSortedDeletedNotes.slice(
        (deletedPage - 1) * dashboardPageSize,
        deletedPage * dashboardPageSize
      ),
    [dashboardPageSize, deletedPage, filteredSortedDeletedNotes]
  );
  const visibleQuickLinks = useMemo(
    () =>
      filteredSortedLinks.slice((linksPage - 1) * dashboardPageSize, linksPage * dashboardPageSize),
    [dashboardPageSize, filteredSortedLinks, linksPage]
  );
  const selectedNote = useMemo(
    () => visibleNotes.find((note) => note.id === selectedNoteId) ?? visibleNotes[0] ?? null,
    [selectedNoteId, visibleNotes]
  );
  const selectedLink = useMemo(
    () =>
      visibleQuickLinks.find((link) => link.id === selectedLinkId) ?? visibleQuickLinks[0] ?? null,
    [selectedLinkId, visibleQuickLinks]
  );
  const selectedDeletedNote = useMemo(
    () =>
      visibleDeletedNotes.find((note) => note.id === selectedDeletedId) ??
      visibleDeletedNotes[0] ??
      null,
    [selectedDeletedId, visibleDeletedNotes]
  );

  async function fetchNotes(state: 'active' | 'deleted') {
    const response = await fetch(`/api/notes?state=${state}`);
    if (!response.ok) {
      throw new Error('Failed to fetch notes');
    }

    const json = (await response.json()) as { data?: NoteRecord[] };
    return json.data ?? [];
  }

  async function refreshData() {
    setLoading(true);
    try {
      const [active, deleted] = await Promise.all([fetchNotes('active'), fetchNotes('deleted')]);
      setNotes(active);
      setDeletedNotes(deleted);
      setNotesPage(1);
      setDeletedPage(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  async function refreshApiKeys(options?: { clearGenerated?: boolean }) {
    if (options?.clearGenerated !== false) {
      setGeneratedApiKey('');
    }

    const response = await fetch('/api/keys');
    if (!response.ok) throw new Error('Failed to fetch api keys');
    const json = (await response.json()) as { data?: ApiKeyRecord[] };
    setApiKeys((json.data ?? []).filter((item) => item.revokedAt === null));
  }

  async function refreshQuickLinks() {
    const response = await fetch('/api/quick-links');
    if (!response.ok) throw new Error('Failed to fetch quick links');
    const json = (await response.json()) as { data?: QuickLinkRecord[] };
    setQuickLinks(json.data ?? []);
    setLinksPage(1);
  }

  async function refreshPins() {
    const response = await fetch('/api/pins');
    if (!response.ok) throw new Error('Failed to fetch pins');
    const json = (await response.json()) as { data?: PinnedRecord[] };
    setPins(json.data ?? []);
  }

  async function refreshAnalytics() {
    const response = await fetch('/api/analytics?days=30');
    if (response.status === 403) {
      setAnalytics(null);
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch analytics');
    const json = (await response.json()) as { data?: AnalyticsRecord };
    setAnalytics(json.data ?? null);
  }

  async function refreshNotifications() {
    const response = await fetch('/api/notifications');
    if (response.status === 401) {
      setNotifications([]);
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch notifications');
    const json = (await response.json()) as { data?: { items?: NotificationRecord[] } };
    setNotifications(json.data?.items ?? []);
  }

  async function refreshInviteSummaries() {
    const response = await fetch('/api/invitations/summary');
    if (response.status === 401) {
      setNoteInviteSummaryById({});
      setLinkInviteSummaryById({});
      return;
    }
    if (!response.ok) {
      setNoteInviteSummaryById({});
      setLinkInviteSummaryById({});
      return;
    }

    const json = (await response.json()) as {
      data?: { notes?: InviteSummaryRecord[]; links?: InviteSummaryRecord[] };
    };
    const notesMap: Record<string, InviteSummaryRecord> = {};
    const linksMap: Record<string, InviteSummaryRecord> = {};

    for (const row of json.data?.notes ?? []) notesMap[row.id] = row;
    for (const row of json.data?.links ?? []) linksMap[row.id] = row;

    setNoteInviteSummaryById(notesMap);
    setLinkInviteSummaryById(linksMap);
  }

  async function syncProfile() {
    await fetch('/api/profile/sync', { method: 'POST' });
  }

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab === panel) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', panel);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [panel, pathname, router, searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        await Promise.all([
          syncProfile().catch(() => undefined),
          refreshData(),
          refreshQuickLinks(),
          refreshPins().catch(() => undefined),
          refreshAnalytics().catch(() => undefined),
          refreshNotifications().catch(() => undefined),
          refreshInviteSummaries().catch(() => undefined),
        ]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to initialize dashboard');
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    }

    void bootstrap();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (panel === 'settings') {
      void Promise.all([
        refreshApiKeys().catch(() => undefined),
        refreshQuickLinks(),
        refreshAnalytics().catch(() => undefined),
        refreshNotifications(),
        refreshInviteSummaries(),
      ]).catch(() => {
        toast.error('Failed to load settings data');
      });
      return;
    }

    if (panel === 'notes') {
      void Promise.all([refreshAnalytics().catch(() => undefined), refreshInviteSummaries()]).catch(() => {
        toast.error('Failed to load note views');
      });
      return;
    }

    if (panel === 'links') {
      void Promise.all([
        refreshQuickLinks(),
        refreshPins().catch(() => undefined),
        refreshInviteSummaries(),
      ]).catch(() => {
        toast.error('Failed to load links');
      });
      return;
    }

    if (panel === 'deleted') {
      void refreshInviteSummaries().catch(() => {
        toast.error('Failed to load deletion metadata');
      });
    }
  }, [panel]);

  useEffect(() => {
    if (isInitializing || !loading) {
      toast.dismiss('dashboard-refreshing');
      return;
    }

    toast.loading('Refreshing dashboard', {
      id: 'dashboard-refreshing',
      duration: Infinity,
    });

    return () => {
      toast.dismiss('dashboard-refreshing');
    };
  }, [isInitializing, loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener('change', apply);
    return () => mediaQuery.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setNotesPage(1);
  }, [notesFilter, notesSort]);

  useEffect(() => {
    setLinksPage(1);
  }, [linksFilter, linksSort]);

  useEffect(() => {
    setDeletedPage(1);
  }, [deletedFilter, deletedSort]);

  useEffect(() => {
    setNotesPage((prev) => Math.min(Math.max(1, prev), notePages));
  }, [notePages]);

  useEffect(() => {
    setLinksPage((prev) => Math.min(Math.max(1, prev), linksPages));
  }, [linksPages]);

  useEffect(() => {
    setDeletedPage((prev) => Math.min(Math.max(1, prev), deletedPages));
  }, [deletedPages]);

  useEffect(() => {
    if (!visibleNotes.length) {
      setSelectedNoteId(null);
      return;
    }
    if (!selectedNoteId || !visibleNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(visibleNotes[0]?.id ?? null);
    }
  }, [selectedNoteId, visibleNotes]);

  useEffect(() => {
    if (!visibleQuickLinks.length) {
      setSelectedLinkId(null);
      return;
    }
    if (!selectedLinkId || !visibleQuickLinks.some((link) => link.id === selectedLinkId)) {
      setSelectedLinkId(visibleQuickLinks[0]?.id ?? null);
    }
  }, [selectedLinkId, visibleQuickLinks]);

  useEffect(() => {
    if (!visibleDeletedNotes.length) {
      setSelectedDeletedId(null);
      return;
    }
    if (!selectedDeletedId || !visibleDeletedNotes.some((note) => note.id === selectedDeletedId)) {
      setSelectedDeletedId(visibleDeletedNotes[0]?.id ?? null);
    }
  }, [selectedDeletedId, visibleDeletedNotes]);

  async function createNote() {
    const title = noteTitle.trim();
    if (!title) {
      toast.error('Title is required');
      return;
    }

    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content: normalizeMarkdownTables(content),
        visibility,
        expiresInDays:
          expirationOptions.find((option) => option.value === expirationValue)?.days ?? 30,
      }),
    });

    const json = (await response.json()) as {
      error?: string;
      data?: { username: string; slug: string };
    };

    if (!response.ok) {
      throw new Error(json.error || 'Failed to create note');
    }

    setPanel('notes');
    setNoteTitle('');
    setContent('');
    setExpirationValue('30d');
    await refreshData();
    await refreshPins();
    toast.success('Note published');
    if (json.data?.username && json.data.slug) {
      router.push(`/${json.data.username}/${json.data.slug}`);
    }
  }

  function startEditNote(note: NoteRecord) {
    setEditingNoteId(note.id);
    setEditingNoteTitle(note.title);
    setEditingNoteContent(note.content ?? '');
    setEditingNoteVisibility(note.visibility);
    setEditingNoteExpirationValue(expirationValueFromExpiresAt(note.expiresAt, expirationOptions));
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setEditingNoteTitle('');
    setEditingNoteContent('');
    setEditingNoteVisibility('public');
    setEditingNoteExpirationValue('30d');
  }

  async function saveNoteEdits(noteId: string) {
    const title = editingNoteTitle.trim();
    const nextContent = editingNoteContent.trim();

    if (!title) {
      toast.error('Title is required');
      return;
    }
    if (!nextContent) {
      toast.error('Content cannot be empty');
      return;
    }

    const response = await fetch(`/api/notes/by-id/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        title,
        content: normalizeMarkdownTables(editingNoteContent),
        visibility: editingNoteVisibility,
        expiresInDays:
          expirationOptions.find((option) => option.value === editingNoteExpirationValue)?.days ??
          30,
      }),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to update note');
    }

    cancelEditNote();
    await refreshData();
    await refreshPins();
    await refreshAnalytics().catch(() => undefined);
    toast.success('Note updated');
  }

  async function patchNote(noteId: string, action: 'softDelete' | 'restore' | 'permanentDelete') {
    const response = await fetch(`/api/notes/by-id/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to update note');
    }

    await refreshData();
    await refreshPins();
  }

  async function generateApiKey() {
    setGeneratedApiKey('');

    const response = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: keyPermissions,
        label: keyLabel.trim() || 'cli',
      }),
    });

    const json = (await response.json()) as { error?: string; data?: { key?: string } };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to generate api key');
    }

    setGeneratedApiKey(json.data?.key || '');
    setKeyLabel('cli');
    await refreshApiKeys({ clearGenerated: false });
    toast.success('API key generated');
  }

  async function revokeKey(keyId: string) {
    const response = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(json.error || 'Failed to revoke key');
    await refreshApiKeys();
    toast.success('API key revoked');
  }

  async function createQuickLinkHandler() {
    const key = quickLinkKey.trim();
    const targetUrl = quickLinkUrl.trim();
    if (!key) {
      toast.error('Quick link key is required');
      return;
    }
    if (!targetUrl) {
      toast.error('Target URL is required');
      return;
    }

    const response = await fetch('/api/quick-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        targetUrl,
        label: quickLinkLabel.trim() || null,
      }),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to create quick link');
    }

    setQuickLinkKey('');
    setQuickLinkUrl('');
    setQuickLinkLabel('');
    await refreshQuickLinks();
    await refreshPins();
    toast.success('Quick link created');
  }

  function startEditQuickLink(link: QuickLinkRecord) {
    setEditingLinkId(link.id);
    setEditingLinkKey(link.key);
    setEditingLinkUrl(link.targetUrl);
    setEditingLinkLabel(link.label ?? '');
  }

  function cancelEditQuickLink() {
    setEditingLinkId(null);
    setEditingLinkKey('');
    setEditingLinkUrl('');
    setEditingLinkLabel('');
  }

  async function saveQuickLinkEdits(linkId: string) {
    const key = editingLinkKey.trim();
    const targetUrl = editingLinkUrl.trim();
    const label = editingLinkLabel.trim() || null;

    if (!key) {
      toast.error('Quick link key is required');
      return;
    }
    if (!targetUrl) {
      toast.error('Target URL is required');
      return;
    }

    const response = await fetch(`/api/quick-links/${linkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        targetUrl,
        label,
      }),
    });

    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to update quick link');
    }

    cancelEditQuickLink();
    await refreshQuickLinks();
    await refreshPins();
    await refreshAnalytics().catch(() => undefined);
    toast.success('Quick link updated');
  }

  async function removeQuickLinkHandler(linkId: string) {
    const response = await fetch(`/api/quick-links/${linkId}`, { method: 'DELETE' });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to remove quick link');
    }
    await refreshQuickLinks();
    await refreshPins();
    toast.success('Quick link removed');
  }

  async function togglePin(kind: 'note' | 'link', id: string) {
    const response = await fetch('/api/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: kind, id }),
    });
    const json = (await response.json()) as { error?: string; data?: { pinned?: boolean } };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to update pin');
    }
    await refreshPins();
    toast.success(json.data?.pinned ? 'Pinned' : 'Unpinned');
  }

  function openInviteDialog(kind: 'note' | 'link', id: string) {
    setInviteTargetKind(kind);
    setInviteTargetId(id);
    setInviteeUsername('');
    setInviteDialogOpen(true);
  }

  async function submitInvite() {
    if (!inviteTargetKind || !inviteTargetId) return;
    const normalizedInvitee = inviteeUsername
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    if (!normalizedInvitee) {
      toast.error('Invitee username is required');
      return;
    }
    setIsSubmittingInvite(true);
    const response = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: inviteTargetKind,
        id: inviteTargetId,
        inviteeUsername: normalizedInvitee,
      }),
    });
    const json = (await response.json()) as { error?: string };
    setIsSubmittingInvite(false);
    if (!response.ok) {
      throw new Error(json.error || 'Failed to invite user');
    }

    setInviteDialogOpen(false);
    setInviteTargetKind(null);
    setInviteTargetId(null);
    setInviteeUsername('');
    await refreshInviteSummaries().catch(() => undefined);
    toast.success(`Invited @${normalizedInvitee}`);
  }

  async function dismissNotification(notificationId: string) {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', notificationId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to dismiss notification');
    }

    setNotifications((prev) => prev.filter((row) => row.id !== notificationId));
  }

  async function openNotification(notificationId: string) {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open', notificationId }),
    });
    const json = (await response.json()) as { error?: string; data?: { href?: string | null } };
    if (!response.ok) {
      throw new Error(json.error || 'Failed to open notification');
    }

    const href = json.data?.href ?? null;
    if (!href) {
      toast.error('Shared item is unavailable');
      return;
    }

    setNotificationsPanelOpen(false);
    router.push(href);
  }

  function dismissAchievement(id: string) {
    setDismissedAchievementIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function dismissNotice(id: string) {
    setDismissedNoticeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar panel={panel} pinnedItems={pinnedSidebarItems} onPanelChange={setPanel} />
      <SidebarInset className="min-h-screen bg-bg">
        <header className="flex h-14 items-center gap-2 border-b border-neutral-800 px-4 md:hidden">
          <MobileSidebarTrigger />
        </header>
        <section className="w-full px-4 py-5 md:px-8 xl:pr-24 2xl:pr-28">
          <div className="mx-auto w-full max-w-none space-y-5">
            {isInitializing ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24 rounded-sm bg-neutral-900" />
                <div className="space-y-2 rounded-sm bg-neutral-900/60 px-4 py-3">
                  <Skeleton className="h-4 w-40 rounded-sm bg-neutral-900" />
                  <Skeleton className="h-3 w-72 rounded-sm bg-neutral-900" />
                </div>
                <div className="space-y-2 rounded-sm bg-neutral-900/60 px-4 py-3">
                  <Skeleton className="h-4 w-32 rounded-sm bg-neutral-900" />
                  <Skeleton className="h-3 w-64 rounded-sm bg-neutral-900" />
                </div>
                <div className="space-y-2 rounded-sm bg-neutral-900/60 px-4 py-3">
                  <Skeleton className="h-4 w-36 rounded-sm bg-neutral-900" />
                  <Skeleton className="h-3 w-80 rounded-sm bg-neutral-900" />
                </div>
              </div>
            ) : null}
            {!isInitializing && panel === 'notes' ? (
              <div className="w-full space-y-3">
                <div className="max-w-[calc(100%-5rem)] space-y-2 xl:max-w-[calc(100%-7rem)]">
                  <h1 className="text-sm text-neutral-200">Your notes</h1>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['all', 'All'],
                        ['public', 'Public'],
                        ['private', 'Private'],
                        ['expiringSoon', 'Expiring soon'],
                        ['mostViewed', 'Most viewed'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        className={`h-7 border px-2 text-[11px] ${
                          notesFilter === value
                            ? 'border-neutral-500 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400'
                        }`}
                        onClick={() => setNotesFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['newest', 'Newest'],
                        ['mostViewed', 'Most viewed'],
                        ['recentlyUpdated', 'Recently updated'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        className={`h-7 border px-2 text-[11px] ${
                          notesSort === value
                            ? 'border-neutral-500 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400'
                        }`}
                        onClick={() => setNotesSort(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {filteredSortedNotes.length === 0 ? (
                  <p className="text-xs text-neutral-500">No notes match this filter.</p>
                ) : null}
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_32rem] 2xl:grid-cols-[minmax(0,1fr)_36rem] xl:items-start">
                  <div className="grid grid-cols-1 items-stretch gap-1.5 lg:grid-cols-2">
                    {visibleNotes.map((note, index) => {
                      const isEditing = editingNoteId === note.id;
                      const isOddLastCard =
                        visibleNotes.length % 2 === 1 && index === visibleNotes.length - 1;
                      const desktopSpanClass = isEditing || isOddLastCard ? 'lg:col-span-2' : '';
                      const inviteInfo = noteInviteSummaryById[note.id] ?? {
                        id: note.id,
                        invitedCount: 0,
                        invitees: [],
                      };
                      const previewText = excerpt(note.content, 220);
                      if (isEditing) {
                        return (
                          <article
                            key={note.id}
                            className={`space-y-3 rounded-sm border border-neutral-800 p-3 ${desktopSpanClass}`}
                          >
                            <div className="grid gap-2 md:grid-cols-2">
                              <input
                                value={editingNoteTitle}
                                onChange={(event) => setEditingNoteTitle(event.target.value)}
                                placeholder="Title"
                                className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs text-neutral-100"
                              />
                              <Combobox
                                items={[...visibilityOptions]}
                                value={editingNoteVisibility}
                                onValueChange={(next) =>
                                  setEditingNoteVisibility(
                                    next === 'private' ? 'private' : 'public'
                                  )
                                }
                              >
                                <ComboboxInput
                                  placeholder="Visibility"
                                  className={comboboxInputClass('w-full')}
                                />
                                <ComboboxContent>
                                  <ComboboxEmpty>No visibility found.</ComboboxEmpty>
                                  <ComboboxList>
                                    <ComboboxGroup>
                                      {visibilityOptions.map((option) => (
                                        <ComboboxItem key={option.value} value={option.value}>
                                          {option.label}
                                        </ComboboxItem>
                                      ))}
                                    </ComboboxGroup>
                                  </ComboboxList>
                                </ComboboxContent>
                              </Combobox>
                            </div>

                            <BriTiptapEditor
                              value={editingNoteContent}
                              onChange={setEditingNoteContent}
                              placeholder="Edit note content..."
                              minHeightClassName="min-h-[14rem]"
                            />

                            <div className="flex flex-wrap items-center gap-2">
                              <Combobox
                                items={[...expirationOptions]}
                                value={editingNoteExpirationValue}
                                onValueChange={(value) => {
                                  const next = expirationOptions.find(
                                    (option) => option.value === value
                                  );
                                  if (next) setEditingNoteExpirationValue(next.value);
                                }}
                              >
                                <ComboboxInput
                                  placeholder="Expiration"
                                  className={comboboxInputClass('w-44')}
                                />
                                <ComboboxContent>
                                  <ComboboxEmpty>No duration found.</ComboboxEmpty>
                                  <ComboboxList>
                                    <ComboboxGroup>
                                      {expirationOptions.map((option) => (
                                        <ComboboxItem key={option.value} value={option.value}>
                                          {option.label}
                                        </ComboboxItem>
                                      ))}
                                    </ComboboxGroup>
                                  </ComboboxList>
                                </ComboboxContent>
                              </Combobox>
                              <Button
                                type="button"
                                variant="default"
                                className="h-8 text-xs"
                                onClick={() => {
                                  void saveNoteEdits(note.id).catch((err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : 'Failed to update note'
                                    )
                                  );
                                }}
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 border border-neutral-800 text-xs"
                                onClick={cancelEditNote}
                              >
                                Cancel
                              </Button>
                            </div>
                          </article>
                        );
                      }

                      return (
                        <article
                          key={note.id}
                          className={`group relative h-auto min-h-[8.25rem] overflow-hidden rounded-sm border border-neutral-800 px-3 py-2.5 transition-colors hover:bg-neutral-800/60 md:min-h-[8.25rem] ${desktopSpanClass}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            router.push(`/${note.username}/${note.slug}`);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              router.push(`/${note.username}/${note.slug}`);
                            }
                          }}
                        >
                          <div className="flex h-full flex-col gap-2">
                            <div className="min-w-0">
                              <Link
                                href={`/${note.username}/${note.slug}`}
                                className="line-clamp-2 text-sm text-foreground hover:text-foreground hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {note.title}
                              </Link>
                              <p className="mt-1 text-[11px] leading-4 text-neutral-500">
                                {note.visibility} &middot; created {formatDate(note.createdAt)}{' '}
                                &middot; expires {formatExpiresIn(note.expiresAt)} &middot; views{' '}
                                {viewsBySlug[note.slug] ?? 0}
                              </p>
                              <p className="mt-1 text-[11px] leading-4 text-neutral-500">
                                invited {inviteInfo.invitedCount}
                              </p>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">
                                {previewText || 'No preview available.'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:absolute md:right-2.5 md:top-2.5 md:z-20 md:pointer-events-none md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-8 min-w-[3.4rem] px-3 text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEditNote(note);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-8 min-w-[3.4rem] px-3 text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openInviteDialog('note', note.id);
                                }}
                              >
                                Share
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-8 min-w-[2.75rem] px-3 text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void togglePin('note', note.id).catch((err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : 'Failed to toggle pin'
                                    )
                                  );
                                }}
                              >
                                {pinnedNoteIds.has(note.id) ? '<' : '>'}
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-8 min-w-[3.8rem] px-3 text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void patchNote(note.id, 'softDelete').catch((err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : 'Failed to delete note'
                                    )
                                  );
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <aside className="hidden self-start xl:block">
                    <div className="sticky top-20 h-fit max-h-[64rem] overflow-hidden rounded-sm border border-neutral-800 bg-neutral-950 dark:bg-neutral-900/90 p-3">
                      <p className="text-xs text-neutral-500">Selected note</p>
                      {selectedNote ? (
                        <div className="mt-2 flex flex-col space-y-2">
                          <p className="text-sm text-neutral-100">{selectedNote.title}</p>
                          <p className="truncate text-[11px] text-neutral-500">
                            edited {formatDate(selectedNote.updatedAt)} &middot; views{' '}
                            {viewsBySlug[selectedNote.slug] ?? 0} &middot; invitees{' '}
                            {(noteInviteSummaryById[selectedNote.id]?.invitees ?? [])
                              .slice(0, 4)
                              .map((invitee) => `@${invitee}`)
                              .join(', ') || 'none'}
                          </p>
                          <div className="max-h-[calc(64rem-4.5rem)] overflow-auto">
                            <div className="prose prose-neutral prose-invert max-w-none break-words prose-p:text-neutral-300 prose-headings:text-neutral-100 prose-h1:text-[0.95rem]! prose-h1:leading-6! prose-h1:font-semibold! prose-h2:text-[0.9rem]! prose-h2:leading-6! prose-h2:font-medium! prose-h3:text-[0.85rem]! prose-h3:leading-5! prose-h3:font-medium! prose-h4:text-[0.8rem]! prose-h4:leading-5! prose-h4:font-medium! prose-strong:text-neutral-100 prose-a:text-neutral-100 prose-a:decoration-neutral-700 prose-hr:border-neutral-800 prose-pre:border prose-pre:border-neutral-800">
                              <DashboardMarkdownPreview
                                content={
                                  editingNoteId === selectedNote.id
                                    ? normalizeMarkdownTables(editingNoteContent)
                                    : stripLeadingHeading(selectedNote.content, selectedNote.title)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-500">
                          Click a note to preview details.
                        </p>
                      )}
                    </div>
                  </aside>
                </div>
                {filteredSortedNotes.length > dashboardPageSize ? (
                  <Pagination className="justify-start">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setNotesPage((prev) => Math.max(1, prev - 1))}
                          disabled={notesPage <= 1}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-2 text-xs text-neutral-400">
                          {notesPage} / {notePages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setNotesPage((prev) => Math.min(notePages, prev + 1))}
                          disabled={notesPage >= notePages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                ) : null}
              </div>
            ) : null}

            {!isInitializing && panel === 'new' ? (
              <div className="space-y-4">
                <h1 className="text-sm text-neutral-200">New note</h1>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Title</span>
                    <input
                      value={noteTitle}
                      onChange={(event) => setNoteTitle(event.target.value)}
                      placeholder="Required title"
                      className="h-9 rounded-sm border border-neutral-800 bg-transparent px-2 text-sm text-neutral-100"
                    />
                  </label>
                </div>

                <BriTiptapEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Write note content..."
                  minHeightClassName="min-h-[22rem]"
                />

                <div className="grid gap-3 text-xs md:grid-cols-[max-content_max-content_1fr] md:items-end">
                  <label className="flex flex-col gap-1">
                    <span>Visibility</span>
                    <Combobox
                      items={[...visibilityOptions]}
                      value={visibility}
                      onValueChange={(next) =>
                        setVisibility(next === 'private' ? 'private' : 'public')
                      }
                    >
                      <ComboboxInput placeholder="Visibility" className={comboboxInputClass()} />
                      <ComboboxContent>
                        <ComboboxEmpty>No visibility found.</ComboboxEmpty>
                        <ComboboxList>
                          <ComboboxGroup>
                            {visibilityOptions.map((option) => (
                              <ComboboxItem key={option.value} value={option.value}>
                                {option.label}
                              </ComboboxItem>
                            ))}
                          </ComboboxGroup>
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span>Expire in</span>
                    <Combobox
                      items={[...expirationOptions]}
                      value={expirationValue}
                      onValueChange={(value) => {
                        const next = expirationOptions.find((option) => option.value === value);
                        if (next) setExpirationValue(next.value);
                      }}
                    >
                      <ComboboxInput placeholder="Expiration" className={comboboxInputClass()} />
                      <ComboboxContent>
                        <ComboboxEmpty>No duration found.</ComboboxEmpty>
                        <ComboboxList>
                          <ComboboxGroup>
                            {expirationOptions.map((option) => (
                              <ComboboxItem key={option.value} value={option.value}>
                                {option.label}
                              </ComboboxItem>
                            ))}
                          </ComboboxGroup>
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </label>

                  <Button
                    type="button"
                    className="h-8 w-full md:w-auto"
                    onClick={() => {
                      void createNote().catch((err) =>
                        toast.error(err instanceof Error ? err.message : 'Failed to create note')
                      );
                    }}
                  >
                    Publish
                  </Button>
                </div>
              </div>
            ) : null}

            {!isInitializing && panel === 'links' ? (
              <div className="w-full space-y-4">
                <div className="space-y-2">
                  <h1 className="text-sm text-neutral-200">Quick links</h1>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['all', 'All'],
                        ['mostViewed', 'Most viewed'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        className={`h-7 border px-2 text-[11px] ${
                          linksFilter === value
                            ? 'border-neutral-500 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400'
                        }`}
                        onClick={() => setLinksFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['newest', 'Newest'],
                        ['mostViewed', 'Most viewed'],
                        ['recentlyUpdated', 'Recently updated'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        className={`h-7 border px-2 text-[11px] ${
                          linksSort === value
                            ? 'border-neutral-500 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400'
                        }`}
                        onClick={() => setLinksSort(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-sm border border-neutral-800 p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <input
                      value={quickLinkKey}
                      onChange={(event) => setQuickLinkKey(event.target.value)}
                      placeholder="key (youtube)"
                      className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs"
                    />
                    <input
                      value={quickLinkUrl}
                      onChange={(event) => setQuickLinkUrl(event.target.value)}
                      placeholder="target url"
                      className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs md:col-span-2"
                    />
                    <input
                      value={quickLinkLabel}
                      onChange={(event) => setQuickLinkLabel(event.target.value)}
                      placeholder="label (optional)"
                      className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs"
                    />
                  </div>
                  <div className="mt-2">
                    <Button
                      type="button"
                      className="h-8 text-xs"
                      onClick={() => {
                        void createQuickLinkHandler().catch((err) =>
                          toast.error(
                            err instanceof Error ? err.message : 'Failed to create quick link'
                          )
                        );
                      }}
                    >
                      Add quick link
                    </Button>
                  </div>
                </div>

                {filteredSortedLinks.length === 0 ? (
                  <p className="text-xs text-neutral-500">No quick links match this filter.</p>
                ) : null}
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
                  <div className="grid grid-cols-1 items-start gap-1.5 lg:grid-cols-2">
                    {visibleQuickLinks.map((link, index) => {
                      const isEditing = editingLinkId === link.id;
                      const isOddLastCard =
                        visibleQuickLinks.length % 2 === 1 &&
                        index === visibleQuickLinks.length - 1;
                      const desktopSpanClass = isEditing || isOddLastCard ? 'lg:col-span-2' : '';
                      const inviteInfo = linkInviteSummaryById[link.id] ?? {
                        id: link.id,
                        invitedCount: 0,
                        invitees: [],
                      };
                      if (isEditing) {
                        return (
                          <article
                            key={link.id}
                            className={`space-y-2 rounded-sm border border-neutral-800 p-3 ${desktopSpanClass}`}
                          >
                            <div className="grid gap-2 md:grid-cols-4">
                              <input
                                value={editingLinkKey}
                                onChange={(event) => setEditingLinkKey(event.target.value)}
                                placeholder="key"
                                className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs"
                              />
                              <input
                                value={editingLinkUrl}
                                onChange={(event) => setEditingLinkUrl(event.target.value)}
                                placeholder="target url"
                                className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs md:col-span-2"
                              />
                              <input
                                value={editingLinkLabel}
                                onChange={(event) => setEditingLinkLabel(event.target.value)}
                                placeholder="label (optional)"
                                className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="default"
                                className="h-8 text-xs"
                                onClick={() => {
                                  void saveQuickLinkEdits(link.id).catch((err) =>
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to update quick link'
                                    )
                                  );
                                }}
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 border border-neutral-800 text-xs"
                                onClick={cancelEditQuickLink}
                              >
                                Cancel
                              </Button>
                            </div>
                          </article>
                        );
                      }

                      return (
                        <article
                          key={link.id}
                          className={`group relative h-auto min-h-[8.25rem] cursor-pointer overflow-hidden rounded-sm border border-neutral-800 px-3 py-3 transition-colors hover:bg-neutral-200/60 hover:bg-neutral-800/60 md:min-h-[8.25rem] ${desktopSpanClass}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedLinkId(link.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedLinkId(link.id);
                            }
                          }}
                        >
                          <div className="flex h-full flex-col gap-2.5">
                            <div className="min-w-0">
                              <Link
                                href={`/${link.username}/${link.key}`}
                                className="line-clamp-2 break-all text-sm text-foreground hover:text-foreground hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {formatQuickLinkTitle(link.label, link.key)}
                              </Link>
                              <p className="mt-1 truncate text-[11px] text-neutral-500">
                                {link.targetUrl}
                              </p>
                              <p className="mt-1 text-[11px] text-neutral-500">
                                views {link.clicks}
                                {link.lastClickedAt
                                  ? ` · last ${formatDate(link.lastClickedAt)}`
                                  : ''}
                              </p>
                              <p className="mt-1 text-[11px] text-neutral-500">
                                invited {inviteInfo.invitedCount}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:absolute md:right-2.5 md:top-2.5 md:z-20 md:pointer-events-none md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-7 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEditQuickLink(link);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-7 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openInviteDialog('link', link.id);
                                }}
                              >
                                Share
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-7 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void togglePin('link', link.id).catch((err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : 'Failed to toggle pin'
                                    )
                                  );
                                }}
                              >
                                {pinnedLinkIds.has(link.id) ? 'Unpin' : 'Pin'}
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-7 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void removeQuickLinkHandler(link.id).catch((err) =>
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to remove quick link'
                                    )
                                  );
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <aside className="hidden self-start xl:block">
                    <div className="sticky top-20 h-fit max-h-[calc(100vh-6rem)] overflow-hidden rounded-sm border border-neutral-800 p-3">
                      <p className="text-xs text-neutral-500">Selected link</p>
                      {selectedLink ? (
                        <div className="mt-2 max-h-[calc(100vh-12rem)] space-y-2 overflow-auto">
                          <p className="text-sm text-neutral-100">
                            {formatQuickLinkTitle(selectedLink.label, selectedLink.key)}
                          </p>
                          <p className="break-all text-[11px] text-neutral-500">
                            {selectedLink.targetUrl}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            edited {formatDate(selectedLink.updatedAt)} &middot; views{' '}
                            {selectedLink.clicks}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            invitees:{' '}
                            {(linkInviteSummaryById[selectedLink.id]?.invitees ?? [])
                              .slice(0, 4)
                              .map((invitee) => `@${invitee}`)
                              .join(', ') || 'none'}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-500">
                          Click a link to preview details.
                        </p>
                      )}
                    </div>
                  </aside>
                </div>
                {filteredSortedLinks.length > dashboardPageSize ? (
                  <Pagination className="justify-start">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setLinksPage((prev) => Math.max(1, prev - 1))}
                          disabled={linksPage <= 1}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-2 text-xs text-neutral-400">
                          {linksPage} / {linksPages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setLinksPage((prev) => Math.min(linksPages, prev + 1))}
                          disabled={linksPage >= linksPages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                ) : null}
              </div>
            ) : null}

            {!isInitializing && panel === 'profile' ? (
              <div className="space-y-4">
                <h1 className="text-sm text-neutral-200">Profile</h1>
                <div className="rounded-sm border border-neutral-800 p-3">
                  <p className="text-xs text-neutral-500">Public profile URL</p>
                  <CodeBlock className="mt-2" language="text">
                    {publicProfileUrl || 'Unavailable'}
                  </CodeBlock>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="h-8 text-xs"
                      disabled={!publicProfileUrl}
                      onClick={() => {
                        if (!publicProfileUrl) return;
                        window.open(publicProfileUrl, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      Open public profile
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 border border-neutral-800 text-xs"
                      disabled={!publicProfileUrl}
                      onClick={() => {
                        if (!publicProfileUrl) return;
                        void navigator.clipboard.writeText(publicProfileUrl);
                        toast.success('Profile URL copied');
                      }}
                    >
                      Copy URL
                    </Button>
                  </div>
                </div>

                <div className="rounded-sm border border-neutral-800 p-3">
                  <p className="text-xs text-neutral-500">Profile summary</p>
                  <p className="mt-2 text-xs text-neutral-300">
                    @{profileHandle || 'unknown'} &middot; {notes.length} notes &middot;{' '}
                    {quickLinks.length} links
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Signed-in view stays dashboard. Public view forced via <code>?public=1</code>.
                  </p>
                </div>
              </div>
            ) : null}

            {!isInitializing && panel === 'settings' ? (
              <div className="space-y-4">
                <h1 className="text-sm text-neutral-200">Settings</h1>
                {apiKeySession ? (
                  <p className="text-xs text-neutral-500">
                    API-key sessions can edit content. Sign in with Clerk to manage API keys.
                  </p>
                ) : null}

                <div className="rounded-sm border border-neutral-800 p-3">
                  <p className="text-xs text-neutral-500">CLI install command</p>
                  <CodeBlock className="mt-2" language="bash">
                    {cliInstallCommand}
                  </CodeBlock>
                </div>

                <div className="rounded-sm border border-neutral-800 p-3">
                  <p className="text-xs text-neutral-500">Generate API key</p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-neutral-500">Label</span>
                      <input
                        value={keyLabel}
                        onChange={(event) => setKeyLabel(event.target.value)}
                        placeholder="label"
                        className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-neutral-500">Permissions</span>
                      <Combobox
                        items={[...permissionOptions]}
                        value={keyPermissions}
                        onValueChange={(value) => {
                          if (value === 'read' || value === 'write' || value === 'read_write') {
                            setKeyPermissions(value);
                          }
                        }}
                      >
                        <ComboboxInput
                          placeholder="Permissions"
                          className={comboboxInputClass('w-44')}
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>No permission found.</ComboboxEmpty>
                          <ComboboxList>
                            <ComboboxGroup>
                              {permissionOptions.map((option) => (
                                <ComboboxItem key={option.value} value={option.value}>
                                  {option.label}
                                </ComboboxItem>
                              ))}
                            </ComboboxGroup>
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </label>

                    <Button
                      type="button"
                      className="h-8 text-xs"
                      disabled={apiKeySession}
                      onClick={() => {
                        void generateApiKey().catch((err) =>
                          toast.error(err instanceof Error ? err.message : 'Failed to generate key')
                        );
                      }}
                    >
                      Generate
                    </Button>
                  </div>

                  {generatedApiKey ? (
                    <div className="mt-3 rounded-sm border border-neutral-800 p-2">
                      <p className="text-[11px] text-neutral-300">Save now. shown once:</p>
                      <CodeBlock className="mt-1" language="text">
                        {generatedApiKey}
                      </CodeBlock>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-sm border border-neutral-800 p-3">
                  <p className="text-xs text-neutral-500">Your API keys</p>
                  <div className="mt-2 space-y-2">
                    {apiKeys.length === 0 ? (
                      <p className="text-xs text-neutral-500">No API keys yet.</p>
                    ) : null}
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between gap-2 rounded-sm border border-neutral-800 px-2 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs text-neutral-200">
                            {key.label || 'api key'}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {key.prefix} &middot; {key.permissions} &middot; created{' '}
                            {formatDate(key.createdAt)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 border border-neutral-800 text-xs"
                          disabled={apiKeySession}
                          onClick={() => {
                            void revokeKey(key.id).catch((err) =>
                              toast.error(
                                err instanceof Error ? err.message : 'Failed to revoke key'
                              )
                            );
                          }}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {analytics ? (
                  <Card className="w-full rounded-sm border border-neutral-800 bg-transparent py-0 ring-0">
                    <CardHeader className="border-b border-neutral-800 px-4 py-3">
                      <CardTitle className="text-sm text-neutral-200">
                        Analytics ({analytics.days}d)
                      </CardTitle>
                      <CardDescription className="text-xs text-neutral-500">
                        Total views: {analytics.totalViews.toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-2 py-3 sm:p-4">
                      <ChartContainer
                        config={chartConfig}
                        className="h-[240px] min-h-[240px] w-full !aspect-auto"
                        style={{ height: 240, maxHeight: 240 }}
                      >
                        <BarChart
                          accessibilityLayer
                          data={chartData}
                          margin={{
                            left: 12,
                            right: 12,
                          }}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={36}
                            tickFormatter={formatChartDate}
                          />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                className="w-[180px]"
                                labelFormatter={(value) => {
                                  const date = new Date(`${String(value)}T00:00:00.000Z`);
                                  if (Number.isNaN(date.getTime())) return String(value);
                                  return date.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  });
                                }}
                              />
                            }
                          />
                          <Bar
                            dataKey="pageViews"
                            radius={2}
                            fill="var(--color-pageViews)"
                            maxBarSize={24}
                          />
                          <Bar
                            dataKey="linkClicks"
                            radius={2}
                            fill="var(--color-linkClicks)"
                            fillOpacity={0.55}
                            maxBarSize={24}
                          />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {!isInitializing && panel === 'deleted' ? (
              <div className="w-full space-y-3">
                <div className="space-y-2">
                  <h1 className="text-sm text-neutral-200">Recently deleted</h1>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['all', 'All'],
                        ['expiringSoon', 'Expiring soon'],
                        ['mostViewed', 'Most viewed'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        className={`h-7 border px-2 text-[11px] ${
                          deletedFilter === value
                            ? 'border-neutral-500 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400'
                        }`}
                        onClick={() => setDeletedFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['newest', 'Newest'],
                        ['mostViewed', 'Most viewed'],
                        ['recentlyUpdated', 'Recently updated'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="ghost"
                        className={`h-7 border px-2 text-[11px] ${
                          deletedSort === value
                            ? 'border-neutral-500 text-neutral-100'
                            : 'border-neutral-800 text-neutral-400'
                        }`}
                        onClick={() => setDeletedSort(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {filteredSortedDeletedNotes.length === 0 ? (
                  <p className="text-xs text-neutral-500">No deleted notes match this filter.</p>
                ) : null}
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
                  <div className="grid grid-cols-1 items-stretch gap-1.5 lg:grid-cols-2">
                    {visibleDeletedNotes.map((note, index) => {
                      const isOddLastCard =
                        visibleDeletedNotes.length % 2 === 1 &&
                        index === visibleDeletedNotes.length - 1;
                      const desktopSpanClass = isOddLastCard ? 'lg:col-span-2' : '';
                      const inviteInfo = noteInviteSummaryById[note.id] ?? {
                        id: note.id,
                        invitedCount: 0,
                        invitees: [],
                      };
                      return (
                        <article
                          key={note.id}
                          className={`group relative h-auto min-h-[8.25rem] cursor-pointer overflow-hidden rounded-sm border border-neutral-800 px-3 py-3 transition-colors hover:bg-neutral-200/60 hover:bg-neutral-800/60 md:min-h-[8.25rem] ${desktopSpanClass}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedDeletedId(note.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedDeletedId(note.id);
                            }
                          }}
                        >
                          <div className="flex h-full flex-col gap-2.5">
                            <div className="min-w-0">
                              <p className="text-sm text-neutral-200">{note.title}</p>
                              <p className="mt-1 text-[11px] text-neutral-500">
                                deleted {formatDate(note.deletedAt)} &middot; permanent delete{' '}
                                {formatDate(note.purgeAt)} &middot; invited{' '}
                                {inviteInfo.invitedCount}
                              </p>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">
                                {excerpt(note.content, 220)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:absolute md:right-2.5 md:top-2.5 md:z-20 md:pointer-events-none md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-8 min-w-[3.8rem] px-3 text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void patchNote(note.id, 'restore').catch((err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : 'Failed to restore note'
                                    )
                                  );
                                }}
                              >
                                Restore
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className={`${dashboardActionButtonClass} h-8 min-w-[8.5rem] whitespace-nowrap px-3 text-xs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void patchNote(note.id, 'permanentDelete').catch((err) =>
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to permanently delete note'
                                    )
                                  );
                                }}
                              >
                                Delete forever
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <aside className="hidden self-start xl:block">
                    <div className="sticky top-20 h-fit max-h-[calc(100vh-6rem)] overflow-hidden rounded-sm border border-neutral-800 p-3">
                      <p className="text-xs text-neutral-500">Selected deleted note</p>
                      {selectedDeletedNote ? (
                        <div className="mt-2 max-h-[calc(100vh-12rem)] space-y-2 overflow-auto">
                          <p className="text-sm text-neutral-100">{selectedDeletedNote.title}</p>
                          <p className="text-[11px] text-neutral-500">
                            deleted {formatDate(selectedDeletedNote.deletedAt)} &middot; purge{' '}
                            {formatDate(selectedDeletedNote.purgeAt)}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            views {noteViewsById[selectedDeletedNote.id] ?? 0} &middot; invitees{' '}
                            {(
                              noteInviteSummaryById[selectedDeletedNote.id]?.invitedCount ?? 0
                            ).toString()}
                          </p>
                          <p className="text-xs text-neutral-400">
                            {excerpt(selectedDeletedNote.content, 300)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-500">
                          Click a deleted note to preview details.
                        </p>
                      )}
                    </div>
                  </aside>
                </div>
                {filteredSortedDeletedNotes.length > dashboardPageSize ? (
                  <Pagination className="justify-start">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setDeletedPage((prev) => Math.max(1, prev - 1))}
                          disabled={deletedPage <= 1}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-2 text-xs text-neutral-400">
                          {deletedPage} / {deletedPages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setDeletedPage((prev) => Math.min(deletedPages, prev + 1))}
                          disabled={deletedPage >= deletedPages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
        <Dialog
          open={inviteDialogOpen}
          onOpenChange={(open) => {
            setInviteDialogOpen(open);
            if (!open) {
              setInviteTargetKind(null);
              setInviteTargetId(null);
              setInviteeUsername('');
              setIsSubmittingInvite(false);
            }
          }}
        >
          <DialogContent className="max-w-md border border-neutral-800 bg-bg text-neutral-100 ring-0">
            <DialogHeader>
              <DialogTitle className="text-sm text-neutral-100">Share with user</DialogTitle>
              <DialogDescription className="text-xs text-neutral-400">
                Invite by username. Access granted even when note stays private.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Username</label>
              <input
                value={inviteeUsername}
                onChange={(event) => setInviteeUsername(event.target.value)}
                placeholder="e.g. egeuysall"
                className="h-9 w-full rounded-sm border border-neutral-700 bg-transparent px-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                autoFocus
              />
            </div>
            <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 border border-neutral-800 text-xs text-neutral-200 hover:bg-neutral-900"
                onClick={() => {
                  setInviteDialogOpen(false);
                  setInviteTargetKind(null);
                  setInviteTargetId(null);
                  setInviteeUsername('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-8 border border-neutral-700 bg-neutral-100 text-xs text-neutral-950 hover:bg-neutral-200"
                disabled={isSubmittingInvite}
                onClick={() => {
                  void submitInvite().catch((err) =>
                    toast.error(err instanceof Error ? err.message : 'Failed to invite user')
                  );
                }}
              >
                {isSubmittingInvite ? 'Sharing...' : 'Share'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="fixed right-6 top-4 z-30 hidden xl:block">
          <div
            className="relative pb-1"
            onMouseEnter={() => setNotificationsPanelOpen(true)}
            onMouseLeave={() => setNotificationsPanelOpen(false)}
          >
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 font-mono text-xs"
              aria-expanded={notificationsPanelOpen}
              aria-label="Open notifications"
              onClick={() => setNotificationsPanelOpen((prev) => !prev)}
            >
              ...
            </Button>
            {notificationsPanelOpen ? (
              <aside className="absolute right-0 top-full w-80 rounded-sm border border-neutral-800 bg-bg p-3 shadow-lg">
                <div className="space-y-4">
                  <section className="space-y-1">
                    <h2 className="text-xs text-neutral-400">invitations</h2>
                    {invitationNotifications.length === 0 ? (
                      <p className="text-[11px] text-neutral-500">none</p>
                    ) : (
                      invitationNotifications.map((row) => (
                        <div key={row.id} className="flex items-start gap-2">
                          <button
                            type="button"
                            className="flex-1 text-left text-[11px] text-neutral-300 transition-colors hover:text-neutral-100"
                            onClick={() => {
                              void openNotification(row.id).catch((err) =>
                                toast.error(
                                  err instanceof Error ? err.message : 'Failed to open notification'
                                )
                              );
                            }}
                          >
                            {row.message}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-5 min-w-5 px-1 text-[11px]"
                            onClick={() => {
                              void dismissNotification(row.id).catch((err) =>
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : 'Failed to dismiss notification'
                                )
                              );
                            }}
                          >
                            -
                          </Button>
                        </div>
                      ))
                    )}
                  </section>
                  <section className="space-y-1">
                    <h2 className="text-xs text-neutral-400">achievements</h2>
                    {achievementItems.length === 0 ? (
                      <p className="text-[11px] text-neutral-500">none yet</p>
                    ) : (
                      achievementItems.map((row) => (
                        <div key={row.id} className="flex items-start gap-2">
                          <p className="flex-1 text-[11px] text-neutral-300">{row.message}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-5 min-w-5 px-1 text-[11px]"
                            onClick={() => dismissAchievement(row.id)}
                          >
                            -
                          </Button>
                        </div>
                      ))
                    )}
                  </section>
                  <section className="space-y-1">
                    <h2 className="text-xs text-neutral-400">notices</h2>
                    {noticeItems.length === 0 ? (
                      <p className="text-[11px] text-neutral-500">none</p>
                    ) : (
                      noticeItems.map((row) => (
                        <div key={row.id} className="flex items-start gap-2">
                          <p className="flex-1 text-[11px] text-neutral-300">{row.message}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-5 min-w-5 px-1 text-[11px]"
                            onClick={() => dismissNotice(row.id)}
                          >
                            -
                          </Button>
                        </div>
                      ))
                    )}
                  </section>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
