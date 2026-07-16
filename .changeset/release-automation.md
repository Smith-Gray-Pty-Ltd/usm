---
"@smithgray/usm": patch
---

Fixed the changeset release workflow so version PRs are created automatically. The release action now uses a real user token (CS_GITHUB_TOKEN) instead of the default GITHUB_TOKEN, which both bypasses the org-level block on Actions creating PRs and avoids the `action_required` approval step on the resulting CI runs.
