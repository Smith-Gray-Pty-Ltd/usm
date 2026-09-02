"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────
type SpanKind =
  | "prompt"    // green $
  | "cmd"       // blue usm
  | "subcmd"    // purple draft_feature
  | "flag"      // cyan --summary
  | "string"    // yellow 'Login with email'
  | "cont"      // dim \
  | "success"   // green ✓ + green value
  | "error"     // red ✗ + red
  | "warn"      // yellow ⚠
  | "skip"      // dim ⊘
  | "arrow"     // yellow →
  | "info"      // cyan key
  | "dim"       // muted secondary
  | "bold"      // bold label
  | "metric"    // magenta count
  | "plain";

interface Span {
  text: string;
  kind: SpanKind;
}

interface Line {
  spans: Span[];
  // delay before this line appears (ms after scene start)
  delay: number;
}

interface Scene {
  name: string;
  lines: Line[];
  // total hold time after all lines shown before next scene (ms)
  holdAfter: number;
}

// ─── Color classes (mirror src/cli/colors.ts palette) ───────────────────────
const COLOR: Record<SpanKind, string> = {
  prompt:  "text-green-500 font-bold",
  cmd:     "text-blue-400",
  subcmd:  "text-purple-400",
  flag:    "text-cyan-400",
  string:  "text-yellow-300",
  cont:    "text-muted-foreground",
  success: "text-green-400",
  error:   "text-red-400",
  warn:    "text-yellow-400",
  skip:    "text-muted-foreground",
  arrow:   "text-yellow-400",
  info:    "text-cyan-400",
  dim:     "text-muted-foreground",
  bold:    "text-foreground font-semibold",
  metric:  "text-fuchsia-400",
  plain:   "text-foreground",
};

// ─── Scenes (real USM CLI output, colorized to match the actual CLI) ─────────
// Every scene is padded to TARGET_LINES so the terminal fills consistently
// regardless of how many real output lines a command produces. Padding lines
// are blank and appear instantly (delay 0) before the first real line, so the
// content pins to the bottom of the terminal and the terminal always looks full.
const TARGET_LINES = 14;

const blankLine = (): Line => ({ delay: 0, spans: [{ text: "", kind: "plain" }] });

function padScene(scene: Scene): Scene {
  if (scene.lines.length >= TARGET_LINES) return scene;
  const padding = TARGET_LINES - scene.lines.length;
  return { ...scene, lines: [...Array(padding).fill(0).map(blankLine), ...scene.lines] };
}

const scenes: Scene[] = ([
  // Scene 1: draft_feature (the spec-first workflow)
  {
    name: "draft_feature",
    holdAfter: 3000,
    lines: [
      { delay: 0,   spans: [
        { text: "$ ", kind: "prompt" },
        { text: "usm", kind: "cmd" },
        { text: " ", kind: "plain" },
        { text: "draft_feature", kind: "subcmd" },
        { text: " \\", kind: "cont" },
      ]},
      { delay: 400, spans: [
        { text: "    ", kind: "plain" },
        { text: "--summary", kind: "flag" },
        { text: " ", kind: "plain" },
        { text: "'Login with email'", kind: "string" },
        { text: " \\", kind: "cont" },
      ]},
      { delay: 800, spans: [
        { text: "    ", kind: "plain" },
        { text: "--flows", kind: "flag" },
        { text: " ", kind: "plain" },
        { text: "'[{\"id\":\"login\",\"steps\":[...]}]'", kind: "string" },
      ]},
      { delay: 1400, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 1700, spans: [
        { text: "✓ ", kind: "success" },
        { text: "validation_status: ", kind: "plain" },
        { text: "valid", kind: "success" },
      ]},
      { delay: 2000, spans: [
        { text: "✓ ", kind: "success" },
        { text: "yaml: ", kind: "plain" },
        { text: "247 bytes generated", kind: "info" },
      ]},
      { delay: 2300, spans: [
        { text: "✓ ", kind: "success" },
        { text: "markdown: ", kind: "plain" },
        { text: "1.2kb preview ready", kind: "info" },
      ]},
      { delay: 2700, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 3000, spans: [
        { text: "→ ", kind: "arrow" },
        { text: "Show human the markdown for review...", kind: "plain" },
      ]},
    ],
  },

  // Scene 2: scan (with spinner + results)
  {
    name: "scan",
    holdAfter: 3500,
    lines: [
      { delay: 0, spans: [
        { text: "$ ", kind: "prompt" },
        { text: "usm", kind: "cmd" },
        { text: " ", kind: "plain" },
        { text: "scan", kind: "subcmd" },
      ]},
      { delay: 300, spans: [
        { text: "⠋ ", kind: "info" },
        { text: "Scanning codebase...", kind: "dim" },
      ]},
      { delay: 1500, spans: [
        { text: "✓ ", kind: "success" },
        { text: "Scan complete in ", kind: "plain" },
        { text: "847ms", kind: "metric" },
      ]},
      { delay: 1800, spans: [
        { text: "  Services found:  ", kind: "plain" },
        { text: "3", kind: "metric" },
      ]},
      { delay: 2000, spans: [
        { text: "  Packages found:  ", kind: "plain" },
        { text: "2", kind: "metric" },
      ]},
      { delay: 2200, spans: [
        { text: "  Data models:     ", kind: "plain" },
        { text: "8", kind: "metric" },
      ]},
      { delay: 2400, spans: [
        { text: "  Features found:  ", kind: "plain" },
        { text: "12", kind: "metric" },
      ]},
      { delay: 2700, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 2900, spans: [
        { text: "Files written:", kind: "bold" },
      ]},
      { delay: 3100, spans: [
        { text: "  ├─ .usm/", kind: "dim" },
      ]},
      { delay: 3200, spans: [
        { text: "  │  ├─ system.usm", kind: "dim" },
      ]},
      { delay: 3300, spans: [
        { text: "  │  ├─ services/", kind: "dim" },
      ]},
      { delay: 3400, spans: [
        { text: "  │  │  ├─ api.usm", kind: "dim" },
      ]},
      { delay: 3500, spans: [
        { text: "  │  │  └─ web.usm", kind: "dim" },
      ]},
    ],
  },

  // Scene 3: generate (progress + file writes)
  {
    name: "generate",
    holdAfter: 3500,
    lines: [
      { delay: 0, spans: [
        { text: "$ ", kind: "prompt" },
        { text: "usm", kind: "cmd" },
        { text: " ", kind: "plain" },
        { text: "generate", kind: "subcmd" },
      ]},
      { delay: 300, spans: [
        { text: "Found ", kind: "plain" },
        { text: "51", kind: "metric" },
        { text: " .usm file(s)", kind: "plain" },
      ]},
      { delay: 500, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 700, spans: [
        { text: "Generating |████████████████░░░░| 75% | 38/51", kind: "info" },
      ]},
      { delay: 1500, spans: [
        { text: "Generating |████████████████████| 100% | 51/51", kind: "success" },
      ]},
      { delay: 1900, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 2100, spans: [
        { text: "→ ", kind: "arrow" },
        { text: ".usm-workspace/docs/features/login.md", kind: "dim" },
      ]},
      { delay: 2300, spans: [
        { text: "→ ", kind: "arrow" },
        { text: ".usm-workspace/docs/architecture.md", kind: "dim" },
      ]},
      { delay: 2500, spans: [
        { text: "→ ", kind: "arrow" },
        { text: ".usm-workspace/openapi.yaml", kind: "dim" },
      ]},
      { delay: 2700, spans: [
        { text: "→ ", kind: "arrow" },
        { text: ".usm-workspace/tests/login.spec.ts", kind: "dim" },
      ]},
      { delay: 2900, spans: [
        { text: "→ ", kind: "arrow" },
        { text: "AGENTS.md ", kind: "dim" },
        { text: "(agents-md)", kind: "dim" },
      ]},
      { delay: 3300, spans: [
        { text: "✓ ", kind: "success" },
        { text: "51 files generated", kind: "plain" },
      ]},
    ],
  },

  // Scene 4: query (impact analysis)
  {
    name: "query",
    holdAfter: 4000,
    lines: [
      { delay: 0, spans: [
        { text: "$ ", kind: "prompt" },
        { text: "usm", kind: "cmd" },
        { text: " ", kind: "plain" },
        { text: "query", kind: "subcmd" },
        { text: " ", kind: "plain" },
        { text: '"features where status = planned"', kind: "string" },
      ]},
      { delay: 800, spans: [
        { text: "usm/cli-docs", kind: "info" },
        { text: "  ", kind: "plain" },
        { text: "[planned]", kind: "dim" },
        { text: "  ", kind: "plain" },
        { text: "usm docs serve and usm docs build...", kind: "dim" },
      ]},
      { delay: 1200, spans: [
        { text: "usm/mkt-language-tabs", kind: "info" },
        { text: "  ", kind: "plain" },
        { text: "[planned]", kind: "dim" },
        { text: "  ", kind: "plain" },
        { text: "Marketing site language carousel...", kind: "dim" },
      ]},
      { delay: 1600, spans: [
        { text: "usm/cli-color-output", kind: "info" },
        { text: "  ", kind: "plain" },
        { text: "[planned]", kind: "dim" },
        { text: "  ", kind: "plain" },
        { text: "Colorized CLI output with spinners...", kind: "dim" },
      ]},
      { delay: 2000, spans: [
        { text: "usm/structurizr-bridge", kind: "info" },
        { text: "  ", kind: "plain" },
        { text: "[planned]", kind: "dim" },
        { text: "  ", kind: "plain" },
        { text: "Import Structurizr, export DSL...", kind: "dim" },
      ]},
      { delay: 2500, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 2700, spans: [
        { text: "4", kind: "metric" },
        { text: " match(es) across ", kind: "plain" },
        { text: "51", kind: "metric" },
        { text: " file(s)", kind: "plain" },
      ]},
    ],
  },

  // Scene 5: validate (pass + fail)
  {
    name: "validate",
    holdAfter: 3500,
    lines: [
      { delay: 0, spans: [
        { text: "$ ", kind: "prompt" },
        { text: "usm", kind: "cmd" },
        { text: " ", kind: "plain" },
        { text: "validate", kind: "subcmd" },
        { text: " .usm/", kind: "string" },
      ]},
      { delay: 500, spans: [
        { text: "✓ ", kind: "success" },
        { text: ".usm/system.usm", kind: "dim" },
      ]},
      { delay: 800, spans: [
        { text: "✓ ", kind: "success" },
        { text: ".usm/services/cli.usm", kind: "dim" },
      ]},
      { delay: 1100, spans: [
        { text: "✓ ", kind: "success" },
        { text: ".usm/services/mcp.usm", kind: "dim" },
      ]},
      { delay: 1400, spans: [
        { text: "✓ ", kind: "success" },
        { text: ".usm/features/cli/scan.usm", kind: "dim" },
      ]},
      { delay: 1700, spans: [
        { text: "✗ ", kind: "error" },
        { text: ".usm/features/cli/broken.usm", kind: "dim" },
      ]},
      { delay: 2000, spans: [
        { text: "  ", kind: "plain" },
        { text: "flows[0].steps[2].action: ", kind: "dim" },
        { text: "must be string", kind: "error" },
      ]},
      { delay: 2400, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 2600, spans: [
        { text: "47 ", kind: "success" },
        { text: "valid, ", kind: "plain" },
        { text: "0 ", kind: "warn" },
        { text: "warnings, ", kind: "plain" },
        { text: "1 ", kind: "error" },
        { text: "errors", kind: "plain" },
      ]},
    ],
  },

  // Scene 6: info (system overview)
  {
    name: "info",
    holdAfter: 3500,
    lines: [
      { delay: 0, spans: [
        { text: "$ ", kind: "prompt" },
        { text: "usm", kind: "cmd" },
        { text: " ", kind: "plain" },
        { text: "info", kind: "subcmd" },
        { text: " .usm/system.usm", kind: "string" },
      ]},
      { delay: 500, spans: [
        { text: "ID:       ", kind: "bold" },
        { text: "usm/system", kind: "info" },
      ]},
      { delay: 700, spans: [
        { text: "Type:     ", kind: "bold" },
        { text: "system", kind: "info" },
      ]},
      { delay: 900, spans: [
        { text: "Version:  ", kind: "bold" },
        { text: "1", kind: "metric" },
      ]},
      { delay: 1100, spans: [
        { text: "Updated:  ", kind: "bold" },
        { text: "2026-08-26", kind: "dim" },
      ]},
      { delay: 1300, spans: [
        { text: "Summary:  ", kind: "bold" },
        { text: "Universal System Map — structured source of truth...", kind: "plain" },
      ]},
      { delay: 1700, spans: [
        { text: "", kind: "plain" },
      ]},
      { delay: 1900, spans: [
        { text: "Identity: ", kind: "bold" },
        { text: "USM ", kind: "info" },
        { text: "(usm.dev)", kind: "dim" },
      ]},
      { delay: 2200, spans: [
        { text: "Features: ", kind: "bold" },
        { text: "37", kind: "metric" },
      ]},
      { delay: 2500, spans: [
        { text: "Services: ", kind: "bold" },
        { text: "2", kind: "metric" },
      ]},
    ],
  },
] as Scene[]).map(padScene);

// ─── Spinner frames (mirror ora "dots" preset) ─────────────────────────────
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ─── Component ──────────────────────────────────────────────────────────────
export function CliAnimation() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const scene = scenes[sceneIdx];

  return (
    <ScenePlayer
      key={sceneIdx}
      scene={scene}
      onAdvance={() => setSceneIdx((prev) => (prev + 1) % scenes.length)}
    />
  );
}

function ScenePlayer({ scene, onAdvance }: { scene: Scene; onAdvance: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all pending timers
  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  // Play a scene: reveal lines by their delay, then advance after holdAfter
  useEffect(() => {
    const maxDelay = Math.max(...scene.lines.map((l) => l.delay));

    // Schedule each line reveal
    scene.lines.forEach((_, i) => {
      const t = setTimeout(() => setVisibleLines(i + 1), scene.lines[i].delay);
      timersRef.current.push(t);
    });

    // Schedule scene advance
    const advance = setTimeout(onAdvance, maxDelay + scene.holdAfter);
    timersRef.current.push(advance);

    return clearTimers;
  }, [scene, onAdvance]);

  // Spinner animation: only tick when a spinner line is the latest visible line
  const latestLine = scene.lines[visibleLines - 1];
  const isSpinning = latestLine?.spans.some((s) => s.text === "⠋ ");

  useEffect(() => {
    if (!isSpinning) return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isSpinning]);

  return (
    <div
      className="bg-card border border-border rounded-lg overflow-hidden shadow-2xl flex flex-col h-[380px]"
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-muted-foreground font-mono ml-2">terminal — usm</span>
      </div>

      {/* Terminal body — fills all remaining height */}
      <div className="p-4 font-mono text-sm space-y-0.5 bg-muted/10 flex-1 overflow-hidden flex flex-col justify-end">
        {scene.lines.slice(0, visibleLines).map((line, i) => {
          // Replace spinner frame char with animated frame
          const spans = isSpinning && i === visibleLines - 1
            ? line.spans.map((s) =>
                s.text === "⠋ "
                  ? { ...s, text: `${SPINNER_FRAMES[spinnerFrame]} ` }
                  : s
              )
            : line.spans;

          return (
            <div key={i} className="leading-relaxed">
              {spans.map((span, j) => (
                <span key={j} className={COLOR[span.kind]}>
                  {span.text || "\u00A0"}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}