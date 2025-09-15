'use client';

import { notFound } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import type { Post } from '@/types/general';
import ReactMarkdown from 'react-markdown';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const DynamicGroups = ({ params }: { params: Promise<{ id: string }> }) => {
  const [data, setData] = useState<Post>();
  const [loading, setLoading] = useState(true);
  const { id } = use(params);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        console.log('[DynamicGroups] Fetching:', `${apiUrl}/${encodeURIComponent(id)}`);

        const res = await fetch(`${apiUrl}/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });

        console.log('[DynamicGroups] Response status:', res.status, res.statusText);

        if (!res.ok) {
          return notFound();
        }

        const json = await res.json();
        setData(json.data);
      } catch (error) {
        console.error('Error fetching blog post:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <main className="w-full flex flex-col gap-lg">
        <div>Loading...</div>
      </main>
    );
  }

  if (!data) {
    return notFound();
  }

  return (
    <div className="w-full flex justify-center">
      <main className="w-full flex flex-col max-w-full md:max-w-3/4 lg:max-w-1/2">
        <section className="flex flex-col gap-md">
          <ReactMarkdown>{data.content}</ReactMarkdown>
        </section>
      </main>
    </div>
  );
};

export default DynamicGroups;
