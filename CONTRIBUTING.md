# Contributing to Openinary

First of all, thank you for your interest in contributing! 🎉

This project aims to provide a powerful, open-source alternative for media management, and community contributions are vital to its success.

---

## Got an Idea or a Question?

Please start a [**Discussion**](https://github.com/openinary/openinary/discussions) if you have:

- **Ideas** – Share new features, suggestions, or improvements.
- **Q&A** – Ask questions about how Openinary works.
- **General** – Anything else not covered by the above.

Use the appropriate category when opening a new discussion.

---

## Found a Bug?

If something isn't working as expected, please [**open an Issue**](https://github.com/openinary/openinary/issues).

When filing an issue, please include:

- Clear steps to reproduce the problem
- What you expected to happen vs. what actually happened
- Logs, screenshots, or examples where applicable
- Your environment (OS, Node version, etc.)

This helps us investigate and resolve the issue faster.

---

## Want to Submit a Pull Request?

Pull requests are welcome! Here's how to get started:

1. **Fork** the repository and create your branch from `main`
2. **Set up your environment:**
   - Install dependencies: `pnpm install` (pnpm 10, Node 20+)
   - Follow the setup instructions in the README
   - `pnpm dev` runs the self-hosted API (`:3000`) and dashboard (`:3001`)
3. **Make your changes:**
   - Follow the existing code style and ensure your code is well-documented
   - Keep PRs focused and scoped to a single change
4. **Test your changes:**
   - Ensure existing tests pass
   - Add new tests for new features
5. **Submit:**
   - Open a PR with a clear title and description
   - Link any related issues or discussions

PRs will be reviewed by maintainers and merged once they meet quality standards and align with the project direction.

### What lives where

This repository holds the self-hosted product and the managed Cloud service in
one tree. Everything is AGPL-3.0 except `apps/cloud/`, which is source-available
under [its own license](apps/cloud/LICENSE), and `apps/marketing/`, which is MIT.
Contributions are welcome to all of them, under the same CLA below.

The shared engine lives in `packages/core` and `packages/ui`, and both the
self-hosted apps and the Cloud consume it through `workspace:*`. That is the
point of the single tree: a fix in `packages/core` reaches `apps/api` and
`apps/cloud/server` in the same commit, with nothing published in between.
Neither package is released to npm — to use them in your own app, go through the
shadcn registry in `packages/registry`.

The dev servers are on separate ports so the self-hosted and Cloud stacks can run
side by side: `pnpm dev` (3000/3001), `pnpm dev:cloud` (3100/3101),
`pnpm dev:admin` (3102), `pnpm dev:marketing` (3200), `pnpm dev:telemetry`
(8787), `pnpm dev:docs` (3333).

### A note on `docker.env.example`

The `openinary upgrade` command (in `packages/cli`) fetches `docker.env.example`
from the target release tag and diffs it against a project's local `.env` to
detect newly introduced variables. If you add or rename an environment
variable, please keep changes to this file **additive**, avoid renaming or
removing existing keys, so upgrades across versions stay reliable.

---

## Contributor License Agreement (CLA)

**Every pull request requires a signed [CLA](CLA.md) before it can be merged.**

Signing takes one comment inside your PR — a bot will walk you through it, and
you only ever sign once. Read the full terms in [`CLA.md`](CLA.md).

### What does this mean?

To keep Openinary sustainable while staying Open Source, we use an "Open Core" model:

- **Open Source Core:** The main Openinary engine remains **free and open source** (GNU AGPLv3) for everyone to self-host
- **Managed Cloud Version:** We plan to launch a managed Cloud offering. Revenue from this service funds long-term maintenance and development of the open-source project
- **Commercial Licenses:** Organizations that cannot comply with the AGPL can buy a commercial license, which also funds the project
- **Your Rights:** You retain full ownership of your contributions — the CLA is a license, not a transfer of copyright
- **License Grant:** You grant a non-exclusive, worldwide, royalty-free, perpetual, and irrevocable license to use, reproduce, modify, sublicense, and distribute your contributions under any license (including in commercial offerings)

The Cloud and commercial licenses both require the right to relicense the
**entire** codebase, so a single unsigned contribution would block them for the
whole project. That is the only reason this agreement exists.

> **Contributing on company time?** If you write your contribution as part of
> your job, your employer likely owns it. Make sure you're authorized to sign
> before you do — see section 4.2 of [`CLA.md`](CLA.md).

**Similar projects using this model:** GitLab, Sentry, Discourse, and many other successful open-source projects.

If you have concerns about this agreement, please open a discussion – we're happy to clarify.

---

Thank you again for helping make Openinary better! 🚀
