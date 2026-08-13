---
"@smithgray/usm": patch
---

Fix contradictory feedback guidance in self-referential projects — when the consuming repo's tracker IS the USM upstream tracker (i.e. the USM repo itself), the generated protocol named the same URL as both "file tool bugs here" and "never file them here". The generator now detects the collision and collapses to coherent single-tracker text; downstream repos (different trackers) keep the full two-scope table unchanged.
