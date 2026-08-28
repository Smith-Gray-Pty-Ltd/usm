// Content-block renderer — the generic VitePress markdown renderer.
//
// This is the ONE rendering function that converts structured content blocks
// (from system.usm reference_pages or feature spec reference blocks) into
// VitePress markdown. It replaces ~40% of markdown.ts that was previously
// hand-written prose and hardcoded constants.
//
// Block types map to VitePress features:
//   heading  -> ## Heading (level configurable)
//   paragraph -> plain text
//   code     -> ```language fenced code block (with optional title)
//   mermaid  -> ```mermaid fenced block
//   tabs     -> ::: tabs / ::: tab containers
//   callout  -> ::: info / ::: tip / ::: warning / ::: danger containers
//   table    -> markdown table
//   steps    -> ordered list with optional inline code
//   cards    -> <div class="features"> grid
//   badge    -> <Badge> component
//   divider  -> ---

export type BlockType =
  | "heading"
  | "paragraph"
  | "code"
  | "mermaid"
  | "tabs"
  | "callout"
  | "table"
  | "steps"
  | "cards"
  | "badge"
  | "divider";

export type Audience = "public" | "internal";

export type CalloutVariant = "info" | "tip" | "warning" | "danger";

/** A tab entry within a tabs block. */
export interface TabEntry {
  label: string;
  content: ContentBlock[];
}

/** A step or card item. */
export interface BlockItem {
  text?: string;
  code?: string;
  description?: string;
  icon?: string;
  link?: string;
}

/** The unified content block shape — mirrors the contentBlock $def in v1.json. */
export interface ContentBlock {
  type: BlockType;
  audience?: Audience;
  // heading / paragraph / badge
  level?: number;
  text?: string;
  // code / mermaid
  source?: string;
  language?: string;
  title?: string;
  highlight?: string[];
  diagram?: string;
  // tabs
  tabs?: TabEntry[];
  // callout
  variant?: CalloutVariant;
  content?: ContentBlock[];
  // table
  headers?: string[];
  rows?: string[][];
  // steps / cards
  items?: BlockItem[];
}

// ─── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Render an array of content blocks to VitePress markdown.
 *
 * This is the single entry point. Every page that uses content blocks flows
 * through here. Unknown block types produce a warning and are skipped (per
 * the generic-renderer contract).
 *
 * @param blocks - Content blocks from a spec field or reference_pages entry
 * @param warnings - Optional array to collect warnings (unknown block types, etc.)
 * @returns VitePress markdown string
 */
export function renderContentBlocks(
  blocks: ContentBlock[],
  warnings?: string[],
): string {
  const lines: string[] = [];
  for (const block of blocks) {
    const rendered = renderBlock(block, warnings);
    if (rendered) {
      lines.push(rendered);
    }
  }
  return lines.join("\n\n").trim() + "\n";
}

/**
 * Render a single content block to VitePress markdown.
 * Delegates to type-specific renderers. Unknown types warn and return "".
 */
function renderBlock(block: ContentBlock, warnings?: string[]): string {
  switch (block.type) {
    case "heading":
      return renderHeading(block);
    case "paragraph":
      return renderParagraph(block);
    case "code":
      return renderCode(block);
    case "mermaid":
      return renderMermaid(block);
    case "tabs":
      return renderTabs(block, warnings);
    case "callout":
      return renderCallout(block, warnings);
    case "table":
      return renderTable(block);
    case "steps":
      return renderSteps(block);
    case "cards":
      return renderCards(block);
    case "badge":
      return renderBadge(block);
    case "divider":
      return "---";
    default:
      warnings?.push(`Unknown content block type: ${block.type as string}`);
      return "";
  }
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function renderHeading(block: ContentBlock): string {
  const level = block.level ?? 2;
  const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
  return `${hashes} ${block.text ?? ""}`;
}

function renderParagraph(block: ContentBlock): string {
  return block.text ?? "";
}

function renderCode(block: ContentBlock): string {
  const lang = block.language ?? "";
  const source = block.source ?? "";
  const title = block.title;

  // VitePress supports code-group titles via a comment line or the title attr.
  // We use the fenced block with an optional title comment for compatibility.
  let result = "";
  if (title) {
    result += `<!-- ${title} -->\n`;
  }
  result += "```" + lang;
  if (block.highlight && block.highlight.length > 0) {
    result += ` {${block.highlight.join(",")}}`;
  }
  result += "\n" + source + "\n```";
  return result;
}

function renderMermaid(block: ContentBlock): string {
  const diagram = block.diagram ?? block.source ?? "";
  return "```mermaid\n" + diagram + "\n```";
}

function renderTabs(block: ContentBlock, warnings?: string[]): string {
  if (!block.tabs || block.tabs.length === 0) return "";
  const lines: string[] = ["::: tabs"];
  for (const tab of block.tabs) {
    lines.push(`::: tab ${tab.label}`);
    lines.push("");
    if (tab.content && tab.content.length > 0) {
      lines.push(renderContentBlocks(tab.content, warnings).trim());
    }
    lines.push("");
    lines.push(":::");
  }
  lines.push(":::");
  return lines.join("\n");
}

function renderCallout(block: ContentBlock, warnings?: string[]): string {
  const variant = block.variant ?? "info";
  const lines: string[] = [`::: ${variant}`];
  if (block.text) {
    lines.push(block.text);
    lines.push("");
  }
  if (block.content && block.content.length > 0) {
    lines.push(renderContentBlocks(block.content, warnings).trim());
    lines.push("");
  }
  lines.push(":::");
  return lines.join("\n");
}

function renderTable(block: ContentBlock): string {
  if (!block.headers || block.headers.length === 0) return "";
  const headerRow = `| ${block.headers.join(" | ")} |`;
  const separator = `| ${block.headers.map(() => "---").join(" | ")} |`;
  const dataRows = (block.rows || []).map(
    (row) => `| ${row.join(" | ")} |`,
  );
  return [headerRow, separator, ...dataRows].join("\n");
}

function renderSteps(block: ContentBlock): string {
  if (!block.items || block.items.length === 0) return "";
  return block.items
    .map((item, i) => {
      let line = `${i + 1}. ${item.text ?? ""}`;
      if (item.code) {
        line += ` \`${item.code}\``;
      }
      return line;
    })
    .join("\n");
}

function renderCards(block: ContentBlock): string {
  if (!block.items || block.items.length === 0) return "";
  const lines: string[] = ['<div class="features">'];
  for (const item of block.items) {
    lines.push("");
    lines.push(`### ${item.text ?? ""} {${item.icon ?? ""}}`);
    lines.push("");
    if (item.description) {
      lines.push(item.description);
    }
    if (item.link) {
      lines.push("");
      lines.push(`[Learn more](${item.link})`);
    }
  }
  lines.push("");
  lines.push("</div>");
  return lines.join("\n");
}

function renderBadge(block: ContentBlock): string {
  const variant = block.variant ?? "info";
  const text = block.text ?? "";
  return `<Badge type="${variant}" text="${text}" />`;
}

// ─── Reference page renderer ──────────────────────────────────────────────────

export interface ReferencePage {
  id: string;
  title: string;
  audience?: Audience;
  source?: "detectors" | "schema" | "config";
  content?: ContentBlock[];
}

/**
 * Render a reference page to VitePress markdown.
 * The page title becomes the H1; content blocks follow.
 */
export function renderReferencePage(page: ReferencePage, warnings?: string[]): string {
  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  lines.push("");
  if (page.content && page.content.length > 0) {
    lines.push(renderContentBlocks(page.content, warnings));
  }
  return lines.join("\n");
}

// ─── Reference block (feature-level) renderer ─────────────────────────────────

export interface FeatureReferenceBlock {
  heading: string;
  audience?: Audience;
  content: ContentBlock[];
}

/**
 * Render a feature reference block to VitePress markdown.
 * The heading becomes an H2; content blocks follow.
 */
export function renderFeatureReferenceBlock(
  ref: FeatureReferenceBlock,
  warnings?: string[],
): string {
  const lines: string[] = [];
  lines.push(`## ${ref.heading}`);
  lines.push("");
  if (ref.content && ref.content.length > 0) {
    lines.push(renderContentBlocks(ref.content, warnings));
  }
  return lines.join("\n");
}

// ─── Audience filtering ───────────────────────────────────────────────────────

/**
 * Filter content blocks by audience for help-doc generation.
 * Blocks with audience: internal are dropped; audience: public or no
 * audience field survive. This is the block-level granularity filter.
 */
export function filterBlocksByAudience(
  blocks: ContentBlock[],
  keepAudience: Audience = "public",
): ContentBlock[] {
  return blocks.filter((block) => {
    // No audience field = public (default)
    if (!block.audience) return true;
    return block.audience === keepAudience;
  });
}

/**
 * Filter feature reference blocks by audience.
 */
export function filterReferenceBlocksByAudience(
  refs: FeatureReferenceBlock[],
  keepAudience: Audience = "public",
): FeatureReferenceBlock[] {
  return refs.filter((ref) => {
    if (!ref.audience) return true;
    return ref.audience === keepAudience;
  });
}