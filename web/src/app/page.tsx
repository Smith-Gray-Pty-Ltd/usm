import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const benefits = [
  { icon: "⚡", title: "Ship features faster", desc: "Less back-and-forth with agents. The spec is the contract — agents build from it, humans approve before code is written." },
  { icon: "🛡️", title: "Higher code quality", desc: "Contracts and tests defined upfront. Agents know what 'done' means before they start coding." },
  { icon: "📄", title: "Always-up-to-date docs", desc: "No more stale documentation. The spec IS the docs — written first, never an afterthought." },
  { icon: "🧠", title: "Better agent context", desc: "Agents read the system map via MCP before starting work. Fewer hallucinations, less re-explaining." },
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
  { num: "1", title: "Discuss", desc: "Human and agent talk about the feature" },
  { num: "2", title: "Spec", desc: "Agent drafts a .usm feature spec via MCP" },
  { num: "3", title: "Review", desc: "Human reviews the generated markdown" },
  { num: "4", title: "Build", desc: "Agent implements from the approved spec" },
  { num: "5", title: "Documented", desc: "The spec IS the docs — always in sync" },
];

const useCases = [
  { title: "Solo devs using Cursor or Claude Code", desc: "Stop re-explaining your system to every new agent session. The .usm map gives instant context." },
  { title: "Teams adopting AI coding", desc: "Give every agent the same system context. Specs become the shared contract between human reviews and agent output." },
  { title: "Microservices & monorepos", desc: "Map services, dependencies, and features across the entire system. Auto-generate architecture diagrams." },
  { title: "Enterprise & compliance", desc: "Generate ArchiMate, TOGAF, and OpenAPI from the same source. Audit-ready architecture artifacts." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
          <a href="/" className="font-semibold tracking-tight">USM</a>
          <div className="flex items-center gap-4 text-sm">
            <a href="https://docs.usm.dev" className="text-muted-foreground hover:text-foreground transition-colors">Docs</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className="text-muted-foreground hover:text-foreground transition-colors">GitHub</a>
            <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "sm" })}>Get Started</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <Badge variant="secondary" className="mb-6">Alpha v0.1.0 — Free &amp; open source</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          The missing shared brain<br />for human + AI coding
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Write specs once. Agents build from them. Docs stay perfectly in sync —
          automatically. No more lost discussions, stale docs, or re-explaining
          context to every new agent session.
        </p>
        <div className="flex flex-col items-center gap-2 mb-8 text-sm text-muted-foreground">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
            <span>✅ Spec-first workflow</span>
            <span>✅ 12 MCP tools for AI agents</span>
            <span>✅ Works with Cursor, Claude Code, Codex</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4">
          <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Get Started Free</a>
          <a href="https://docs.usm.dev" className={buttonVariants({ size: "lg", variant: "outline" })}>Read the Docs</a>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold mb-6">Sound familiar?</h2>
          <div className="space-y-4 text-left max-w-xl mx-auto">
            <div className="flex gap-3">
              <span className="text-xl">😤</span>
              <p className="text-muted-foreground">You spend the first 10 minutes of every agent session re-explaining your system architecture</p>
            </div>
            <div className="flex gap-3">
              <span className="text-xl">🔄</span>
              <p className="text-muted-foreground">You iterate in chat, the agent gets it wrong, and the discussion is lost forever</p>
            </div>
            <div className="flex gap-3">
              <span className="text-xl">📄</span>
              <p className="text-muted-foreground">Your docs went stale 3 sprints ago and nobody has time to update them</p>
            </div>
            <div className="flex gap-3">
              <span className="text-xl">🔍</span>
              <p className="text-muted-foreground">You can&apos;t remember what the agent was supposed to build vs what it actually built</p>
            </div>
          </div>
        </div>
      </section>

      {/* How USM Fixes It */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-3xl font-semibold text-center mb-4">USM inverts the loop</h2>
        <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
          Don&apos;t write docs after the code. Write the spec first, then build from it.
          The spec becomes the docs — automatically, always in sync, because it was written first.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <div key={step.num} className="relative">
              <Card className="h-full">
                <CardHeader>
                  <div className="text-2xl font-bold text-primary mb-1">{step.num}</div>
                  <CardTitle className="text-base">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-3 text-muted-foreground">→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Benefits & Outcomes */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-3xl font-semibold text-center mb-4">What you get</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Less time re-explaining. Fewer review cycles. Docs that match the code.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {benefits.map((b) => (
              <Card key={b.title}>
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
            ))}
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-3xl font-semibold text-center mb-12">Before USM vs With USM</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Without USM</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>❌ Describe feature in chat → agent codes → discussion lost</li>
                <li>❌ Re-explain system context every session</li>
                <li>❌ Docs drift from code within days</li>
                <li>❌ No way to review what agent will build before it builds</li>
                <li>❌ Agent hallucinates patterns that don&apos;t exist</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base text-primary">With USM</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✅ Agent drafts spec → human reviews → agent builds</li>
                <li>✅ Agent reads system map via MCP before starting</li>
                <li>✅ Spec IS the docs — written first, never stale</li>
                <li>✅ Review the markdown before any code is written</li>
                <li>✅ Agent follows established patterns from .usm files</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What You Get From One .usm/ Directory */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-3xl font-semibold text-center mb-4">One source, many outputs</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            A single .usm/ directory of YAML files generates all of these.
            Derive everything from one source so they stay in sync.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outputs.map((out) => (
              <Card key={out.title}>
                <CardHeader>
                  <CardTitle className="text-base">{out.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{out.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* See It In Action */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-3xl font-semibold text-center mb-4">See it in action</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
          A feature spec is just YAML. The agent drafts it, the human reviews the
          generated markdown, then the agent builds from it.
        </p>
        <div className="bg-muted rounded-lg p-6 font-mono text-sm space-y-3">
          <div><span className="text-muted-foreground"># Install</span></div>
          <div><span className="text-primary">npm install</span> -g <span className="text-accent-foreground">@smithgray/usm</span></div>
          <div className="pt-2"><span className="text-muted-foreground"># Initialize a .usm/ scope</span></div>
          <div><span className="text-primary">usm</span> init</div>
          <div className="pt-2"><span className="text-muted-foreground"># Scan your codebase</span></div>
          <div><span className="text-primary">usm</span> scan</div>
          <div className="pt-2"><span className="text-muted-foreground"># Generate docs, OpenAPI, Mermaid, test specs</span></div>
          <div><span className="text-primary">usm</span> generate</div>
          <div className="pt-2"><span className="text-muted-foreground"># Serve docs locally with VitePress</span></div>
          <div><span className="text-primary">usm</span> docs serve</div>
          <div className="pt-2"><span className="text-muted-foreground"># Start the MCP server for AI agents</span></div>
          <div><span className="text-primary">usm</span> mcp serve</div>
        </div>
        <div className="text-center mt-8">
          <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Try it in 60 seconds →</a>
        </div>
      </section>

      {/* Use Cases */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-3xl font-semibold text-center mb-4">Who is it for?</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            If you use AI agents to write code, USM gives you a shared artifact between
            human intent and agent output.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {useCases.map((uc) => (
              <Card key={uc.title}>
                <CardHeader>
                  <CardTitle className="text-base">{uc.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{uc.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold mb-4">Start building with a spec</h2>
        <p className="text-muted-foreground mb-8">
          Free, open source, MIT licensed. Works with Cursor, Claude Code, and Codex.
          Self-hosting — your .usm files stay in your repo.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Get Started Free</a>
          <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className={buttonVariants({ size: "lg", variant: "outline" })}>Star on GitHub</a>
        </div>
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
