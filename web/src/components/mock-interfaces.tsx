"use client";

import { useState, useEffect, useRef } from "react";

// ─── Chat model ────────────────────────────────────────────────────────────
type SpanKind =
  | "tool"     // cyan tool name (usm_*)
  | "spec"     // magenta spec reference
  | "code"     // green code
  | "path"     // dim file path
  | "dim"      // muted secondary
  | "plain"
  | "success"  // green ✓
  | "arrow";   // yellow →

interface Span { text: string; kind: SpanKind; }

type Block =
  | { type: "text"; spans: Span[] }
  | { type: "tool-call"; tool: string; result: string; }
  | { type: "file-write"; path: string; }

interface ChatMessage {
  role: "user" | "agent";
  blocks: Block[];
}

interface ChatScene {
  name: string;
  holdAfter: number;
  messages: { delay: number; message: ChatMessage }[];
}

const COLOR: Record<SpanKind, string> = {
  tool:    "text-cyan-400",
  spec:    "text-fuchsia-400",
  code:    "text-green-400",
  path:    "text-muted-foreground",
  dim:     "text-muted-foreground",
  plain:   "text-foreground",
  success: "text-green-400",
  arrow:   "text-yellow-400",
};

// ─── Chat scenes ───────────────────────────────────────────────────────────
const chatScenes: ChatScene[] = [
  {
    name: "draft_feature",
    holdAfter: 4500,
    messages: [
      {
        delay: 200,
        message: {
          role: "user",
          blocks: [{ type: "text", spans: [{ text: "Add a login with email feature", kind: "plain" }] }],
        },
      },
      {
        delay: 1400,
        message: {
          role: "agent",
          blocks: [
            { type: "text", spans: [
              { text: "Let me draft a spec first via ", kind: "plain" },
              { text: "usm_draft_feature", kind: "tool" },
              { text: ".", kind: "plain" },
            ]},
            { type: "tool-call", tool: "usm_draft_feature", result: "summary: 'Login with email' · flows: 3 · contracts: 2" },
            { type: "file-write", path: ".usm/features/auth/login.usm" },
            { type: "text", spans: [
              { text: "Implementing against the contracts — ", kind: "dim" },
              { text: "email-required", kind: "spec" },
              { text: " and ", kind: "dim" },
              { text: "rate-limit", kind: "spec" },
              { text: ".", kind: "plain" },
            ]},
            { type: "file-write", path: "src/auth/login.ts" },
          ],
        },
      },
    ],
  },
  {
    name: "generate",
    holdAfter: 4500,
    messages: [
      {
        delay: 200,
        message: {
          role: "user",
          blocks: [{ type: "text", spans: [{ text: "Ship it — generate the docs", kind: "plain" }] }],
        },
      },
      {
        delay: 1400,
        message: {
          role: "agent",
          blocks: [
            { type: "text", spans: [
              { text: "Running ", kind: "plain" },
              { text: "usm generate", kind: "tool" },
              { text: " against the .usm specs.", kind: "plain" },
            ]},
            { type: "tool-call", tool: "usm generate", result: "51 markdown · openapi.yaml · AGENTS.md · 3 vitest specs" },
            { type: "file-write", path: ".usm-workspace/docs/features/login.md" },
            { type: "file-write", path: ".usm-workspace/openapi.yaml" },
            { type: "text", spans: [
              { text: "✓ ", kind: "success" },
              { text: "Docs live at ", kind: "plain" },
              { text: "docs.usm.dev", kind: "spec" },
            ]},
          ],
        },
      },
    ],
  },
];

// ─── File explorer tree (synced with chat file-write actions) ───────────────
interface FileNode { name: string; path: string; children?: FileNode[]; isNew?: boolean; }

// Base tree (always present)
const baseTree: FileNode[] = [
  { name: ".usm", path: ".usm", children: [
    { name: "system.usm", path: ".usm/system.usm" },
    { name: "features", path: ".usm/features", children: [
      { name: "cli", path: ".usm/features/cli", children: [
        { name: "scan.usm", path: ".usm/features/cli/scan.usm" },
      ]},
    ]},
  ]},
  { name: "src", path: "src", children: [
    { name: "auth", path: "src/auth" },
    { name: "index.ts", path: "src/index.ts" },
  ]},
];

// Scene 1 adds: .usm/features/auth/login.usm + src/auth/login.ts
// Scene 2 adds: .usm-workspace/docs/features/login.md + .usm-workspace/openapi.yaml
function getTreeForScene(sceneIdx: number): FileNode[] {
  if (sceneIdx === 0) {
    return [
      { name: ".usm", path: ".usm", children: [
        { name: "system.usm", path: ".usm/system.usm" },
        { name: "features", path: ".usm/features", children: [
          { name: "auth", path: ".usm/features/auth", children: [
            { name: "login.usm", path: ".usm/features/auth/login.usm", isNew: true },
          ]},
          { name: "cli", path: ".usm/features/cli", children: [
            { name: "scan.usm", path: ".usm/features/cli/scan.usm" },
          ]},
        ]},
      ]},
      { name: "src", path: "src", children: [
        { name: "auth", path: "src/auth", children: [
          { name: "login.ts", path: "src/auth/login.ts", isNew: true },
        ]},
        { name: "index.ts", path: "src/index.ts" },
      ]},
    ];
  }
  return [
    { name: ".usm", path: ".usm", children: [
      { name: "system.usm", path: ".usm/system.usm" },
      { name: "features", path: ".usm/features", children: [
        { name: "auth", path: ".usm/features/auth", children: [
          { name: "login.usm", path: ".usm/features/auth/login.usm" },
        ]},
      ]},
    ]},
    { name: ".usm-workspace", path: ".usm-workspace", children: [
      { name: "docs", path: ".usm-workspace/docs", children: [
        { name: "features", path: ".usm-workspace/docs/features", children: [
          { name: "login.md", path: ".usm-workspace/docs/features/login.md", isNew: true },
        ]},
      ]},
      { name: "openapi.yaml", path: ".usm-workspace/openapi.yaml", isNew: true },
    ]},
    { name: "src", path: "src", children: [
      { name: "auth", path: "src/auth", children: [
        { name: "login.ts", path: "src/auth/login.ts" },
      ]},
    ]},
  ];
}

// ─── Browser doc scenes (VitePress-style) ──────────────────────────────────
type DocBlock =
  | { kind: "h1"; delay: number; text: string }
  | { kind: "h2"; delay: number; text: string }
  | { kind: "code-block"; delay: number; lines: string[] }
  | { kind: "step"; delay: number; num: number; text: string }
  | { kind: "checkbox"; delay: number; checked: boolean; text: string }
  | { kind: "spacer"; delay: number };

interface BrowserScene { name: string; url: string; blocks: DocBlock[]; holdAfter: number; }

const browserScenes: BrowserScene[] = [
  {
    name: "login-spec",
    url: "docs.usm.dev/features/auth/login",
    holdAfter: 4500,
    blocks: [
      { kind: "h1", delay: 400, text: "usm/auth-login" },
      { kind: "spacer", delay: 600 },
      { kind: "h2", delay: 800, text: "Usage" },
      { kind: "code-block", delay: 1100, lines: ["POST /api/login", "POST /api/logout"] },
      { kind: "spacer", delay: 1400 },
      { kind: "h2", delay: 1600, text: "How it works" },
      { kind: "step", delay: 1900, num: 1, text: "User submits email + password" },
      { kind: "step", delay: 2100, num: 2, text: "Validate email format + check rate limit" },
      { kind: "step", delay: 2300, num: 3, text: "Issue JWT, set session cookie" },
      { kind: "spacer", delay: 2600 },
      { kind: "h2", delay: 2800, text: "Guarantees" },
      { kind: "checkbox", delay: 3100, checked: true, text: "email must be valid format" },
      { kind: "checkbox", delay: 3300, checked: true, text: "max 5 attempts per 15 minutes" },
    ],
  },
  {
    name: "docs-index",
    url: "docs.usm.dev",
    holdAfter: 4500,
    blocks: [
      { kind: "h1", delay: 400, text: "USM — Generated Docs" },
      { kind: "spacer", delay: 600 },
      { kind: "h2", delay: 800, text: "Architecture" },
      { kind: "code-block", delay: 1100, lines: ["overview.md — system map", "architecture.mmd — Mermaid diagram"] },
      { kind: "spacer", delay: 1400 },
      { kind: "h2", delay: 1600, text: "API" },
      { kind: "step", delay: 1900, num: 1, text: "openapi.yaml — 3 routes" },
      { kind: "step", delay: 2100, num: 2, text: "auth.md — login + session" },
      { kind: "spacer", delay: 2400 },
      { kind: "h2", delay: 2600, text: "Generated from .usm specs" },
      { kind: "checkbox", delay: 2900, checked: true, text: "51 markdown files" },
      { kind: "checkbox", delay: 3100, checked: true, text: "OpenAPI spec + AGENTS.md" },
      { kind: "checkbox", delay: 3300, checked: true, text: "3 Vitest test specs" },
    ],
  },
];

// VitePress sidebar nav (static, matches the real config)
const sidebar = [
  { text: "Getting Started", items: ["Home", "Getting Started", "Agent Setup"] },
  { text: "Features", items: ["auth/login", "cli/scan", "cli/generate", "mcp/write"] },
];

// ─── Animation timing ──────────────────────────────────────────────────────
const TYPE_SPEED_MS = 55;
const SENT_PAUSE_MS = 600;

// ─── MockChat component (IDE with file explorer + chat) ────────────────────
function MockChat() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "sent" | "agent" | "hold">("typing");
  const [typedChars, setTypedChars] = useState(0);
  const [visibleAgentBlocks, setVisibleAgentBlocks] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scene = chatScenes[sceneIdx];

  const userMessage = scene.messages[0];
  const agentMessage = scene.messages[1];
  const fullPrompt = (userMessage.message.blocks[0] as { type: "text"; spans: { text: string }[] }).spans[0].text;

  // Track which file-write paths have been "written" for the explorer
  const [writtenFiles, setWrittenFiles] = useState<Set<string>>(new Set());

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  useEffect(() => {
    clearTimers();
    setPhase("typing");
    setTypedChars(0);
    setVisibleAgentBlocks(0);
    setWrittenFiles(new Set());

    for (let i = 1; i <= fullPrompt.length; i++) {
      const t = setTimeout(() => setTypedChars(i), i * TYPE_SPEED_MS);
      timersRef.current.push(t);
    }
    const typingDoneAt = fullPrompt.length * TYPE_SPEED_MS;
    const sendT = setTimeout(() => setPhase("sent"), typingDoneAt + 300);
    timersRef.current.push(sendT);
    const agentStartAt = typingDoneAt + 300 + SENT_PAUSE_MS;
    const agentT = setTimeout(() => setPhase("agent"), agentStartAt);
    timersRef.current.push(agentT);

    agentMessage.message.blocks.forEach((block, bi) => {
      const revealAt = agentStartAt + bi * 600;
      const t = setTimeout(() => {
        setVisibleAgentBlocks(bi + 1);
        if (block.type === "file-write") {
          setWrittenFiles((prev) => new Set(prev).add(block.path));
        }
      }, revealAt);
      timersRef.current.push(t);
    });

    const lastBlockAt = agentStartAt + agentMessage.message.blocks.length * 600;
    const advance = setTimeout(() => {
      setSceneIdx((prev) => (prev + 1) % chatScenes.length);
    }, lastBlockAt + scene.holdAfter);
    timersRef.current.push(advance);
    return clearTimers;
  }, [sceneIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputText = phase === "typing" ? fullPrompt.slice(0, typedChars) : "";
  const tree = getTreeForScene(sceneIdx);

  // Render file explorer tree recursively, marking files in writtenFiles as new
  function renderTree(nodes: FileNode[], depth: number): React.ReactNode {
    return nodes.map((node, i) => {
      const isNew = writtenFiles.has(node.path) || node.isNew;
      const isDir = !!node.children;
      return (
        <div key={`${node.path}-${i}`}>
          <div
            className="flex items-center gap-1 text-[11px] py-0.5"
            style={{ paddingLeft: `${depth * 10}px` }}
          >
            <span className={isDir ? "text-muted-foreground" : "text-foreground/70"}>
              {isDir ? "▸" : "·"}
            </span>
            <span className={isDir ? "text-foreground/80 font-medium" : "text-foreground/60"}>
              {node.name}
            </span>
            {isNew && (
              <span className="text-[9px] text-green-400 font-bold ml-1 bg-green-400/10 px-1 rounded">+</span>
            )}
          </div>
          {node.children && renderTree(node.children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden shadow-2xl flex flex-col h-[380px]">
      {/* IDE title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-muted-foreground font-mono ml-2">editor — auth-app</span>
      </div>

      {/* Body: file explorer + chat, side by side */}
      <div className="flex-1 flex overflow-hidden">
        {/* File explorer sidebar */}
        <div className="w-32 border-r border-border bg-muted/20 p-2 overflow-hidden shrink-0">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-1.5 font-semibold">Explorer</div>
          {renderTree(tree, 0)}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col justify-end p-2.5 space-y-2.5 text-left">
            {/* User message — right-aligned */}
            {phase !== "typing" && (
              <div className="flex justify-end">
                <div className="max-w-[80%]">
                  <div className="text-[9px] font-semibold text-muted-foreground text-right mb-0.5">You</div>
                  <div className="text-[11px] leading-relaxed bg-blue-500/15 border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-foreground">
                    {fullPrompt}
                  </div>
                </div>
                <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold bg-muted text-muted-foreground ml-1.5 mt-3.5">
                  U
                </div>
              </div>
            )}

            {/* Agent message — left-aligned */}
            {phase !== "typing" && phase !== "sent" && (
              <div className="flex gap-1.5 items-start">
                <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold bg-blue-500/20 text-blue-400">
                  A
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-[9px] font-semibold text-blue-400">Agent</div>
                  {agentMessage.message.blocks.slice(0, visibleAgentBlocks).map((block, bi) => {
                    if (block.type === "text") {
                      return (
                        <div key={bi} className="text-[11px] leading-relaxed">
                          {block.spans.map((span, sj) => (
                            <span key={sj} className={COLOR[span.kind]}>
                              {span.text}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    if (block.type === "tool-call") {
                      return (
                        <div key={bi} className="text-[10px] font-mono bg-muted/50 border border-border rounded px-1.5 py-1">
                          <span className="text-cyan-400">⚙ {block.tool}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span className="text-foreground">{block.result}</span>
                        </div>
                      );
                    }
                    if (block.type === "file-write") {
                      return (
                        <div key={bi} className="text-[10px] font-mono flex items-center gap-1">
                          <span className="text-green-400">✓</span>
                          <span className="text-muted-foreground">{block.path}</span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-border p-2 bg-muted/20">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border">
              {phase === "typing" ? (
                <span className="text-[11px] text-foreground flex-1 font-mono flex items-center">
                  <span className="min-w-0">{inputText}</span>
                  <span className="inline-block w-px h-3 bg-foreground/80 align-middle animate-pulse shrink-0" />
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground flex-1 font-mono flex items-center">
                  <span className="inline-block w-px h-3 bg-foreground/60 align-middle animate-pulse shrink-0" />
                  <span className="ml-1.5">Ask, edit, or run a command...</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MockBrowser component (VitePress-style docs) ───────────────────────────
function MockBrowser() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [visibleBlocks, setVisibleBlocks] = useState(0);
  const [currentUrl, setCurrentUrl] = useState("");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scene = browserScenes[sceneIdx];

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  useEffect(() => {
    clearTimers();
    setVisibleBlocks(0);
    setCurrentUrl(scene.url);
    scene.blocks.forEach((block, i) => {
      const t = setTimeout(() => setVisibleBlocks(i + 1), block.delay);
      timersRef.current.push(t);
    });
    const maxDelay = Math.max(...scene.blocks.map((b) => b.delay));
    const advance = setTimeout(() => {
      setSceneIdx((prev) => (prev + 1) % browserScenes.length);
    }, maxDelay + scene.holdAfter);
    timersRef.current.push(advance);
    return clearTimers;
  }, [sceneIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden shadow-2xl flex flex-col h-[380px]">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 mx-3 px-3 py-1 rounded bg-muted text-[11px] font-mono text-muted-foreground truncate">
          {currentUrl || "\u00A0"}
        </div>
      </div>

      {/* VitePress-style body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-28 border-r border-border bg-muted/20 p-2 overflow-hidden shrink-0 text-left">
          <div className="text-[10px] font-bold text-foreground mb-1.5">USM</div>
          {sidebar.map((section, si) => (
            <div key={si} className="mb-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5 font-semibold text-left">{section.text}</div>
              {section.items.map((item, ii) => (
                <div key={ii} className="text-[10px] text-muted-foreground hover:text-foreground py-0.5 pl-1.5 text-left">
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden p-3 text-left">
          <div className="space-y-1.5">
            {scene.blocks.slice(0, visibleBlocks).map((block, i) => {
              if (block.kind === "spacer") return <div key={`${sceneIdx}-${i}`} className="h-1.5" />;
              if (block.kind === "h1")
                return <div key={`${sceneIdx}-${i}`} className="text-sm font-bold text-foreground">{block.text}</div>;
              if (block.kind === "h2")
                return <div key={`${sceneIdx}-${i}`} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-2">{block.text}</div>;
              if (block.kind === "code-block")
                return (
                  <div key={`${sceneIdx}-${i}`} className="bg-muted/50 border border-border rounded px-2 py-1.5 space-y-0.5">
                    {block.lines.map((line, li) => (
                      <div key={li} className="text-[10px] font-mono text-foreground/80">{line}</div>
                    ))}
                  </div>
                );
              if (block.kind === "step")
                return (
                  <div key={`${sceneIdx}-${i}`} className="text-[10px] flex gap-1.5">
                    <span className="text-muted-foreground/60 font-mono">{block.num}.</span>
                    <span className="text-foreground/70">{block.text}</span>
                  </div>
                );
              if (block.kind === "checkbox")
                return (
                  <div key={`${sceneIdx}-${i}`} className="text-[10px] flex gap-1.5 items-start">
                    <span className={block.checked ? "text-green-400" : "text-muted-foreground/40"}>
                      {block.checked ? "☑" : "☐"}
                    </span>
                    <span className="text-foreground/70">{block.text}</span>
                  </div>
                );
              return null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Exported wrapper ──────────────────────────────────────────────────────
export function MockInterfaces() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
      <div>
        <p className="text-xs text-muted-foreground mb-2 text-center">Agentic IDE</p>
        <MockChat />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2 text-center">Live docs</p>
        <MockBrowser />
      </div>
    </div>
  );
}