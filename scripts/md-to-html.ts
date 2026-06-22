#!/usr/bin/env node
// ---------------------------------------------------------------------------
// md-to-html.ts — minimal Markdown to HTML converter
// ---------------------------------------------------------------------------
// Converts all .md files in the input directory to .html files in the output
// directory. Used by the docs deploy workflow because Cloudflare Pages does
// NOT auto-render Markdown (unlike GitHub Pages).
//
// Supports a subset of Markdown that's enough for USM-generated docs:
//   - ATX headers (# ## ###)
//   - Bold/italic (* **)
//   - Inline code (`)
//   - Code blocks (```)
//   - Links ([text](url))
//   - Lists (- * 1.)
//   - Tables (| col | col |)
//   - Blockquotes (>)
//   - Mermaid code blocks (preserved as-is, rendered by mermaid.js at runtime)
//   - Horizontal rules (---)
// ---------------------------------------------------------------------------
// Usage:
//   node md-to-html.ts <input-dir> <output-dir>
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

const [, , inputDir, outputDir] = process.argv;
if (!inputDir || !outputDir) {
  console.error("Usage: md-to-html.ts <input-dir> <output-dir>");
  process.exit(1);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  // Escape first
  let html = escapeHtml(text);

  // Inline code (must be before bold/italic)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    // External links open in new tab; relative .md links get stripped
    if (/^https?:\/\//.test(url)) {
      return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    }
    // Strip .md extension for relative links
    const cleanUrl = url.replace(/\.md$/, "").replace(/\/index$/, "/");
    return `<a href="${cleanUrl}">${text}</a>`;
  });

  return html;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const output: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let inTable = false;
  let tableBuf: string[] = [];

  function flushTable() {
    if (!tableBuf.length) return;
    const rows = tableBuf
      .map((row) =>
        row
          .trim()
          .split("|")
          .slice(1, -1) // remove empty first/last from leading/trailing |
          .map((c) => c.trim()),
      )
      .filter((r) => !r.every((c) => /^[-:]+$/.test(c))); // skip separator row

    if (rows.length === 0) {
      tableBuf = [];
      inTable = false;
      return;
    }

    output.push("<table>");
    output.push("<thead>");
    output.push(
      "<tr>" + rows[0].map((c) => `<th>${renderInline(c)}</th>`).join("") + "</tr>",
    );
    output.push("</thead>");
    output.push("<tbody>");
    for (let i = 1; i < rows.length; i++) {
      output.push(
        "<tr>" +
          rows[i].map((c) => `<td>${renderInline(c)}</td>`).join("") +
          "</tr>",
      );
    }
    output.push("</tbody>");
    output.push("</table>");
    tableBuf = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      if (!inCode) {
        inCode = true;
        codeLang = line.replace(/^```/, "").trim();
        codeBuf = [];
      } else {
        // Closing fence
        if (codeLang === "mermaid") {
          output.push(
            `<pre class="mermaid">${codeBuf.join("\n")}</pre>`,
          );
        } else {
          output.push(
            `<pre><code class="language-${codeLang}">${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
          );
        }
        inCode = false;
        codeLang = "";
        codeBuf = [];
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      flushTable();
      output.push("<hr />");
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushTable();
      const level = headerMatch[1].length;
      output.push(`<h${level}>${renderInline(headerMatch[2])}</h${level}>`);
      continue;
    }

    // Table row
    if (/^\|.*\|$/.test(line)) {
      inTable = true;
      tableBuf.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Blockquote
    if (/^>\s+/.test(line)) {
      output.push(
        `<blockquote>${renderInline(line.replace(/^>\s+/, ""))}</blockquote>`,
      );
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*]\s+/.test(line)) {
      // Note: simple single-level only; USM docs don't nest
      if (output.length === 0 || !output[output.length - 1].startsWith("<ul>")) {
        output.push("<ul>");
      }
      output.push(`<li>${renderInline(line.replace(/^[\s]*[-*]\s+/, ""))}</li>`);
      // Check next line
      if (
        i + 1 >= lines.length ||
        !/^[\s]*[-*]\s+/.test(lines[i + 1])
      ) {
        output.push("</ul>");
      }
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s+/.test(line)) {
      if (output.length === 0 || !output[output.length - 1].startsWith("<ol>")) {
        output.push("<ol>");
      }
      output.push(`<li>${renderInline(line.replace(/^[\s]*\d+\.\s+/, ""))}</li>`);
      if (
        i + 1 >= lines.length ||
        !/^[\s]*\d+\.\s+/.test(lines[i + 1])
      ) {
        output.push("</ol>");
      }
      continue;
    }

    // Empty line
    if (/^\s*$/.test(line)) {
      flushTable();
      continue;
    }

    // Paragraph
    output.push(`<p>${renderInline(line)}</p>`);
  }

  flushTable();

  return output.join("\n");
}

function processFile(mdPath: string, relPath: string): void {
  const content = fs.readFileSync(mdPath, "utf-8");
  const body = renderMarkdown(content);

  // Convert README.md → index.html (for directory landing pages)
  let htmlPath = relPath.replace(/\.md$/, ".html");
  if (path.basename(htmlPath) === "README.html") {
    htmlPath = path.join(path.dirname(htmlPath), "index.html");
  }

  // Wrap in a minimal HTML page with GitHub-like styling + mermaid.js
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : "Documentation";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · USM</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  if (typeof mermaid !== "undefined") {
    mermaid.initialize({ startOnLoad: true, theme: "default" });
  }
</script>
</head>
<body>
<header class="site-header">
  <a href="/">USM</a>
  <span class="tagline">Universal System Map</span>
</header>
<main class="content">
${body}
</main>
<footer class="site-footer">
  Generated by <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" target="_blank" rel="noopener">@~usm/core ${"v1.0.0"}</a>
</footer>
</body>
</html>`;

  const outPath = path.join(outputDir, htmlPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
}

function walkDir(dir: string, baseDir: string, callback: (file: string, rel: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, callback);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      callback(fullPath, path.relative(baseDir, fullPath));
    }
  }
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const files: string[] = [];
walkDir(inputDir, inputDir, (file, rel) => {
  files.push(rel);
});

for (const rel of files) {
  const fullPath = path.join(inputDir, rel);
  processFile(fullPath, rel);
  console.log(`  ${rel} → ${rel.replace(/\.md$/, ".html").replace(/README\.html$/, "index.html")}`);
}

console.log(`\nConverted ${files.length} files to HTML.`);
