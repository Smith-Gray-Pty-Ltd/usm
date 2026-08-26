import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "USM",
  description: "Universal System Map — a structured source of truth for agentic systems. A single .usm/ directory describes apps, servic",
  cleanUrls: true,
  ignoreDeadLinks: true,
  outDir: '.vitepress/dist',
  lastUpdated: true,
  sitemap: { hostname: "https://dev-docs.usm.dev" },
  head: [
    ['script', {}, "(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';s.onload=function(){mermaid.initialize({startOnLoad:false,theme:document.documentElement.classList.contains('dark')?'dark':'default',securityLevel:'loose'});function render(){var els=document.querySelectorAll('.language-mermaid:not([data-mermaid-done])');for(var i=0;i<els.length;i++){var el=els[i];el.setAttribute('data-mermaid-done','1');var code=el.querySelector('pre code');if(code)el.textContent=code.textContent;}if(els.length)mermaid.run({querySelector:'.language-mermaid[data-mermaid-done]'}).catch(function(){});}render();try{new MutationObserver(function(ms){for(var i=0;i<ms.length;i++)for(var j=0;j<ms[i].addedNodes.length;j++){var n=ms[i].addedNodes[j];if(n.nodeType===1&&(n.classList&&n.classList.contains('language-mermaid')||n.querySelectorAll&&n.querySelectorAll('.language-mermaid').length)){render();return;}}}).observe(document.body,{childList:true,subtree:true});}catch(e){}try{new MutationObserver(function(){mermaid.initialize({startOnLoad:false,theme:document.documentElement.classList.contains('dark')?'dark':'default',securityLevel:'loose'});document.querySelectorAll('.language-mermaid[data-mermaid-done]').forEach(function(el){el.removeAttribute('data-mermaid-done');el.innerHTML='<pre><code>'+el.textContent+'</code></pre>';});render();}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});}catch(e){}};document.head.appendChild(s);})();"],
    ['style', {}, ":root{--vp-layout-max-width:100%}.VPDoc.has-sidebar .content-container{max-width:100%!important}.vp-doc :not(pre) > p{max-width:80ch}"]
  ],
  themeConfig: {
    nav: [
    { text: 'Report Issue', link: '/feedback' }
  ],
    sidebar: [
  {
    "text": "Getting Started",
    "items": [
      {
        "text": "Home",
        "link": "/"
      },
      {
        "text": "Getting Started",
        "link": "/getting-started"
      },
      {
        "text": "Agent Setup Guide",
        "link": "/agent-setup-guide"
      }
    ]
  },
  {
    "text": "Editor Setup",
    "collapsed": true,
    "items": [
      { "text": "All Editors", "link": "/editor-setup/" },
      { "text": "Claude Code", "link": "/editor-setup/claude-code" },
      { "text": "Claude Desktop", "link": "/editor-setup/claude-desktop" },
      { "text": "Cursor", "link": "/editor-setup/cursor" },
      { "text": "Windsurf", "link": "/editor-setup/windsurf" },
      { "text": "VS Code", "link": "/editor-setup/vs-code" },
      { "text": "Visual Studio", "link": "/editor-setup/visual-studio" },
      { "text": "JetBrains", "link": "/editor-setup/jetbrains" },
      { "text": "opencode", "link": "/editor-setup/opencode" },
      { "text": "Codex", "link": "/editor-setup/openai-codex" },
      { "text": "Copilot CLI", "link": "/editor-setup/copilot-cli" },
      { "text": "Copilot Coding Agent", "link": "/editor-setup/copilot-coding-agent" },
      { "text": "Zed", "link": "/editor-setup/zed" },
      { "text": "Continue", "link": "/editor-setup/continue" },
      { "text": "Cline", "link": "/editor-setup/cline" },
      { "text": "Roo Code", "link": "/editor-setup/roo-code" },
      { "text": "Augment Code", "link": "/editor-setup/augment-code" },
      { "text": "Gemini CLI", "link": "/editor-setup/gemini-cli" },
      { "text": "Antigravity", "link": "/editor-setup/antigravity" },
      { "text": "Trae", "link": "/editor-setup/trae" },
      { "text": "Kiro", "link": "/editor-setup/kiro" },
      { "text": "Kilo Code", "link": "/editor-setup/kilo-code" },
      { "text": "Warp", "link": "/editor-setup/warp" },
      { "text": "Amp", "link": "/editor-setup/amp" },
      { "text": "Amazon Q", "link": "/editor-setup/amazon-q" },
      { "text": "Qwen Code", "link": "/editor-setup/qwen-code" },
      { "text": "Crush", "link": "/editor-setup/crush" },
      { "text": "Factory", "link": "/editor-setup/factory" },
      { "text": "LM Studio", "link": "/editor-setup/lm-studio" },
      { "text": "BoltAI", "link": "/editor-setup/boltai" },
      { "text": "Perplexity", "link": "/editor-setup/perplexity" },
      { "text": "Hermes", "link": "/editor-setup/hermes" },
      { "text": "Rovo Dev", "link": "/editor-setup/rovo-dev" },
      { "text": "Zencoder", "link": "/editor-setup/zencoder" },
      { "text": "Qodo Gen", "link": "/editor-setup/qodo-gen" },
      { "text": "Smithery", "link": "/editor-setup/smithery" },
      { "text": "ChatGPT", "link": "/editor-setup/chatgpt" }
    ]
  },
  {
    "text": "Core Concepts",
    "collapsed": true,
    "items": [
      {
        "text": "Schema Reference",
        "link": "/schema-reference"
      },
      {
        "text": "Language Support",
        "link": "/language-support"
      },
      {
        "text": "USM CLI",
        "link": "/shared-services/cli/overview"
      },
      {
        "text": "USM MCP Server",
        "link": "/shared-services/mcp/overview"
      }
    ]
  },
  {
    "text": "Workflows",
    "items": [
      {
        "text": "CLI Reference",
        "link": "/cli-reference"
      },
      {
        "text": "MCP Tools",
        "link": "/mcp-reference"
      },
      {
        "text": "Configuration",
        "link": "/config-reference"
      }
    ]
  },
  {
    "text": "Features",
    "collapsed": false,
    "items": [
      {
        "text": "CLI",
        "collapsed": true,
        "items": [
          {
            "text": "Configurable Outputs + Command Convention",
            "link": "/features/cli/config-outputs"
          },
          {
            "text": "Enrich Command",
            "link": "/features/cli/enrich"
          },
          {
            "text": "Generate Command",
            "link": "/features/cli/generate"
          },
          {
            "text": "Init Command",
            "link": "/features/cli/init"
          },
          {
            "text": "Scaffold Command",
            "link": "/features/cli/scaffold"
          },
          {
            "text": "Scaffold Project Command",
            "link": "/features/cli/scaffold-project"
          },
          {
            "text": "Scan Command",
            "link": "/features/cli/scan"
          },
          {
            "text": "Validate Command",
            "link": "/features/cli/validate"
          },
          {
            "text": "Docs Serve & Build [planned]",
            "link": "/features/cli/docs"
          },
          {
            "text": "Multi-Language Scanner Support [planned]",
            "link": "/features/cli/multi-lang-scan"
          },
          {
            "text": "Project Upgrade [planned]",
            "link": "/features/cli/upgrade"
          }
        ]
      },
      {
        "text": "Docs-and-schema-improvements",
        "collapsed": true,
        "items": [
          {
            "text": "VitePress Docs + Schema Polish [in-progress]",
            "link": "/features/docs-and-schema-improvements/vitepress-schema-polish"
          }
        ]
      },
      {
        "text": "Generators",
        "collapsed": true,
        "items": [
          {
            "text": "AGENTS.md Generator",
            "link": "/features/generators/agentsMd"
          },
          {
            "text": "ArchiMate Generator",
            "link": "/features/generators/archimate"
          },
          {
            "text": "Docs Split (Help vs Developer)",
            "link": "/features/generators/docs-split"
          },
          {
            "text": "Help Docs Reference Expansion",
            "link": "/features/generators/help-reference"
          },
          {
            "text": "Markdown Generator",
            "link": "/features/generators/markdown"
          },
          {
            "text": "Mermaid Generator",
            "link": "/features/generators/mermaid"
          },
          {
            "text": "OpenAPI Generator",
            "link": "/features/generators/openapi"
          },
          {
            "text": "Rules Files Generator",
            "link": "/features/generators/rules-files"
          },
          {
            "text": "Test Specs Generator",
            "link": "/features/generators/testSpecs"
          },
          {
            "text": "TOGAF Generator",
            "link": "/features/generators/togaf"
          },
          {
            "text": "Roadmap Generator [in-progress]",
            "link": "/features/generators/roadmap"
          },
          {
            "text": "Feature Review Markdown Generator [planned]",
            "link": "/features/generators/feature-review"
          },
          {
            "text": "Marketing Language Tabs [planned]",
            "link": "/features/generators/mkt-language-tabs"
          }
        ]
      },
      {
        "text": "MCP",
        "collapsed": true,
        "items": [
          {
            "text": "MCP Contracts Tool",
            "link": "/features/mcp/contracts"
          },
          {
            "text": "MCP Flows Tool",
            "link": "/features/mcp/flows"
          },
          {
            "text": "MCP List Tool",
            "link": "/features/mcp/list"
          },
          {
            "text": "MCP Read Tool",
            "link": "/features/mcp/read"
          },
          {
            "text": "MCP References Tool",
            "link": "/features/mcp/references"
          },
          {
            "text": "MCP Search Tool",
            "link": "/features/mcp/search"
          },
          {
            "text": "MCP Summary Tool",
            "link": "/features/mcp/summary"
          },
          {
            "text": "MCP Validate Tool",
            "link": "/features/mcp/validate"
          },
          {
            "text": "MCP Write Tools",
            "link": "/features/mcp/write"
          },
          {
            "text": "Agent Feedback Protocol [planned]",
            "link": "/features/mcp/agent-feedback"
          }
        ]
      },
      {
        "text": "Schema",
        "collapsed": true,
        "items": [
          {
            "text": "V1 JSON Schema",
            "link": "/features/schema/v1"
          }
        ]
      }
    ]
  },
  {
    "text": "Architecture",
    "collapsed": true,
    "items": [
      {
        "text": "System Architecture",
        "link": "/architecture/architecture"
      },
      {
        "text": "Architecture Vision",
        "link": "/architecture/A-architecture-vision"
      },
      {
        "text": "Business Architecture",
        "link": "/architecture/B-business-architecture"
      },
      {
        "text": "Data Architecture",
        "link": "/architecture/C1-data-architecture"
      },
      {
        "text": "Application Architecture",
        "link": "/architecture/C2-application-architecture"
      },
      {
        "text": "Technology Architecture",
        "link": "/architecture/D-technology-architecture"
      },
      {
        "text": "Opportunities & Solutions",
        "link": "/architecture/E-opportunities-and-solutions"
      },
      {
        "text": "Implementation Governance",
        "link": "/architecture/G-implementation-governance"
      },
      {
        "text": "Change Management",
        "link": "/architecture/H-architecture-change-management"
      },
      {
        "text": "Data Models",
        "link": "/data/models"
      }
    ]
  },
  {
    "text": "Deployment",
    "collapsed": true,
    "items": [
      {
        "text": "Deployment",
        "link": "/deployment"
      }
    ]
  },
  {
    "text": "Roadmap",
    "items": [
      {
        "text": "Roadmap",
        "link": "/roadmap"
      }
    ]
  },
  {
    "text": "Contributing",
    "collapsed": true,
    "items": [
      {
        "text": "Agent Setup",
        "link": "/agent-setup-guide"
      },
      {
        "text": "Report Issue",
        "link": "/feedback"
      },
      {
        "text": "CLI for contributors",
        "link": "/cli-reference"
      }
    ]
  }
],
    search: {
      provider: 'local'
    },
    outline: { level: [2, 3] },
    editLink: {
      pattern: "https://github.com/Smith-Gray-Pty-Ltd/usm/tree/main/.usm",
      text: 'Edit .usm source'
    },
    socialLinks: [{ icon: 'github', link: "https://github.com/Smith-Gray-Pty-Ltd/usm" }],
    footer: {
      message: "Generated by <a href=\"https://github.com/Smith-Gray-Pty-Ltd/usm\">@smithgray/usm</a> v0.5.1 · 2026-08-26 · <a href=\"https://usm.dev\">usm.dev</a>",
      copyright: "USM"
    }
  }
})
