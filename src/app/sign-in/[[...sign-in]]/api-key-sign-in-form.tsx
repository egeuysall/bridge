'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ApiKeySignInForm() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { username?: string };
        error?: string;
      } | null;

      if (!response.ok) {
        setError(body?.error || 'Could not sign in');
        return;
      }

      window.location.assign(body?.data?.username ? `/${body.data.username}` : '/');
    } catch {
      setError('Could not reach the sign-in service');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 w-full space-y-3 border-t border-neutral-800 pt-6">
      <div className="space-y-2">
        <label htmlFor="bri-api-key" className="text-xs text-neutral-400">
          API key
        </label>
        <Input
          id="bri-api-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          className="font-mono text-xs"
          placeholder="bri_..."
          required
        />
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in with API key'}
      </Button>
    </form>
  );
}
