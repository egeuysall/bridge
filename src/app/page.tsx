import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { CliSection } from '@/components/blocks/cli-copy';
import { getBridgeApiKeySessionFromRequest } from '@/lib/request-security';
import { resolveUserHandle, resolveUserHandleFromUser } from '@/lib/user-handle';

const Landing = async () => {
  const { userId, sessionClaims } = await auth();

  if (userId) {
    const handleFromClaims = resolveUserHandle(
      sessionClaims as Record<string, unknown> | null | undefined
    );
    let handle = handleFromClaims;

    if (!handle) {
      const user = await currentUser();
      handle = resolveUserHandleFromUser(user);
    }

    if (handle) {
      redirect(`/${handle}`);
    }
  }

  const cookieHeader = (await headers()).get('cookie') ?? '';
  const apiKeySession = await getBridgeApiKeySessionFromRequest(
    new Request('http://bri.local', { headers: { cookie: cookieHeader } })
  );
  if (apiKeySession?.username) {
    redirect(`/${apiKeySession.username}`);
  }

  return (
    <>
      <section className="animate-enter" style={{ '--delay': '40ms' } as CSSProperties}>
        <p className="text-[13px] leading-relaxed text-neutral-200">
          Open-source publishing platform for notes and links.
        </p>
        <p className="mt-2 text-xs text-neutral-400">
          Authenticated dashboard, API-first CLI, private or public notes, built for fast sharing.
        </p>
      </section>

      <section
        className="mt-10 animate-enter pb-8"
        style={{ '--delay': '120ms' } as CSSProperties}
      >
        <CliSection />
      </section>
    </>
  );
};

export default Landing;
