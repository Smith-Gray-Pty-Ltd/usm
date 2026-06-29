import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = "https://usm.dev";

export const metadata: Metadata = {
  title: "USM — A Shared Focused Brain for Human + AI Development",
  description: "Write specs first. Agents build from them. Docs stay perfectly in sync — using far fewer tokens than bloated Markdown vaults. Works with Cursor, Claude Code, and Codex.",
  keywords: [
    "USM",
    "Universal System Map",
    "spec-first development",
    "AI coding",
    "agentic coding",
    "MCP",
    "Model Context Protocol",
    "Cursor",
    "Claude Code",
    "Codex",
    "documentation generation",
    "OpenAPI",
    "ArchiMate",
    "TOGAF",
    "token optimization",
    "structured documentation",
    "AI agent context",
  ],
  authors: [{ name: "Smith & Gray Pty Ltd" }],
  creator: "Smith & Gray Pty Ltd",
  publisher: "Smith & Gray Pty Ltd",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "USM — A Shared Focused Brain for Human + AI Development",
    description: "Write specs first. Agents build from them. Docs stay perfectly in sync — using far fewer tokens than bloated Markdown vaults. Works with Cursor, Claude Code, and Codex.",
    siteName: "USM",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "USM — A Shared Focused Brain for Human + AI Development",
    description: "Write specs first. Agents build from them. Docs stay perfectly in sync — using 10-20x fewer tokens than bloated Markdown vaults.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "technology",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "USM — Universal System Map",
      description: "A structured source of truth for agentic systems. Write specs first, agents build from them, docs stay in sync. Uses 10-20x fewer tokens than raw Markdown vaults via MCP.",
      url: siteUrl,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Cross-platform",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      license: "https://github.com/Smith-Gray-Pty-Ltd/usm/blob/main/LICENSE",
      featureList: [
        "Spec-first workflow (discuss → spec → review → build → documented)",
        "12 MCP tools (8 read + 4 write) for AI agents",
        "Generates markdown, Mermaid, OpenAPI, AGENTS.md, Vitest specs, ArchiMate, TOGAF",
        "Works with Cursor, Claude Code, Codex, GitHub Copilot",
        "10-20x fewer tokens than raw codebase context",
        "VitePress docs with help/developer audience split",
        "Configurable output paths via usmconfig.json",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "USM",
      description: "A shared focused brain for human + AI development",
      publisher: { "@id": `${siteUrl}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#org`,
      name: "Smith & Gray Pty Ltd",
      url: siteUrl,
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is USM?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "USM (Universal System Map) is a structured source of truth for agentic systems. A single .usm/ directory of YAML files describes your whole system and generates markdown docs, Mermaid diagrams, OpenAPI specs, AGENTS.md, Vitest test specs, ArchiMate, and TOGAF deliverables.",
          },
        },
        {
          "@type": "Question",
          name: "How does USM save tokens?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "USM delivers structured, high-signal context via MCP tools instead of feeding entire codebases or Markdown vaults to AI agents. This uses approximately 10-20x fewer tokens while reducing hallucinations.",
          },
        },
        {
          "@type": "Question",
          name: "What tools does USM work with?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "USM works with any MCP-compatible AI coding tool including Cursor, Claude Code, Claude Desktop, Continue.dev, Codex, and GitHub Copilot.",
          },
        },
        {
          "@type": "Question",
          name: "Is USM free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, USM is free and open source under the MIT license. Self-hosting — your .usm files stay in your repo.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
