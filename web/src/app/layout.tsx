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
  title: "USM — The source of truth for human + AI software development",
  description: "USM is a schema-validated source of truth for agentic software development that reduces token burn, persists structured knowledge across coding sessions, and automatically generates documentation and design artefacts in a spec-first development cycle.",
  keywords: [
    "USM",
    "Universal System Map",
    "spec-first development",
    "AI coding",
    "agentic coding",
    "MCP",
    "Model Context Protocol",
    "opencode",
    "Cursor",
    "GitHub Copilot",
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
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png" },
      { url: "/apple-icon-57x57.png", sizes: "57x57" },
      { url: "/apple-icon-60x60.png", sizes: "60x60" },
      { url: "/apple-icon-72x72.png", sizes: "72x72" },
      { url: "/apple-icon-76x76.png", sizes: "76x76" },
      { url: "/apple-icon-114x114.png", sizes: "114x114" },
      { url: "/apple-icon-120x120.png", sizes: "120x120" },
      { url: "/apple-icon-144x144.png", sizes: "144x144" },
      { url: "/apple-icon-152x152.png", sizes: "152x152" },
      { url: "/apple-icon-180x180.png", sizes: "180x180" },
      { url: "/apple-icon-precomposed.png" },
    ],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "USM — The source of truth for human + AI software development",
    description: "USM is a schema-validated source of truth for agentic software development that reduces token burn, persists structured knowledge across coding sessions, and automatically generates documentation and design artefacts in a spec-first development cycle.",
    siteName: "USM",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "USM — The source of truth for human + AI software development",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "USM — The source of truth for human + AI software development",
    description: "USM is a schema-validated source of truth for agentic software development that reduces token burn, persists structured knowledge across coding sessions, and automatically generates documentation and design artefacts in a spec-first development cycle.",
    images: ["/og-image.png"],
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
      description: "The source of truth for human + AI software development. Write specs first, agents build from them, docs stay in sync. Uses 10-20x fewer tokens than raw Markdown vaults via MCP.",
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
        "18 MCP tools (9 read + 9 write) for AI agents",
        "Generates markdown, Mermaid, OpenAPI, AGENTS.md, Vitest specs, ArchiMate, TOGAF, Structurizr",
        "Works with opencode, Cursor, Claude Code, Codex, GitHub Copilot",
        "Per-message workflow enforcement via always-on iron rules",
        "Predicate queries over your architecture (usm query / usm_query)",
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
      description: "The source of truth for human + AI software development",
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
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="theme-color" content="#000000" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
