import { describe, it, expect } from "vitest";
import {
  renderContentBlocks,
  renderReferencePage,
  renderFeatureReferenceBlock,
  filterBlocksByAudience,
  filterReferenceBlocksByAudience,
  type ContentBlock,
  type FeatureReferenceBlock,
} from "../src/generators/contentBlocks.js";

// ─── Block rendering tests ─────────────────────────────────────────────────────

describe("renderContentBlocks", () => {
  it("renders a mermaid block as a fenced code block with language mermaid", () => {
    const block: ContentBlock = { type: "mermaid", diagram: "graph LR\nA-->B" };
    const output = renderContentBlocks([block]);
    expect(output).toContain("```mermaid");
    expect(output).toContain("graph LR");
    expect(output).toContain("A-->B");
    expect(output.trim().endsWith("```")).toBe(true);
  });

  it("renders a code block with language and title", () => {
    const block: ContentBlock = {
      type: "code",
      language: "bash",
      title: "Install",
      source: "npm install -g @smithgray/usm",
    };
    const output = renderContentBlocks([block]);
    expect(output).toContain("```bash");
    expect(output).toContain("npm install -g @smithgray/usm");
    expect(output).toContain("<!-- Install -->"); // title as comment
  });

  it("renders a tabs block with VitePress tabs containers", () => {
    const block: ContentBlock = {
      type: "tabs",
      tabs: [
        {
          label: "npm",
          content: [{ type: "code", language: "bash", source: "npm install" }],
        },
        {
          label: "pnpm",
          content: [{ type: "code", language: "bash", source: "pnpm install" }],
        },
      ],
    };
    const output = renderContentBlocks([block]);
    expect(output).toContain("::: tabs");
    expect(output).toContain("::: tab npm");
    expect(output).toContain("::: tab pnpm");
    expect(output).toContain("npm install");
    expect(output).toContain("pnpm install");
  });

  it("renders a callout block with VitePress tip container", () => {
    const block: ContentBlock = {
      type: "callout",
      variant: "tip",
      text: "Pro tip",
      content: [{ type: "paragraph", text: "Use --force to overwrite." }],
    };
    const output = renderContentBlocks([block]);
    expect(output).toContain("::: tip");
    expect(output).toContain("Pro tip");
    expect(output).toContain("Use --force to overwrite.");
    expect(output).toContain(":::");
  });

  it("renders a table block as a markdown table", () => {
    const block: ContentBlock = {
      type: "table",
      headers: ["Language", "Manifest"],
      rows: [
        ["Go", "go.mod"],
        ["Rust", "Cargo.toml"],
      ],
    };
    const output = renderContentBlocks([block]);
    expect(output).toContain("| Language | Manifest |");
    expect(output).toContain("| --- | --- |");
    expect(output).toContain("| Go | go.mod |");
    expect(output).toContain("| Rust | Cargo.toml |");
  });

  it("renders a steps block as an ordered list", () => {
    const block: ContentBlock = {
      type: "steps",
      items: [
        { text: "Install USM", code: "npm install -g @smithgray/usm" },
        { text: "Run init" },
      ],
    };
    const output = renderContentBlocks([block]);
    expect(output).toContain("1. Install USM `npm install -g @smithgray/usm`");
    expect(output).toContain("2. Run init");
  });

  it("renders a heading block with the correct level", () => {
    const block: ContentBlock = { type: "heading", level: 3, text: "Subsection" };
    const output = renderContentBlocks([block]);
    expect(output).toContain("### Subsection");
  });

  it("renders a divider block", () => {
    const block: ContentBlock = { type: "divider" };
    const output = renderContentBlocks([block]);
    expect(output.trim()).toBe("---");
  });

  it("renders a badge block as VitePress Badge component", () => {
    const block: ContentBlock = { type: "badge", variant: "info", text: "New" };
    const output = renderContentBlocks([block]);
    expect(output).toContain('<Badge type="info" text="New" />');
  });

  it("warns and skips unknown block types", () => {
    const block = { type: "banana", data: {} } as unknown as ContentBlock;
    const warnings: string[] = [];
    const output = renderContentBlocks([block], warnings);
    expect(warnings.some((w) => w.includes("Unknown content block type"))).toBe(true);
    expect(output.trim()).toBe("");
  });

  it("renders nested blocks recursively (tabs contain code blocks)", () => {
    const block: ContentBlock = {
      type: "tabs",
      tabs: [
        {
          label: "Install",
          content: [
            { type: "code", language: "bash", source: "npm install" },
            { type: "paragraph", text: "Then run init." },
          ],
        },
      ],
    };
    const output = renderContentBlocks([block]);
    expect(output).toContain("::: tab Install");
    expect(output).toContain("```bash");
    expect(output).toContain("npm install");
    expect(output).toContain("Then run init.");
  });
});

// ─── Reference page tests ──────────────────────────────────────────────────────

describe("renderReferencePage", () => {
  it("renders a page with title and inline content blocks", () => {
    const page = {
      id: "getting-started",
      title: "Getting Started",
      audience: "public" as const,
      content: [
        { type: "heading" as const, level: 2, text: "Install" },
        { type: "code" as const, language: "bash", source: "npm install -g @smithgray/usm" },
      ],
    };
    const output = renderReferencePage(page);
    expect(output).toContain("# Getting Started");
    expect(output).toContain("## Install");
    expect(output).toContain("npm install -g @smithgray/usm");
  });
});

// ─── Feature reference block tests ─────────────────────────────────────────────

describe("renderFeatureReferenceBlock", () => {
  it("renders a reference block with heading and content", () => {
    const ref: FeatureReferenceBlock = {
      heading: "Supported Frameworks",
      audience: "public",
      content: [
        {
          type: "table",
          headers: ["Framework", "Detection"],
          rows: [["Gin", "gin-gonic/gin"]],
        },
      ],
    };
    const output = renderFeatureReferenceBlock(ref);
    expect(output).toContain("## Supported Frameworks");
    expect(output).toContain("| Framework | Detection |");
    expect(output).toContain("| Gin | gin-gonic/gin |");
  });
});

// ─── Audience filtering tests ──────────────────────────────────────────────────

describe("filterBlocksByAudience", () => {
  it("keeps public blocks and drops internal blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "paragraph", text: "public block", audience: "public" },
      { type: "paragraph", text: "internal block", audience: "internal" },
      { type: "paragraph", text: "no audience block" },
    ];
    const filtered = filterBlocksByAudience(blocks, "public");
    expect(filtered.length).toBe(2);
    expect(filtered.some((b) => b.text === "public block")).toBe(true);
    expect(filtered.some((b) => b.text === "no audience block")).toBe(true);
    expect(filtered.some((b) => b.text === "internal block")).toBe(false);
  });
});

describe("filterReferenceBlocksByAudience", () => {
  it("keeps public reference blocks and drops internal ones", () => {
    const refs: FeatureReferenceBlock[] = [
      { heading: "Public Ref", audience: "public", content: [] },
      { heading: "Internal Ref", audience: "internal", content: [] },
      { heading: "No Audience Ref", content: [] },
    ];
    const filtered = filterReferenceBlocksByAudience(refs, "public");
    expect(filtered.length).toBe(2);
    expect(filtered.some((r) => r.heading === "Public Ref")).toBe(true);
    expect(filtered.some((r) => r.heading === "No Audience Ref")).toBe(true);
    expect(filtered.some((r) => r.heading === "Internal Ref")).toBe(false);
  });
});