"use client";

import { useState, useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LanguageCarousel } from "@/components/language-carousel";
import { ToolLogos } from "@/components/tool-logos";
import { CliAnimation } from "@/components/cli-animation";
import { MockInterfaces } from "@/components/mock-interfaces";
import usmPkg from "../../../package.json";

const USM_VERSION = usmPkg.version;
import {
  Zap, Shield, FileText, Brain, MessageSquare, FileCode,
  Eye, Hammer, CheckCircle, Copy, Check, Terminal,
  GitBranch, Building2, Users, ArrowRight, Star,
  Search, Sparkles, Wand2
} from "lucide-react";

const benefits = [
  { icon: Zap, title: "Ship features faster", desc: "Less back-and-forth with agents. The spec is the contract — agents build from it, humans approve before code is written." },
  { icon: Shield, title: "Higher code quality", desc: "Contracts and tests defined upfront. Agents know what 'done' means before they start coding." },
  { icon: FileText, title: "Always-up-to-date docs", desc: "No more stale documentation. The spec IS the docs — written first, never an afterthought." },
  { icon: Brain, title: "10-20x fewer tokens", desc: "Stop feeding entire Obsidian vaults or codebases. USM delivers structured, high-signal context via MCP that uses ~10-20x fewer tokens while reducing hallucinations." },
];

const outputs = [
  { title: "Markdown docs", desc: "Review-quality specs with flows, contracts, and tests" },
  { title: "Mermaid diagrams", desc: "Architecture, sequence, ER, and dependency graphs" },
  { title: "OpenAPI 3.1", desc: "API specs from feature routes" },
  { title: "AGENTS.md", desc: "AI agent context with system structure" },
  { title: "Vitest specs", desc: "Test files from feature tests[] and flows[]" },
  { title: "ArchiMate / TOGAF", desc: "Enterprise architecture deliverables" },
];

const devLoopSteps = [
  { num: "01", title: "Discuss", desc: "Human and agent talk about the feature", icon: MessageSquare },
  { num: "02", title: "Spec", desc: "Agent drafts a .usm feature spec via MCP", icon: FileCode },
  { num: "03", title: "Review", desc: "Human reviews the generated markdown", icon: Eye },
  { num: "04", title: "Build", desc: "Agent implements from the approved spec", icon: Hammer },
  { num: "05", title: "Documented", desc: "The spec IS the docs — always in sync", icon: CheckCircle },
];

const onboardSteps = [
  { num: "01", title: "Init", desc: "Analyze repo, generate usmconfig.json", icon: Terminal, cmd: "usm init" },
  { num: "02", title: "Scan", desc: "Detect services, routes, data models across 12 languages", icon: Search, cmd: "usm scan" },
  { num: "03", title: "Enrich", desc: "Fill TODO placeholders with LLM (optional)", icon: Sparkles, cmd: "usm enrich" },
  { num: "04", title: "Generate", desc: "Produce docs, OpenAPI, Mermaid, test specs", icon: FileCode, cmd: "usm generate" },
];

const useCases = [
  { icon: Terminal, title: "Solo devs using Cursor or Claude Code", desc: "Stop re-explaining your system to every new agent session. The .usm map gives instant context." },
  { icon: Users, title: "Teams adopting AI coding", desc: "Give every agent the same system context. Specs become the shared contract between human reviews and agent output." },
  { icon: GitBranch, title: "Microservices & monorepos", desc: "Map services, dependencies, and features across the entire system. Auto-generate architecture diagrams." },
  { icon: Building2, title: "Enterprise & compliance", desc: "Generate ArchiMate, TOGAF, and OpenAPI from the same source. Audit-ready architecture artifacts." },
];

const tools = [
  "Cursor", "Claude Code", "Claude Desktop", "Codex", "GitHub Copilot",
  "Grok Code", "OpenCode", "Windsurf", "Continue.dev", "Zed",
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

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`${inView ? "animate-fade-in-up" : "opacity-0"} ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group relative">
      <div className="bg-card border border-border rounded-lg px-4 py-2.5 font-mono text-sm flex items-center justify-between">
        <span className="text-foreground">{code}</span>
        <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/usm-logo.svg" alt="USM" className="h-[40px] w-auto" />
          </a>
          <div className="flex items-center gap-5 text-sm">
            <a href="https://docs.usm.dev" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">Help Docs</a>
            <a href="https://dev-docs.usm.dev" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">Technical Docs</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Star className="w-4 h-4" />
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/@smithgray/usm" target="_blank" rel="noopener noreferrer" className="flex items-center transition-opacity hover:opacity-80">
              <img src="https://img.shields.io/npm/v/@smithgray/usm?label=npm&style=flat&color=525252" alt="npm version" className="h-5" />
              <img src="https://img.shields.io/npm/dt/@smithgray/usm?label=installs&style=flat&color=525252" alt="npm total installs" className="h-5 ml-1.5" />
            </a>
            <a href="https://docs.usm.dev/getting-started" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>Get Started</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/[0.03] to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-5">v{USM_VERSION} — Free &amp; open source</Badge>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5 leading-tight">
                The source of truth for human + AI software development
              </h1>
              <p className="text-lg text-muted-foreground mb-6 max-w-lg">
                .USM (Universal System Map) is a schema driven source of truth for agentic software development, that reduces token burn, persists system knowledge across coding sessions, and automatically generates, documentation and design artefacts in a spec first development cycle
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground mb-8">
                <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> 10-20x fewer tokens</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Cross session memory</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Hot loading specs/docs</span>
              </div>
              <div className="flex items-center gap-3">
                <a href="https://docs.usm.dev/getting-started" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg" })}>
                  Install Now <ArrowRight className="w-4 h-4 ml-1" />
                </a>
                <a href="#see-it" className={buttonVariants({ size: "lg", variant: "outline" })}>Try in 60 seconds</a>
              </div>
            </div>
            <FadeIn delay={200}>
              <p className="text-xs text-muted-foreground mb-2">CLI</p>
              <CliAnimation />
            </FadeIn>
          </div>
        </div>
      </section>

      <Separator />

      {/* Step 1 - Scan & Map */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <FadeIn>
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Step 1 — Scan &amp; Map</p>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3">Scans 12 languages, 30+ frameworks</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Click a language to see supported frameworks and route detection patterns.
            </p>
          </div>
        </FadeIn>
        <FadeIn delay={200}>
          <LanguageCarousel />
        </FadeIn>
      </section>

      <Separator />

      {/* Tool Logos — moved below hero */}
      <section className="bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3">Works with your editor</h2>
            <p className="text-sm text-muted-foreground mb-8">Supports 36 editors or any MCP compatible client</p>
          </FadeIn>
          <FadeIn delay={150}>
            <MockInterfaces />
          </FadeIn>
          <FadeIn delay={300}>
            <div className="mt-12">
              <ToolLogos />
              <div className="mt-8">
                <a href="https://docs.usm.dev/editor-setup" target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
                  Browse all editor setup guides <ArrowRight className="w-4 h-4 ml-1" />
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <Separator />

      {/* Problem */}
      <section className="bg-card/30">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl font-semibold text-center mb-10">Sound familiar?</h2>
          </FadeIn>
          <div className="space-y-3.5 max-w-xl mx-auto mb-8">
            {[
              "You spend the first 10 minutes of every agent session re-explaining your system",
              "You iterate in chat, the agent gets it wrong, and the discussion is lost forever",
              "Your docs went stale 3 sprints ago and nobody has time to update them",
              "You can't remember what the agent was supposed to build vs what it actually built",
              "You're burning thousands of tokens feeding your entire codebase for context",
            ].map((text, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mt-2 shrink-0" />
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={400}>
            <div className="text-center max-w-sm mx-auto p-6 border border-border rounded-lg bg-muted/30">
              <div className="text-3xl font-bold mb-1 font-mono">10,000+</div>
              <div className="text-xs text-muted-foreground">tokens wasted per agent session re-establishing context that USM provides in &lt;500</div>
            </div>
          </FadeIn>
        </div>
      </section>

      <Separator />

      {/* How It Works — Multiple Workflows */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">How it works</p>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3">Three ways to use USM</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Onboard an existing codebase, run the spec-first dev loop, or enrich specs with LLM.
            </p>
          </div>
        </FadeIn>

        {/* Workflow 1: Onboard existing codebase */}
        <FadeIn>
          <div className="mb-16">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Search className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-xl font-semibold">Onboard an existing codebase</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {onboardSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <Card key={step.num} className="h-full hover:border-foreground/30 transition-colors duration-200">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between mb-2">
                        <Icon className="w-5 h-5 text-foreground" />
                        <span className="text-xs font-mono text-muted-foreground">{step.num}</span>
                      </div>
                      <CardTitle className="text-sm">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-2">{step.desc}</p>
                      <code className="text-xs font-mono text-foreground/70 bg-muted px-1.5 py-0.5 rounded">{step.cmd}</code>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </FadeIn>

        {/* Workflow 2: Spec-first dev loop */}
        <FadeIn delay={150}>
          <div className="mb-16">
            <div className="flex items-center justify-center gap-2 mb-6">
              <FileCode className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-xl font-semibold">The spec-first dev loop</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {devLoopSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.num} className="relative">
                    <Card className="h-full hover:border-foreground/30 transition-colors duration-200">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <Icon className="w-5 h-5 text-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">{step.num}</span>
                        </div>
                        <CardTitle className="text-sm">{step.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">{step.desc}</p>
                      </CardContent>
                    </Card>
                    {i < devLoopSteps.length - 1 && (
                      <ArrowRight className="hidden md:block absolute top-1/2 -right-2.5 -translate-y-1/2 w-4 h-4 text-muted-foreground/30" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>

        {/* Workflow 3: LLM enrichment */}
        <FadeIn delay={300}>
          <div>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Wand2 className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-xl font-semibold">LLM enrichment</h3>
            </div>
            <Card className="hover:border-foreground/30 transition-colors duration-200">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-4">
                  Scanned <code className="font-mono text-foreground/70 bg-muted px-1.5 py-0.5 rounded">.usm</code> files
                  contain <code className="font-mono text-foreground/70 bg-muted px-1.5 py-0.5 rounded">TODO: describe</code>
                  placeholders. <code className="font-mono text-foreground/70 bg-muted px-1.5 py-0.5 rounded">usm enrich</code> calls
                  an LLM to fill them in with source code context — preserving all human-written content.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="border border-border rounded-md p-3">
                    <div className="font-mono text-muted-foreground mb-1">PROVIDERS</div>
                    <div>OpenAI, Anthropic, Ollama, LiteLLM</div>
                  </div>
                  <div className="border border-border rounded-md p-3">
                    <div className="font-mono text-muted-foreground mb-1">MODELS</div>
                    <div>Any OpenAI-compatible model</div>
                  </div>
                  <div className="border border-border rounded-md p-3">
                    <div className="font-mono text-muted-foreground mb-1">PRESERVES</div>
                    <div>Human-written fields</div>
                  </div>
                  <div className="border border-border rounded-md p-3">
                    <div className="font-mono text-muted-foreground mb-1">CONFIGURABLE</div>
                    <div>Fields, model, temperature</div>
                  </div>
                </div>
                <div className="mt-4">
                  <CopyBlock code="usm enrich --model gpt-4o --dry-run" />
                </div>
              </CardContent>
            </Card>
          </div>
        </FadeIn>
      </section>

      <Separator />

      {/* Benefits */}
      <section className="bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Benefits</p>
              <h2 className="text-3xl md:text-4xl font-semibold mb-3">What you get</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Less time re-explaining. Fewer review cycles. Docs that match the code.</p>
            </div>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {benefits.map((b, i) => {
              const Icon = b.icon;
              return (
                <FadeIn key={b.title} delay={i * 100}>
                  <Card className="h-full hover:border-foreground/30 transition-colors duration-200">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-2 border border-border rounded-md">
                          <Icon className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-base">{b.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{b.desc}</p>
                    </CardContent>
                  </Card>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      <Separator />

      {/* Token Comparison */}
      <section className="mx-auto max-w-4xl px-6 py-24">
        <FadeIn>
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Token efficiency</p>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3">Stop wasting tokens</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              USM delivers structured, high-signal context via MCP. No more feeding entire vaults or codebases.
            </p>
          </div>
        </FadeIn>
        <FadeIn delay={200}>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-mono uppercase tracking-wider text-muted-foreground px-5 py-3">Method</th>
                  <th className="text-left text-xs font-mono uppercase tracking-wider text-muted-foreground px-5 py-3">Tokens/Session</th>
                  <th className="text-left text-xs font-mono uppercase tracking-wider text-muted-foreground px-5 py-3">Quality</th>
                  <th className="text-left text-xs font-mono uppercase tracking-wider text-muted-foreground px-5 py-3">Maintenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-5 py-4 text-sm">Raw Markdown / Obsidian</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">Very High</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">Noisy</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">Manual</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-sm">Full Codebase</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">Extreme</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">Overwhelming</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">None</td>
                </tr>
                <tr className="bg-foreground/[0.03]">
                  <td className="px-5 py-4 text-sm font-semibold">USM + MCP</td>
                  <td className="px-5 py-4 text-sm font-semibold">Low</td>
                  <td className="px-5 py-4 text-sm font-semibold">High-signal</td>
                  <td className="px-5 py-4 text-sm font-semibold">Automatic</td>
                </tr>
              </tbody>
            </table>
          </div>
        </FadeIn>
      </section>

      <Separator />

      {/* Before / After */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <FadeIn>
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Comparison</p>
            <h2 className="text-3xl md:text-4xl font-semibold">Before USM vs With USM</h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FadeIn>
            <Card className="h-full border-muted-foreground/15">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground">Without USM</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>— Describe feature in chat, agent codes, discussion lost</li>
                  <li>— Re-explain system context every session</li>
                  <li>— Docs drift from code within days</li>
                  <li>— No review before agent builds</li>
                  <li>— Agent hallucinates unknown patterns</li>
                  <li>— Burn thousands of tokens on full codebase</li>
                </ul>
              </CardContent>
            </Card>
          </FadeIn>
          <FadeIn delay={120}>
            <Card className="h-full border-foreground/25">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">With USM</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>+ Agent drafts spec, human reviews, agent builds</li>
                  <li>+ Agent reads system map via MCP before starting</li>
                  <li>+ Spec IS the docs — written first, never stale</li>
                  <li>+ Review markdown before any code is written</li>
                  <li>+ Agent follows established patterns from .usm</li>
                  <li>+ Structured MCP context — 10-20x fewer tokens</li>
                </ul>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </section>

      <Separator />

      {/* Outputs */}
      <section className="bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Outputs</p>
              <h2 className="text-3xl md:text-4xl font-semibold mb-3">One source, many outputs</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">A single .usm/ directory generates all of these.</p>
            </div>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {outputs.map((out, i) => (
              <FadeIn key={out.title} delay={i * 60}>
                <Card className="h-full hover:border-foreground/30 transition-colors duration-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{out.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{out.desc}</p>
                  </CardContent>
                </Card>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={200}>
            <div className="mt-8 border border-border rounded-lg p-5 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Both documentation sites below are generated from the same <code className="text-xs">.usm/</code> directory — different audiences, zero separate maintenance:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a href="https://docs.usm.dev" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Help Docs — docs.usm.dev
                </a>
                <a href="https://dev-docs.usm.dev" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Technical Docs — dev-docs.usm.dev
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <Separator />

      {/* See It In Action */}
      <section id="see-it" className="mx-auto max-w-2xl px-6 py-24">
        <FadeIn>
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Quick start</p>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3">See it in action</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Install in 60 seconds. Scan your codebase. Generate docs.</p>
          </div>
        </FadeIn>
        <FadeIn delay={200}>
          <div className="space-y-2.5">
            <CopyBlock code="npm install -g @smithgray/usm" />
            <CopyBlock code="usm init" />
            <CopyBlock code="usm scan" />
            <CopyBlock code="usm enrich --dry-run" />
            <CopyBlock code="usm generate" />
            <CopyBlock code="usm docs serve" />
            <CopyBlock code="usm mcp serve" />
          </div>
        </FadeIn>
        <div className="text-center mt-10">
          <a href="https://docs.usm.dev/getting-started" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg" })}>
            Try it in 60 seconds <ArrowRight className="w-4 h-4 ml-1" />
          </a>
        </div>
      </section>

      <Separator />

      {/* Use Cases */}
      <section className="bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Use cases</p>
              <h2 className="text-3xl md:text-4xl font-semibold mb-3">Who is it for?</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">If you use AI agents to write code, USM gives you a shared artifact between human intent and agent output.</p>
            </div>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {useCases.map((uc, i) => {
              const Icon = uc.icon;
              return (
                <FadeIn key={uc.title} delay={i * 100}>
                  <Card className="h-full hover:border-foreground/30 transition-colors duration-200">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-2 border border-border rounded-md">
                          <Icon className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-base">{uc.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{uc.desc}</p>
                    </CardContent>
                  </Card>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <FadeIn>
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">Start building with a spec</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Free, open source, MIT licensed. Works with opencode, Cursor, Claude Code, Codex, and GitHub Copilot. Self-hosting — your .usm files stay in your repo.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="https://docs.usm.dev/getting-started" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg" })}>Get Started Free</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg", variant: "outline" })}>Star on GitHub</a>
          </div>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div>MIT © 2026 Smith &amp; Gray Pty Ltd — v{USM_VERSION}</div>
          <div className="flex items-center gap-5">
            <a href="https://docs.usm.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Help Docs</a>
            <a href="https://dev-docs.usm.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Technical Docs</a>
            <a href="https://github.com/Smith-Gray-Pty-Ltd/usm" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
