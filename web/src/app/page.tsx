"use client";

import { useState, useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const benefits = [
  { icon: "⚡", title: "Ship features faster", desc: "Less back-and-forth with agents. The spec is the contract — agents build from it, humans approve before code is written." },
  { icon: "🛡️", title: "Higher code quality", desc: "Contracts and tests defined upfront. Agents know what 'done' means before they start coding." },
  { icon: "📄", title: "Always-up-to-date docs", desc: "No more stale documentation. The spec IS the docs — written first, never an afterthought." },
  { icon: "🧠", title: "Better agent context — 10-20x fewer tokens", desc: "Stop feeding entire Obsidian vaults or codebases. USM delivers structured, high-signal context via MCP that uses ~10-20x fewer tokens while dramatically reducing hallucinations." },
];

const outputs = [
  { title: "Markdown docs", desc: "Review-quality specs with flows, contracts, and tests" },
  { title: "Mermaid diagrams", desc: "Architecture, sequence, ER, and dependency graphs" },
  { title: "OpenAPI 3.1", desc: "API specs from feature routes" },
  { title: "AGENTS.md", desc: "AI agent context with system structure" },
  { title: "Vitest specs", desc: "Test files from feature tests[] and flows[]" },
  { title: "ArchiMate / TOGAF", desc: "Enterprise architecture deliverables" },
];

const steps = [
  { num: "1", title: "Discuss", desc: "Human and agent talk about the feature", icon: "💬" },
  { num: "2", title: "Spec", desc: "Agent drafts a .usm feature spec via MCP", icon: "📝" },
  { num: "3", title: "Review", desc: "Human reviews the generated markdown", icon: "👁️" },
  { num: "4", title: "Build", desc: "Agent implements from the approved spec", icon: "🔨" },
  { num: "5", title: "Documented", desc: "The spec IS the docs — always in sync", icon: "✅" },
];

const useCases = [
  { title: "Solo devs using Cursor or Claude Code", desc: "Stop re-explaining your system to every new agent session. The .usm map gives instant context." },
  { title: "Teams adopting AI coding", desc: "Give every agent the same system context. Specs become the shared contract between human reviews and agent output." },
  { title: "Microservices & monorepos", desc: "Map services, dependencies, and features across the entire system. Auto-generate architecture diagrams." },
  { title: "Enterprise & compliance", desc: "Generate ArchiMate, TOGAF, and OpenAPI from the same source. Audit-ready architecture artifacts." },
];

const tools = [
  "Cursor", "Claude Code", "Claude Desktop", "Continue.dev", "Codex", "GitHub Copilot"
];

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setInView(true),
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={inView ? "animate-fade-in-up" : "opacity-0"}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function NodeNetwork() {
  const nodes = [
    { x: 15, y: 20 }, { x: 45, y: 10 }, { x: 75, y: 25 },
    { x: 25, y: 50 }, { x: 55, y: 45 }, { x: 85, y: 55 },
    { x: 10, y: 75 }, { x: 40, y: 80 }, { x: 70, y: 70 },
    { x: 90, y: 85 },
  ];
  const lines = [
    [0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,8],[6,7],[7,8],[8,9],[7,9]
  ];
  return (
    <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
      {lines.map(([a, b], i) => (
        <line
          key={i}
          x1={`${nodes[a].x}%`} y1={`${nodes[a].y}%`}
          x2={`${nodes[b].x}%`} y2={`${nodes[b].y}%`}
          stroke="white" strokeWidth="0.5" className="node-line"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
      {nodes.map((n, i) => (
        <circle
          key={i}
          cx={`${n.x}%`} cy={`${n.y}%`}
          r="3" fill="white"
          className="node-pulse"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}
    </svg>
  );
}

function CopyableCode({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      {label && <div className="text-xs text-muted-foreground mb-1">{label}</div>}
      <div className="bg-muted rounded px-4 py-2 font-mono text-sm flex items-center justify-between">
        <code className="text-foreground">{code}</code>
        <button onClick={copy} className="copy-btn opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-foreground ml-2">
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
          <a href="/" className="font-semibold tracking-tight text-lg">USM</a>
          <div className="flex items-center gap-4 text-sm">
            <a href="https://docs.usm.dev" className="text-muted-foreground hover:text-foreground transition-colors">Docs</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className="text-muted-foreground hover:text-foreground transition-colors">GitHub</a>
            <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "sm" })}>Get Started</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <NodeNetwork />
        <div className="relative mx-auto max-w-5xl px-6 py-28 text-center">
          <Badge variant="secondary" className="mb-6">Alpha v0.1.0 — Free &amp; open source</Badge>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            The shared brain for<br />human + AI coding
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Write specs first. Agents build from them. Docs stay perfectly in sync —
            using far fewer tokens than bloated Markdown vaults.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground mb-10">
            <span>✅ Spec-first workflow</span>
            <span>✅ 12 MCP tools for AI agents</span>
            <span>✅ Works with Cursor, Claude Code, Codex</span>
            <span>✅ 10-20x fewer tokens</span>
          </div>
          <div className="flex items-center justify-center gap-4">
            <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Install Now</a>
            <a href="#see-it" className={buttonVariants({ size: "lg", variant: "outline" })}>Try in 60 seconds</a>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <FadeIn>
            <h2 className="text-3xl font-semibold text-center mb-8">Sound familiar?</h2>
          </FadeIn>
          <div className="space-y-4 text-left max-w-xl mx-auto mb-8">
            {[
              { icon: "😤", text: "You spend the first 10 minutes of every agent session re-explaining your system architecture" },
              { icon: "🔄", text: "You iterate in chat, the agent gets it wrong, and the discussion is lost forever" },
              { icon: "📄", text: "Your docs went stale 3 sprints ago and nobody has time to update them" },
              { icon: "🔍", text: "You can't remember what the agent was supposed to build vs what it actually built" },
              { icon: "💸", text: "You're burning thousands of tokens feeding your entire codebase to agents for context" },
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="flex gap-3 items-start">
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <p className="text-muted-foreground">{item.text}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={500}>
            <div className="text-center max-w-md mx-auto p-6 border border-border rounded-lg bg-muted/50">
              <div className="text-4xl font-bold mb-1">10,000+</div>
              <div className="text-sm text-muted-foreground">tokens wasted per agent session re-establishing context that USM provides in &lt;500</div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <FadeIn>
          <h2 className="text-3xl font-semibold text-center mb-4">USM inverts the loop</h2>
          <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
            Don&apos;t write docs after the code. Write the spec first, then build from it.
          </p>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <FadeIn key={step.num} delay={i * 150}>
              <div className="relative">
                <Card className="h-full hover:border-foreground/20 transition-colors">
                  <CardHeader>
                    <div className="text-2xl mb-1">{step.icon}</div>
                    <div className="text-xs font-mono text-muted-foreground">STEP {step.num}</div>
                    <CardTitle className="text-base mt-1">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </CardContent>
                </Card>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 text-muted-foreground/50">→</div>
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <FadeIn>
            <h2 className="text-3xl font-semibold text-center mb-4">What you get</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              Less time re-explaining. Fewer review cycles. Docs that match the code.
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {benefits.map((b, i) => (
              <FadeIn key={b.title} delay={i * 100}>
                <Card className="h-full hover:border-foreground/20 transition-colors">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{b.icon}</span>
                      <CardTitle className="text-base">{b.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{b.desc}</p>
                  </CardContent>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Token Comparison */}
      <section className="mx-auto max-w-4xl px-6 py-24">
        <FadeIn>
          <h2 className="text-3xl font-semibold text-center mb-4">Stop wasting tokens</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            USM delivers structured, high-signal context via MCP. No more feeding entire vaults or codebases to agents.
          </p>
        </FadeIn>
        <FadeIn delay={200}>
          <div className="overflow-x-auto">
            <table className="token-table w-full">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Tokens / Session</th>
                  <th>Context Quality</th>
                  <th>Maintenance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">Raw Markdown / Obsidian</td>
                  <td className="text-muted-foreground">Very High</td>
                  <td className="text-muted-foreground">Noisy</td>
                  <td className="text-muted-foreground">Manual</td>
                </tr>
                <tr>
                  <td className="font-medium">Full Codebase</td>
                  <td className="text-muted-foreground">Extreme</td>
                  <td className="text-muted-foreground">Overwhelming</td>
                  <td className="text-muted-foreground">None</td>
                </tr>
                <tr className="bg-foreground/5">
                  <td className="font-bold">USM + MCP</td>
                  <td className="font-bold">Low</td>
                  <td className="font-bold">High-signal</td>
                  <td className="font-bold">Automatic</td>
                </tr>
              </tbody>
            </table>
          </div>
        </FadeIn>
      </section>

      {/* Tool Logos */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <FadeIn>
            <p className="text-sm text-muted-foreground mb-8 uppercase tracking-wider">Works seamlessly with</p>
            <div className="flex flex-wrap justify-center gap-8">
              {tools.map((tool) => (
                <span key={tool} className="text-lg font-medium text-muted-foreground hover:text-foreground transition-colors cursor-default">
                  {tool}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-6">Any MCP-compatible AI coding tool</p>
          </FadeIn>
        </div>
      </section>

      {/* Before / After */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <FadeIn>
          <h2 className="text-3xl font-semibold text-center mb-12">Before USM vs With USM</h2>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FadeIn>
            <Card className="border-muted-foreground/20 h-full">
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">Without USM</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>❌ Describe feature in chat → agent codes → discussion lost</li>
                  <li>❌ Re-explain system context every session</li>
                  <li>❌ Docs drift from code within days</li>
                  <li>❌ No way to review what agent will build before it builds</li>
                  <li>❌ Agent hallucinates patterns that don&apos;t exist</li>
                  <li>❌ Burn thousands of tokens on full codebase context</li>
                </ul>
              </CardContent>
            </Card>
          </FadeIn>
          <FadeIn delay={150}>
            <Card className="border-foreground/30 h-full">
              <CardHeader>
                <CardTitle className="text-base">With USM</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Agent drafts spec → human reviews → agent builds</li>
                  <li>✅ Agent reads system map via MCP before starting</li>
                  <li>✅ Spec IS the docs — written first, never stale</li>
                  <li>✅ Review the markdown before any code is written</li>
                  <li>✅ Agent follows established patterns from .usm files</li>
                  <li>✅ Structured MCP context — 10-20x fewer tokens</li>
                </ul>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </section>

      {/* What You Get */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <FadeIn>
            <h2 className="text-3xl font-semibold text-center mb-4">One source, many outputs</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              A single .usm/ directory generates all of these. Derive everything from one source.
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outputs.map((out, i) => (
              <FadeIn key={out.title} delay={i * 80}>
                <Card className="h-full hover:border-foreground/20 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-base">{out.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{out.desc}</p>
                  </CardContent>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* See It In Action */}
      <section id="see-it" className="mx-auto max-w-3xl px-6 py-24">
        <FadeIn>
          <h2 className="text-3xl font-semibold text-center mb-4">See it in action</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Install in 60 seconds. Scan your codebase. Generate docs. Serve locally.
          </p>
        </FadeIn>
        <FadeIn delay={200}>
          <div className="space-y-3 max-w-md mx-auto">
            <CopyableCode label="Install" code="npm install -g @smithgray/usm" />
            <CopyableCode label="Initialize" code="usm init" />
            <CopyableCode label="Scan codebase" code="usm scan" />
            <CopyableCode label="Generate docs" code="usm generate" />
            <CopyableCode label="Serve docs locally" code="usm docs serve" />
            <CopyableCode label="Start MCP server" code="usm mcp serve" />
          </div>
        </FadeIn>
        <div className="text-center mt-10">
          <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Try it in 60 seconds →</a>
        </div>
      </section>

      {/* Use Cases */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <FadeIn>
            <h2 className="text-3xl font-semibold text-center mb-4">Who is it for?</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              If you use AI agents to write code, USM gives you a shared artifact between human intent and agent output.
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {useCases.map((uc, i) => (
              <FadeIn key={uc.title} delay={i * 100}>
                <Card className="h-full hover:border-foreground/20 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-base">{uc.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{uc.desc}</p>
                  </CardContent>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <FadeIn>
          <h2 className="text-3xl font-semibold mb-4">Start building with a spec</h2>
          <p className="text-muted-foreground mb-8">
            Free, open source, MIT licensed. Works with Cursor, Claude Code, and Codex.
            Self-hosting — your .usm files stay in your repo.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Get Started Free</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className={buttonVariants({ size: "lg", variant: "outline" })}>Star on GitHub</a>
          </div>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div>MIT © 2026 Smith &amp; Gray Pty Ltd — Alpha v0.1.0</div>
          <div className="flex items-center gap-4">
            <a href="https://docs.usm.dev" className="hover:text-foreground transition-colors">Docs</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
