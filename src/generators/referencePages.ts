// Reference pages generator — renders system.usm reference_pages[] entries
// through the generic content-block renderer.
//
// This replaces the hardcoded generateLanguageSupportDoc, generateAgentSetupGuide,
// and generateGettingStartedDoc functions. Instead of bespoke generators per
// page, system.usm declares reference_pages with inline content blocks or
// runtime sources (detectors, schema, config), and this function renders them.

import path from "node:path";
import type { SystemUsm, GenerationResult } from "../types.js";
import {
  renderReferencePage,
  type ContentBlock,
  type ReferencePage,
} from "./contentBlocks.js";
import { getDetectors } from "../scan/detectors.js";

/**
 * Generate reference pages declared on system.usm.
 * Each entry in system.usm.reference_pages[] produces a markdown page.
 * Pages with source: detectors render from the detector registry.
 * Pages with inline content[] render through the generic content-block renderer.
 *
 * Returns a GenerationResult with one output per reference page.
 * If system.usm has no reference_pages[], returns empty outputs (backward compatible).
 */
export function generateReferencePages(
  system: SystemUsm,
  root: string,
  warnings: string[] = [],
): GenerationResult {
  const refPages = (system as SystemUsm & { reference_pages?: ReferencePage[] }).reference_pages;
  if (!refPages || refPages.length === 0) {
    return { outputs: [] };
  }

  const outputs: Array<{ path: string; content: string }> = [];

  for (const page of refPages) {
    let content: ContentBlock[] = [];

    if (page.source === "detectors") {
      content = buildDetectorContentBlocks(warnings);
    } else if (page.content) {
      content = page.content;
    }

    const markdown = renderReferencePage(
      { ...page, content },
      warnings,
    );

    outputs.push({
      path: path.join(root, ".usm-workspace", "docs", `${page.id}.md`),
      content: markdown,
    });
  }

  return { outputs };
}

/**
 * Build content blocks from the detector registry.
 * Produces a table of all service-kind detectors (language, manifest, runtime,
 * frameworks) — the drift-proof replacement for the LANGUAGE_SUPPORT constant.
 */
function buildDetectorContentBlocks(_warnings: string[]): ContentBlock[] {
  const serviceDetectors = getDetectors("service");
  const dataDetectors = getDetectors("data-schema");
  const infraDetectors = getDetectors("infrastructure");

  const blocks: ContentBlock[] = [];

  // Supported languages table
  blocks.push({
    type: "heading",
    level: 2,
    text: "Supported Languages",
  });

  const headers = ["Language", "Manifest", "Runtime", "Frameworks"];
  const rows: string[][] = [];
  for (const d of serviceDetectors) {
    if (!d.language || d.language === "n/a") continue;
    const frameworks = (d.frameworks || []).map((f) => f.name).join(", ");
    rows.push([d.language, d.manifest || "", d.runtime || "", frameworks]);
  }
  blocks.push({ type: "table", headers, rows });

  // Data model detection
  if (dataDetectors.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Data Model Detection" });
    const dataRows: string[][] = [];
    for (const d of dataDetectors) {
      dataRows.push([d.$id, d.runtime || "", d.manifest || ""]);
    }
    blocks.push({
      type: "table",
      headers: ["Detector", "Runtime", "Manifest"],
      rows: dataRows,
    });
  }

  // Infrastructure detection
  if (infraDetectors.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Infrastructure Detection" });
    const infraRows: string[][] = [];
    for (const d of infraDetectors) {
      infraRows.push([d.$id, d.runtime || "", d.manifest || ""]);
    }
    blocks.push({
      type: "table",
      headers: ["Detector", "Runtime", "Manifest"],
      rows: infraRows,
    });
  }

  // Detector plugins section
  blocks.push({
    type: "heading",
    level: 2,
    text: "Detector Plugins",
  });
  blocks.push({
    type: "paragraph",
    text: "Add custom detectors by dropping YAML files in `.usm/detectors/` or adding a `detection` section to `usmconfig.json`. See the detector-v1.json schema for the file format.",
  });

  return blocks;
}