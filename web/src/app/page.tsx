import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b">
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
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <Badge variant="secondary" className="mb-6">Alpha v0.1.0 — Spec-first development for AI agents</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          A shared map that humans<br />and AI agents maintain together
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Write the spec first, then build. The spec becomes the docs —
          automatically, always in sync, because it was written first.
        </p>
          <div className="flex items-center justify-center gap-4">
            <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Get Started</a>
            <a href="https://docs.usm.dev" className={buttonVariants({ size: "lg", variant: "outline" })}>View Docs</a>
          </div>
      </section>

      {/* Problem */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold mb-6">The problem</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Agentic coding has no shared artifact between human intent and agent
            output. The human describes what they want in chat. The agent writes
            code. The code is the only artifact. If the agent gets it wrong, you
            iterate in chat — and the discussion is lost. Meanwhile, docs go stale
            because nobody updates them after the code changes.
          </p>
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-3xl font-semibold text-center mb-4">The spec-first workflow</h2>
        <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
          USM inverts the loop. Don&apos;t write docs after the code — write the spec first,
          then build from it.
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

      {/* What USM Generates */}
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

      {/* Quick Start */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-3xl font-semibold text-center mb-12">Quick start</h2>
        <div className="bg-muted rounded-lg p-6 font-mono text-sm space-y-3">
          <div><span className="text-muted-foreground"># Install</span></div>
          <div><span className="text-primary">npm install</span> -g <span className="text-accent-foreground">@~usm/core</span></div>
          <div className="pt-2"><span className="text-muted-foreground"># Initialize a .usm/ scope</span></div>
          <div><span className="text-primary">usm</span> init</div>
          <div className="pt-2"><span className="text-muted-foreground"># Scan your codebase</span></div>
          <div><span className="text-primary">usm</span> scan</div>
          <div className="pt-2"><span className="text-muted-foreground"># Generate docs</span></div>
          <div><span className="text-primary">usm</span> generate</div>
          <div className="pt-2"><span className="text-muted-foreground"># Serve docs locally with VitePress</span></div>
          <div><span className="text-primary">usm</span> docs serve</div>
          <div className="pt-2"><span className="text-muted-foreground"># Start the MCP server for AI agents</span></div>
          <div><span className="text-primary">usm</span> mcp serve</div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold mb-4">Start building with a spec</h2>
          <p className="text-muted-foreground mb-8">
            USM is MIT licensed, self-hosting, and works with Cursor, Claude Code, and Codex.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a href="https://docs.usm.dev/getting-started" className={buttonVariants({ size: "lg" })}>Get Started</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className={buttonVariants({ size: "lg", variant: "outline" })}>View on GitHub</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div>MIT © 2026 Smith & Gray Pty Ltd</div>
          <div className="flex items-center gap-4">
            <a href="https://docs.usm.dev" className="hover:text-foreground transition-colors">Docs</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
