'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BriTiptapEditor } from '@/components/dashboard/tiptap-note-editor';
import type { NoteRecord, NoteVisibility } from '@/lib/notes';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';

type NoteSlugEditorProps = {
  note: NoteRecord;
  isAdmin?: boolean;
};

type NoteVersion = {
  id: string;
  version: number;
  title: string;
  slug: string;
  content?: string;
  visibility: NoteVisibility;
  expiresAt: number | null;
  createdAt: number;
  actor: 'owner' | 'api_key' | 'admin' | 'restore';
};

function formatVersionDate(value: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function NoteSlugEditor({ note, isAdmin = false }: NoteSlugEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility);
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [isSaving, setIsSaving] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyEndpoint = isAdmin
    ? `/api/admin/notes/${encodeURIComponent(note.id)}/versions`
    : `/api/notes/by-id/${encodeURIComponent(note.id)}/versions`;

  const loadVersion = useCallback(
    async (versionId: string) => {
      setError(null);
      try {
        const response = await fetch(
          `${historyEndpoint}?versionId=${encodeURIComponent(versionId)}`
        );
        const json = (await response.json().catch(() => ({}))) as {
          data?: NoteVersion;
          error?: string;
        };
        if (!response.ok || !json.data) {
          throw new Error(json.error || 'Failed to load version');
        }
        setSelectedVersion(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load version');
      }
    },
    [historyEndpoint]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(historyEndpoint);
        const json = (await response.json().catch(() => ({}))) as {
          data?: NoteVersion[];
          error?: string;
        };
        if (!response.ok) throw new Error(json.error || 'Failed to load version history');
        const rows = json.data ?? [];
        if (!active) return;
        setVersions(rows);
        if (rows[0]) await loadVersion(rows[0].id);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load version history');
      } finally {
        if (active) setIsLoadingHistory(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [historyEndpoint, loadVersion]);

  const save = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || !content.trim() || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        isAdmin
          ? `/api/admin/notes/${encodeURIComponent(note.id)}`
          : `/api/notes/by-id/${encodeURIComponent(note.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            title: nextTitle,
            content: normalizeMarkdownTables(content),
            visibility,
            expiresInDays: expiresInDays === 'never' ? null : Number(expiresInDays),
          }),
        }
      );
      const json = (await response.json().catch(() => ({}))) as {
        data?: { slug?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save note');
      }
      router.replace(`/${note.username}/${json.data?.slug ?? note.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const restoreVersion = async () => {
    if (!selectedVersion || isRestoring) return;
    if (
      !window.confirm(
        `Restore version ${selectedVersion.version}? The current note will remain in history.`
      )
    ) {
      return;
    }

    setIsRestoring(true);
    setError(null);
    try {
      const response = await fetch(historyEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', versionId: selectedVersion.id }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: { slug?: string };
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || 'Failed to restore version');
      router.replace(`/${note.username}/${json.data?.slug ?? note.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <section className="w-full px-4 py-5 md:px-8 md:py-8">
      <article
        className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">edit / {note.slug}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 border border-neutral-800 text-xs"
                onClick={() => router.push(`/${note.username}/${note.slug}`)}
              >
                cancel
              </Button>
              <Button
                type="button"
                variant="default"
                className="h-8 text-xs"
                disabled={isSaving || !title.trim() || !content.trim()}
                onClick={() => void save()}
              >
                {isSaving ? 'saving' : 'save'}
              </Button>
            </div>
          </div>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 rounded-sm border border-neutral-800 bg-transparent px-3 text-sm text-neutral-100 outline-none transition-colors focus:border-neutral-600"
            maxLength={120}
            aria-label="Note title"
          />

          <div className="grid gap-2 md:grid-cols-[12rem_12rem_1fr]">
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value === 'private' ? 'private' : 'public')
              }
              className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs text-neutral-100"
              aria-label="Visibility"
            >
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
            <select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              className="h-8 rounded-sm border border-neutral-800 bg-transparent px-2 text-xs text-neutral-100"
              aria-label="Expiration"
            >
              <option value="1">1d</option>
              <option value="7">7d</option>
              <option value="30">30d</option>
              <option value="never">never</option>
            </select>
            {error ? <p className="self-center text-xs text-red-400">{error}</p> : null}
          </div>

          <BriTiptapEditor
            value={content}
            onChange={setContent}
            placeholder="Edit note content..."
            minHeightClassName="min-h-[60vh]"
          />
        </div>

        <aside
          className="min-w-0 rounded-sm border border-neutral-800 p-3"
          aria-label="Version history"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-neutral-100">version history</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                {isAdmin ? 'admin history' : 'saved versions'} · newest first
              </p>
            </div>
            {selectedVersion ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs"
                disabled={isRestoring}
                onClick={() => void restoreVersion()}
              >
                {isRestoring ? 'restoring' : 'restore'}
              </Button>
            ) : null}
          </div>

          {isLoadingHistory ? <p className="text-xs text-neutral-500">loading history…</p> : null}
          {!isLoadingHistory && versions.length === 0 ? (
            <p className="text-xs text-neutral-500">No past versions yet.</p>
          ) : null}

          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                className={`rounded-sm border px-2 py-2 text-left text-xs transition-colors ${
                  selectedVersion?.id === version.id
                    ? 'border-neutral-500 bg-neutral-900 text-neutral-100'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
                onClick={() => void loadVersion(version.id)}
              >
                <span className="block font-medium">
                  v{version.version} · {version.title}
                </span>
                <span className="mt-1 block text-[10px] text-neutral-500">
                  {formatVersionDate(version.createdAt)} · {version.actor}
                </span>
              </button>
            ))}
          </div>

          {selectedVersion?.content !== undefined ? (
            <div className="mt-3 border-t border-neutral-800 pt-3">
              <p className="mb-2 text-[11px] text-neutral-500">
                {selectedVersion.visibility} · /{selectedVersion.slug}
              </p>
              <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-sm bg-neutral-950 p-2 text-[11px] leading-5 text-neutral-300">
                {selectedVersion.content}
              </pre>
            </div>
          ) : null}
        </aside>
      </article>
    </section>
  );
}
