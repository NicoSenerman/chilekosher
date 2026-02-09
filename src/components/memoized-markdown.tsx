import { marked } from "marked";
import type { Tokens } from "marked";
import { memo, useMemo } from "react";

type TokensList = Array<Tokens.Generic & { raw: string }>;

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens: TokensList = marked.lexer(markdown);
  const blocks: string[] = [];

  let currentBlock = "";

  for (const token of tokens) {
    // Keep lists together as a single block
    if (token.type === "list") {
      // Flush any pending content first
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = "";
      }
      blocks.push(token.raw);
    }
    // Group consecutive inline elements together
    else if (token.type === "paragraph" || token.type === "text") {
      currentBlock += token.raw;
    }
    // Other block elements get their own block
    else {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = "";
      }
      blocks.push(token.raw);
    }
  }

  // Don't forget remaining content
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

const MemoizedMarkdownBlock = memo(
  ({ content, index }: { content: string; index: number }) => {
    const html = marked.parse(content) as string;

    return (
      <div
        className="markdown-body animate-word"
        style={{ animationDelay: `${index * 50}ms` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.content === nextProps.content &&
    prevProps.index === nextProps.index
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

export const MemoizedMarkdown = memo(
  ({ content, id }: { content: string; id: string }) => {
    const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

    return (
      <>
        {blocks.map((block, index) => (
          <MemoizedMarkdownBlock
            content={block}
            index={index}
            key={`${id}-block_${index}`}
          />
        ))}
      </>
    );
  }
);

MemoizedMarkdown.displayName = "MemoizedMarkdown";
