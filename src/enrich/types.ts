// Types for the usm enrich subcommand — LLM-based semantic enrichment

/**
 * Enrichment configuration — stored in usmconfig.json under the "enrichment" key.
 */
export interface EnrichmentConfig {
  /** Whether enrichment is enabled */
  enabled: boolean;
  /** LLM provider to use */
  provider: "litellm" | "openai" | "anthropic" | "ollama";
  /** Base URL for the LLM API */
  url: string;
  /** API key (optional — some providers like local Ollama don't need one) */
  apiKey?: string;
  /** Model identifier */
  model: string;
  /** Temperature for LLM generation */
  temperature: number;
  /** Maximum tokens per file enrichment */
  max_tokens_per_file: number;
  /** Which fields to enrich (only fields with TODO: describe will be filled) */
  fields: Array<"summary" | "intent" | "decisions" | "flows" | "contracts" | "tests" | "status">;
  /** Whether to preserve hand-written content during merge */
  preserve_human_edits: boolean;
  /** Maximum chars to read from each source file (keeps context manageable) */
  max_source_file_chars: number;
}

/**
 * Result of enriching a single .usm file.
 */
export interface EnrichmentResult {
  /** Path to the .usm file */
  file: string;
  /** Whether enrichment succeeded */
  success: boolean;
  /** Fields that were filled (had TODO: describe, now have content) */
  fields_filled: string[];
  /** Fields that were preserved (had non-TODO content, kept unchanged) */
  fields_preserved: string[];
  /** Fields that were skipped (not in the target fields list or not TODO) */
  fields_skipped: string[];
  /** Token usage from the LLM response (if available) */
  tokens_used?: number;
  /** Duration of the enrichment call in ms */
  duration_ms: number;
  /** Error message (if success is false) */
  error?: string;
}

/**
 * Context built from a .usm file and its referenced source code.
 */
export interface EnrichmentContext {
  /** The parsed .usm file object */
  usmFile: Record<string, unknown>;
  /** The original YAML string */
  originalYaml: string;
  /** Source file contents (keyed by relative path) */
  sourceFiles: Record<string, string>;
  /** Which fields are TODO: describe */
  todoFields: string[];
  /** Which fields have real content */
  populatedFields: string[];
  /** Routes referenced in the file */
  routes: Array<{ path: string; type: string; http_methods: string[] }>;
}

/**
 * Options for the enrichFile function.
 */
export interface EnrichOptions {
  /** Dry run — show what would change without writing */
  dryRun?: boolean;
  /** Override which fields to enrich */
  fields?: string[];
  /** Override model */
  model?: string;
  /** Override provider */
  provider?: string;
  /** Override URL */
  url?: string;
}
