'use client';

import { useEffect } from 'react';

export function MarkdownHashScroller() {
  useEffect(() => {
    const scrollToHash = () => {
      let hash: string;
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (hash) document.getElementById(`user-content-${hash}`)?.scrollIntoView();
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  return null;
}
