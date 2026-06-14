'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders agent/committee text as markdown (bold, lists, headings). */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
