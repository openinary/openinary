---
name: issue-fixer
description: "Implement GitHub issues collaboratively in open-source repositories with explicit approval gates, incremental delivery, atomic commits, and PR-ready validation. Use when working issue-by-issue with a human operator who decides scope and product direction."
argument-hint: "Issue URL or description, target branch policy, and any non-negotiable constraints"
user-invocable: true
disable-model-invocation: false
---

# Open Source Issue Implementation

## Outcome

Produce a production-ready issue implementation with:

- Shared understanding of scope and constraints
- Operator-approved technical approach before coding
- Incremental, reviewable changes
- Clean commit history
- Verified build/lint/type/tests status
- PR-ready summary linked to the issue

## When to Use

Use this skill when:

- Working on a single GitHub issue in an open-source repository
- A human operator must validate decisions before implementation advances
- Scope control and traceable collaboration matter more than speed

Do not use this skill when:

- Doing broad discovery without a concrete issue
- Running large autonomous refactors without operator checkpoints

## Collaboration Contract

At all times:

- Propose -> operator decides -> implement
- Do not make product decisions alone
- Do not expand scope without explicit approval
- Prefer clarity over speed
- Ask concise clarification questions when ambiguous

## Required Inputs

Collect or confirm:

- Issue link or full issue text
- Target base branch and contribution conventions
- Definition of done (tests, lint/type, docs, screenshots, changelog)
- Constraints (backward compatibility, performance, API stability)

## Procedure

### 1. Repository Sync

Run and report results:

1. `git checkout main`
2. `git pull origin main`
3. `git fetch --all`
4. `git status`

Validation checks:

- Working tree is clean (or operator explicitly approves proceeding with local changes)
- `main` is current
- No unresolved conflicts

If validation fails:

- Stop and ask the operator how to proceed before editing code

### 2. Issue Analysis (No Coding)

Deliver a concise analysis containing:

- 2-3 sentence summary
- Goal
- In-scope items
- Out-of-scope items
- Constraints
- Edge cases
- Open questions

Decision gate:

- Wait for operator validation before moving forward

### 3. Solution Proposal (No Coding)

Propose implementation details:

- Technical approach
- Impacted files/modules
- Data flow (if relevant)
- Risks and trade-offs
- Test strategy

Decision gate:

- Wait for explicit operator approval before coding

### 4. Branch Creation

Create a branch only after proposal approval:

1. Choose one prefix: `feat/`, `fix/`, `refactor/`, or `chore/`
2. Create branch: `git checkout -b <prefix><short-description>`

### 5. Implementation Loop (Incremental)

For each iteration:

1. Explain the next small step
2. Implement that step
3. Report what changed and why
4. Ask for operator validation

Suggested iteration order:

- Setup/refactor prerequisites
- Core functionality
- Edge cases and error handling
- Cleanup and documentation

Rules:

- Keep diffs focused and reviewable
- Avoid unrelated file churn
- Halt when requirements become ambiguous

### 6. Atomic Commits

Commit each logical unit separately using conventional commits, for example:

- `feat: add overlay support`
- `fix: handle empty queue payload`

Commit quality checks:

- One logical change per commit
- Message reflects actual change
- No debug artifacts

### 7. Validation Before PR

Run or confirm:

- Build succeeds
- Lint/type checks pass
- Tests pass (or clearly state missing tests and rationale)
- No debug code, temporary logging, or dead code remains

If checks fail:

- Fix failures or escalate with a concise blocker report

### 8. Sync Before Push

Before opening PR:

1. `git fetch origin`
2. `git rebase origin/main`

If conflicts appear:

- Resolve cleanly
- Re-run validation checks
- Summarize conflict decisions for operator visibility

### 9. Pull Request Preparation

Create a structured PR description containing:

- Problem summary
- Solution summary
- Key implementation details
- Validation evidence (build/lint/type/tests)
- Visuals/screenshots when relevant
- Linked issue

### 10. Post-Merge Cleanup

After merge confirmation:

1. `git branch -d <branch>`
2. `git push origin --delete <branch>`

## Completion Criteria

This skill is complete when:

- Issue scope is implemented as approved
- Operator accepted each decision gate
- Validation checks are green (or exceptions documented and accepted)
- PR is ready or merged with cleanup completed

## Message Format (Recommended)

For each operator-facing update, use:

1. Intent
2. Action taken
3. Result
4. Decision needed

Keep updates concise and structured.
