import { expect, test } from 'bun:test';
import { renderToReadableStream } from 'react-dom/server';
import { MarkdownContent } from './markdown-content';

test('adds linkable IDs to Markdown headings', async () => {
  const component = await MarkdownContent({
    postId: 'test',
    content: '## The memoir at a glance',
  });
  const stream = await renderToReadableStream(component);
  const html = await new Response(stream).text();

  expect(html).toContain('<h2 id="user-content-the-memoir-at-a-glance">');
});
