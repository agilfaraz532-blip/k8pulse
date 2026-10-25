import { Fragment, ReactNode } from 'react';

/**
 * Minimal, dependency-free renderer for the markdown the AI copilot produces:
 * headings, bullet / numbered lists, **bold** and `inline code`. Builds React
 * elements (no innerHTML), so model output can never inject markup.
 */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-300 font-mono text-[11px] break-all">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const ListTag = ordered ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1.5 marker:text-purple-400`}
      >
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ListTag>,
    );
    list = null;
  };

  let code: string[] | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();

    // Fenced code blocks (```), possibly still open while the answer streams in
    if (line.trim().startsWith('```')) {
      if (code === null) {
        flushList();
        code = [];
      } else {
        blocks.push(<CodeBlock key={blocks.length} lines={code} />);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(rawLine);
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const boldHeading = line.match(/^\*\*([^*]+)\*\*:?$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (heading || boldHeading) {
      flushList();
      blocks.push(
        <h4 key={blocks.length} className="text-xs font-bold uppercase tracking-wider text-purple-300 pt-2 first:pt-0">
          {(heading?.[1] ?? boldHeading?.[1] ?? '').replace(/\*\*/g, '')}
        </h4>,
      );
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet?.[1] ?? numbered?.[1]) as string);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={blocks.length} className="leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  if (code !== null && code.length) blocks.push(<CodeBlock key={blocks.length} lines={code} />);

  return <div className="space-y-2.5">{blocks}</div>;
}

function CodeBlock({ lines }: { lines: string[] }) {
  // Models sometimes wrap commands in both a fence and backticks; show the bare command
  const text = lines.map((l) => l.replace(/^(\s*)`([^`]+)`(.*)$/, '$1$2$3')).join('\n');
  return (
    <pre className="p-3 rounded-lg bg-[#090D16] border border-slate-800 text-cyan-300 font-mono text-[11px] overflow-x-auto whitespace-pre">
      {text}
    </pre>
  );
}
