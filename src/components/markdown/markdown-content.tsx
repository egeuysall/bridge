import { MarkdownAsync } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeMarkdownTables } from '@/lib/tiptap-markdown';
import {
  CodeBlock,
  InlineCode,
  MathBlock,
  MarkdownImage,
  MarkdownTable,
  MarkdownTableHead,
  MarkdownTableBody,
  MarkdownTableRow,
  MarkdownTableHeaderCell,
  MarkdownTableDataCell,
  MarkdownCheckbox,
} from './index';
import { markdownUrlTransform } from './url-transform';
import { MarkdownHashScroller } from './markdown-hash-scroller';

interface MarkdownContentProps {
  postId: string;
  content: string;
}

export async function MarkdownContent({ postId, content }: MarkdownContentProps) {
  return (
    <>
      <MarkdownHashScroller />
      <MarkdownAsync
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeSlug, { prefix: 'user-content-' }],
          [rehypeKatex, { strict: 'warn', throwOnError: false, trust: false, output: 'mathml' }],
        ]}
        urlTransform={markdownUrlTransform}
        components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children, ...props }) => {
          const normalizedContent = String(children);
          const isBlock = className?.includes('language-') || normalizedContent.includes('\n');
          const isInline = !isBlock;

          if (isInline) {
            return <InlineCode {...props}>{children}</InlineCode>;
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
        // Tables using shadcn components
        table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
        thead: ({ children }) => <MarkdownTableHead>{children}</MarkdownTableHead>,
        tbody: ({ children }) => <MarkdownTableBody>{children}</MarkdownTableBody>,
        tr: ({ children }) => <MarkdownTableRow>{children}</MarkdownTableRow>,
        th: ({ children }) => <MarkdownTableHeaderCell>{children}</MarkdownTableHeaderCell>,
        td: ({ children }) => <MarkdownTableDataCell>{children}</MarkdownTableDataCell>,
        // Images using Next.js Image component
        img: ({ src, alt }) => (
          <MarkdownImage src={typeof src === 'string' ? src : undefined} alt={alt} />
        ),
        // Clickable checkboxes for task lists
        input: ({ type, checked, node }) => {
          if (type === 'checkbox') {
            const currentIndex = node?.position?.start?.offset ?? 0;
            return (
              <MarkdownCheckbox checked={checked} postId={postId} checkboxIndex={currentIndex} />
            );
          }
          return <input type={type} checked={checked} readOnly />;
        },
        }}
      >
        {normalizeMarkdownTables(content)}
      </MarkdownAsync>
    </>
  );
}
