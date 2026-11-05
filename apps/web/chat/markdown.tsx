import type { ReactNode } from 'react';

/** A small, safe Markdown subset for chat messages: **bold**, _italic_, ~~strike~~, `code`, links, @mentions,
    ordered and bulleted lists, quotes and code blocks. It builds React nodes, never HTML strings. */
const INLINE =
  /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|_[^_\n]+_|\*[^*\n]+\*|https?:\/\/[^\s<>()]+|@[\p{L}\p{N}_.-]+)/gu;

function inline(text: string, key: string, names: string[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0,
    index = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0],
      at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const id = `${key}-${index++}`;
    if (token.startsWith('[')) {
      const split = token.indexOf('](');
      nodes.push(
        <a key={id} href={token.slice(split + 2, -1)} target="_blank" rel="noreferrer noopener">
          {token.slice(1, split)}
        </a>,
      );
    } else if (token.startsWith('**'))
      nodes.push(<strong key={id}>{inline(token.slice(2, -2), id, names)}</strong>);
    else if (token.startsWith('~~'))
      nodes.push(<s key={id}>{inline(token.slice(2, -2), id, names)}</s>);
    else if (token.startsWith('`')) nodes.push(<code key={id}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('_') || token.startsWith('*'))
      nodes.push(<em key={id}>{inline(token.slice(1, -1), id, names)}</em>);
    else if (token.startsWith('http'))
      nodes.push(
        <a key={id} href={token} target="_blank" rel="noreferrer noopener">
          {token}
        </a>,
      );
    else if (token.startsWith('@')) {
      const name = token.slice(1).toLowerCase();
      nodes.push(
        names.some(
          (candidate) =>
            candidate.toLowerCase().replace(/\s+/g, '') === name ||
            candidate.toLowerCase().split(/\s+/)[0] === name,
        ) ? (
          <span key={id} className="chat-mention">
            {token}
          </span>
        ) : (
          token
        ),
      );
    }
    last = at + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderMessage(text: string, names: string[] = []): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      blocks.push(
        <pre key={`b${i}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*[-*•] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*•] /.test(lines[i]); i++)
        items.push(lines[i].replace(/^\s*[-*•] /, ''));
      i--;
      blocks.push(
        <ul key={`b${i}`}>
          {items.map((item, n) => (
            <li key={n}>{inline(item, `u${i}-${n}`, names)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*\d+[.)] /.test(lines[i]); i++)
        items.push(lines[i].replace(/^\s*\d+[.)] /, ''));
      i--;
      blocks.push(
        <ol key={`b${i}`}>
          {items.map((item, n) => (
            <li key={n}>{inline(item, `o${i}-${n}`, names)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={`b${i}`}>{inline(line.slice(2), `q${i}`, names)}</blockquote>);
      continue;
    }
    blocks.push(<p key={`b${i}`}>{line ? inline(line, `p${i}`, names) : ' '}</p>);
  }
  return blocks;
}

/** Wraps the selected text of a textarea with a Markdown marker, or applies a line prefix. */
export function applyFormat(
  element: HTMLTextAreaElement,
  value: string,
  format: 'bold' | 'italic' | 'strike' | 'link' | 'ol' | 'ul' | 'quote' | 'code' | 'codeblock',
) {
  const start = element.selectionStart ?? value.length,
    end = element.selectionEnd ?? value.length;
  const selected = value.slice(start, end);
  const wrap = (left: string, right = left, placeholder = 'texto') => {
    const body = selected || placeholder;
    return {
      text: value.slice(0, start) + left + body + right + value.slice(end),
      from: start + left.length,
      to: start + left.length + body.length,
    };
  };
  const prefix = (marker: (n: number) => string) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(lineStart, end) || '';
    const next = block
      .split('\n')
      .map((line, n) => marker(n + 1) + line)
      .join('\n');
    return {
      text: value.slice(0, lineStart) + next + value.slice(end),
      from: lineStart + next.length,
      to: lineStart + next.length,
    };
  };
  switch (format) {
    case 'bold':
      return wrap('**');
    case 'italic':
      return wrap('_');
    case 'strike':
      return wrap('~~');
    case 'code':
      return wrap('`', '`', 'código');
    case 'codeblock':
      return wrap('```\n', '\n```', 'código');
    case 'link':
      return wrap('[', '](https://)', 'enlace');
    case 'ol':
      return prefix((n) => `${n}. `);
    case 'ul':
      return prefix(() => '- ');
    case 'quote':
      return prefix(() => '> ');
  }
}
