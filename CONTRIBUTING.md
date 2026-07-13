# Contributing to USM

Thanks for your interest in contributing to USM! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** 22+
- **pnpm** 11+
- **Git** with SSH key configured

## Quick Start

```bash
# Fork the repo on GitHub, then:
git clone git@github.com:YOUR_USERNAME/usm.git
cd usm
pnpm install
pnpm run build
pnpm run test
```

Verify everything works:
```bash
node dist/cli/index.js --version    # Should print 0.1.0
node dist/cli/index.js validate .usm  # Should validate all files
```

## Development Commands

```bash
pnpm run build        # Compile TypeScript to dist/
pnpm run dev          # Watch mode (recompiles on save)
pnpm run lint         # ESLint
pnpm run typecheck    # TypeScript type checking (no output)
pnpm run test         # Run Vitest test suite
pnpm run clean        # Remove dist/
```

## Spec-First Workflow

USM dogfoods itself. When adding a feature:

1. **Write the spec first** — Create a `.usm` feature file in `.usm/features/` describing what you're building
2. **Validate it** — `node dist/cli/index.js validate .usm/features/your-feature.usm`
3. **Implement** — Write the code
4. **Update the spec status** — Change `status: planned` to `status: built` and add `implementation.primary`
5. **Register in system.usm** — Add your feature to the `index:` array in `.usm/system.usm`

This isn't just dogfooding — it ensures the feature is documented before it's built.

## Code Standards

### TypeScript
- Strict mode is on — no `any` without justification
- Use proper types from `src/types.ts`
- Prefer interfaces over type aliases for object shapes

### ESLint
- `pnpm run lint` must pass with 0 errors
- Warnings are acceptable but try to minimize them

### Commit Messages
Use conventional commits:
```
feat(scope): description
fix(scope): description
docs(scope): description
refactor(scope): description
test(scope): description
chore(scope): description
```

Examples:
```
feat(mcp): add usm_draft_feature tool
fix(scan): handle empty pyproject.toml
docs(readme): update install command
```

### File Organization
- Source code: `src/`
- Tests: `tests/` (integration) or `src/**/__tests__/` (unit)
- .usm specs: `.usm/features/<area>/<name>.usm`
- Schemas: `schema/`
- Examples: `examples/`

## Pull Request Process

### 1. Create a Branch
```bash
git checkout -b feat/your-feature-name
```

### 2. Make Your Changes
- Write code + tests
- Update .usm specs if applicable
- Update docs if applicable

### 3. Verify Everything Passes
```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
node dist/cli/index.js check   # Verify .usm files are in sync
```

### 4. Commit
```bash
git add -A
git commit -m "feat(scope): your description"
```

### 5. Push and Create PR
```bash
git push origin feat/your-feature-name
```
Then create a PR on GitHub targeting `main`.

### PR Requirements
- ✅ All CI checks pass (lint, typecheck, test, build, usm check)
- ✅ Tests cover new functionality
- ✅ .usm specs updated for new features
- ✅ No breaking changes without discussion in an issue first
- ✅ Conventional commit messages

## Adding a New Generator

1. Create `src/generators/yourGenerator.ts`
2. Export a function that returns `GenerationResult`
3. Register in `src/cli/index.ts` aggregator generators
4. Export from `src/index.ts`
5. Add to sidebar in `src/cli/docs.ts` (if it produces docs)
6. Write a `.usm` spec for the generator

## Adding a New Language to the Scanner

1. Add manifest definition to `src/scan/multi-lang.ts` (`MANIFESTS` array)
2. Add route patterns to `ROUTE_PATTERNS` array
3. Update `LANGUAGE_SUPPORT` in `src/generators/markdown.ts`
4. Update language logos in `web/src/components/language-carousel.tsx`
5. Write tests with fixture files

## Adding a New MCP Tool

1. Create `src/mcp/yourTool.ts`
2. Export schema (Zod) and handler function
3. Register in `src/cli/mcp.ts`
4. Write a `.usm` spec in `.usm/features/mcp/`
5. Update `AGENTS.md` generator if the tool changes the workflow

## Reporting Issues

- **Bugs**: Use the bug report template — include steps to reproduce, expected vs actual, and environment info
- **Features**: Use the feature request template — describe the problem and proposed solution
- **Questions**: Open a Discussion on GitHub

## Questions?

- Open a [GitHub Discussion](https://github.com/Smith-Gray-Pty-Ltd/usm/discussions)
- Email: james@smith-gray.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
