---
"@smithgray/usm": patch
---

Release the fixed Mermaid renderer in generated VitePress docs — the dynamic CDN loader with MutationObserver (SPA nav) and dark-mode re-render landed hours after 0.3.0 was published, so 0.3.0 users still had the broken boot script that raced Shiki. Verified rendering end-to-end in a browser against a static build. (fixes #12)
