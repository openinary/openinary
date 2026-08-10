# Loops CLI Reference

## Contents

- Source URLs
- When To Use The CLI
- Installation
- Auth And Configuration
- Global flags
- Common Workflows
- Practical Guidance

## Source URLs

- https://loops.so/docs/cli
- https://github.com/loops-so/cli
- https://github.com/loops-so/cli/blob/main/README.md

Use `loops agent-context` when you need exact flags or the latest command shape. Requires a recent CLI build (v0.5.0+).

## When To Use The CLI

Prefer the CLI when the user is:

- working from the shell
- doing one-off operational tasks
- validating or rotating credentials
- troubleshooting requests without writing application code
- inspecting output in text or JSON locally

Prefer SDKs or raw HTTP for application code.

## Installation

Prefer the official CLI docs as the source of truth if installation behavior seems to be moving.

### Homebrew

```bash
brew install loops-so/tap/loops
```

### Install script (macOS, Linux, Windows via WSL)

```bash
curl -fsSL https://install.loops.so/cli | sh
```

To install a specific version or to a custom path, append `-s -- <version> <path>` to `sh` in the command above. The default install path is `~/.local/bin`.

If the user is working from source instead of using an installer, defer to the CLI repo README.

### Go install

```bash
go install github.com/loops-so/cli/cmd/loops@latest
```

## Install script (Windows PowerShell)

```pwsh
irm https://raw.githubusercontent.com/loops-so/cli/main/install.ps1 | iex
```

## Auth And Configuration

The CLI needs a Loops API key. You can either:

- set `LOOPS_API_KEY` in the environment, or
- store named keys with `loops auth ...`

Get the API key from `Settings > API` in Loops.

### Keyring storage

```bash
# Save a key interactively, verify it, and make it the default
loops auth login my-team

# Save a key without verifying first and make it the default
loops auth login my-team --skip-verify

# List stored keys
loops auth list

# Set a stored key as the default
loops auth use my-team

# Clear the default stored key
loops auth use --clear

# Show resolved config, active key, masked API key, team, and endpoint
loops auth status

# Remove a stored key
loops auth logout my-team
```

Run `loops auth login <name>` again with a different name to store keys for multiple teams.
Each `loops auth login <name>` call also sets that stored key as the current default.

Use `--team <name>` on any command to select a specific stored key without changing the default.

### Environment variable

Set `LOOPS_API_KEY` directly when keyring storage is unavailable or when running in CI.

### Auth precedence

When multiple credentials are available, the CLI resolves them in this order:

1. `LOOPS_API_KEY`
2. `--team <name>`
3. the current default stored key set with `loops auth use` or the most recent `loops auth login`
4. if no default is set and exactly one stored key exists, the CLI uses that key automatically

`loops auth use --clear` clears the explicit default, but it does not disable that single-stored-key fallback.

### Global flags

These apply across the CLI:

- `-o, --output text|json`
- `-t, --team <name>` to select a stored team key explicitly
- `--debug` to print API request details before sending

## Common Workflows

### Validate credentials

```bash
loops api-key
loops api-key --output json
```

Use this for a quick API-key check against the resolved config.

### Agent discovery

```bash
loops agent-context
loops --version
```

`agent-context` prints JSON describing every command, subcommand, and flag — useful when this reference is behind the installed CLI version.

### Contacts

```bash
# Find
loops contacts find --email user@example.com
loops contacts find --user-id usr_123 --output json

# Create
loops contacts create \
  --email user@example.com \
  --first-name Alex \
  --last-name Chen \
  --user-id usr_123 \
  --subscribed true \
  --user-group premium \
  --list cm_abc123=true \
  --contact-props ./contact-props.json

# Update
loops contacts update \
  --email user@example.com \
  --first-name Alex \
  --list cm_abc123=false \
  --contact-props ./contact-props.json

# Delete
loops contacts delete --email user@example.com
```

Useful contact flags:

- `--email`
- `--user-id`
- `--first-name`
- `--last-name`
- `--subscribed true|false`
- `--user-group`
- `--list id=true|false` (repeatable)
- `--contact-props path/to/file.json`

### Contact properties

```bash
loops contact-properties list
loops contact-properties list --custom
loops contact-properties create --name planTier --type string
```

Use camelCase for property names.

### Mailing lists

```bash
loops lists list
loops lists list --output json
```

### Events

```bash
loops events send signup \
  --email user@example.com \
  --props ./event-props.json \
  --contact-props ./contact-props.json \
  --list list_123=true \
  --idempotency-key signup-user-123
```

Useful event flags:

- `--email` or `--user-id`
- `--props path/to/file.json`
- `--contact-props path/to/file.json`
- `--list id=true|false`
- `--idempotency-key`

If the JSON file passed to `--props` contains a top-level `eventProperties` object, the CLI uses that nested object. Otherwise it treats the full JSON object as the event-properties payload.

### Transactional emails

```bash
# List transactional emails
loops transactional list
loops transactional list --per-page 20
loops transactional list --cursor abc123 --output json
loops transactional list --pick

# Send
loops transactional send cll42l54f20i1la0lfooe3z12 \
  --email user@example.com \
  -v firstName=Alex \
  -v resetLink=https://example.com/reset \
  --idempotency-key reset-user-123

# Send with JSON vars and attachments
loops transactional send cll42l54f20i1la0lfooe3z12 \
  --email user@example.com \
  -j ./vars.json \
  -A ./invoice.pdf \
  -a
```

Useful transactional flags:

- `--email`
- `-a, --add-to-audience`
- `-v, --var KEY=value` (repeatable)
- `-j, --json-vars path/to/file.json`
- `-A, --attachment path/to/file` (repeatable)
- `--idempotency-key`
- `--per-page`
- `--cursor`
- `--pick` (list; requires fzf; cannot combine with `--output json`)

The CLI also exposes a top-level alias:

```bash
loops send cll42l54f20i1la0lfooe3z12 --email user@example.com -v resetLink=https://example.com/reset
```

This is the same transactional send flow as `loops transactional send`.

### Campaigns

Create and edit campaigns.

A sending domain must be configured before creating campaigns.

```bash
# List (auto-paginates unless --cursor is set)
loops campaigns list
loops campaigns list --per-page 20 --output json
loops campaigns list --pick   # interactive fzf picker; copies IDs to clipboard

# Create a draft campaign (prints campaignId, emailMessageId, contentRevisionId)
loops campaigns create --name "Spring product announcement"

# Get or update a draft campaign
loops campaigns get <campaignId>
loops campaigns update <campaignId> --name "Renamed announcement"
loops campaigns update <campaignId> --audience-segment-id seg_123
loops campaigns update <campaignId> --schedule-at 2026-08-01T12:00:00Z
```

Useful campaign flags:

- `--name` / `-n` (required on create; optional on update)
- `--campaign-group-id`, `--mailing-list-id`
- `--audience-segment-id` or `--audience-filter-file`
- `--schedule-now` or `--schedule-at <RFC3339 timestamp>`
- `--per-page`, `--cursor` (list)
- `--pick` (list; requires fzf; cannot combine with `--output json`)

### Email messages

```bash
# Get message fields and syntax-highlighted LMX
loops email-messages get <emailMessageId>
loops email-messages get <emailMessageId> --output json

# Update draft content (requires a revision flag and at least one field)
loops email-messages update <emailMessageId> \
  --expected-revision-id rev_123 \
  --subject "Big spring updates" \
  --preview-text "A quick look at what's new" \
  --from-name "Loops" \
  --from-email hello \
  --reply-to support@example.com \
  --lmx-file ./email.lmx

# Or fetch the latest revision automatically (overwrites concurrent edits)
loops email-messages update <emailMessageId> --force --lmx-file ./email.lmx

# Send a test preview
loops email-messages preview <emailMessageId> \
  --email user@example.com \
  --contact-prop firstName=Alex
```

Useful email-message flags:

- `--expected-revision-id` / `-r` — pass `contentRevisionId` from a prior `get` or `campaigns create` (mutually exclusive with `--force`)
- `--force` / `-f` — fetch the current revision and use it
- `--subject`, `--preview-text`, `--from-name`, `--from-email`, `--reply-to`
- `--cc`, `--bcc`, `--language-code`, `--email-format`
- `--contact-fallback`, `--event-fallback`, `--data-fallback`
- `--lmx` or `--lmx-file` (mutually exclusive)
- `preview`: `--email`, `--contact-prop`, `--event-prop`, `-v`/`--var`, or `-j`/`--json-vars`

`--from-email` accepts a username only; if you pass `hello@example.com`, the CLI keeps `hello`.

After a successful update, text output may include LMX `warnings`. JSON output includes them on the response object.

### Themes

```bash
loops themes list
loops themes list --pick
loops themes get <themeId>
```

`themes get` prints style fields for reference.

### Components

```bash
loops components list
loops components list --pick
loops components get <componentId>
```

`components get` prints the component LMX body.

### Uploads

Upload files that can be used in email content.

```bash
loops uploads create ./header.png
```

Use the returned `finalUrl` in LMX `<Image src="..." />` tags.

By default the CLI sniffs the MIME type from the file contents. Override it with `--content-type` if needed:

```bash
loops uploads create ./header.png --content-type image/png
```

Useful uploads flags:

- `--content-type` — MIME type to use for the upload (default: sniffed from file contents)

## Practical Guidance

- Use `--output json` when the CLI output needs to feed another program.
- Use named keys plus `loops auth use` when switching between Loops teams regularly.
- Use `--team` when you want to override the active stored key for a single command.
- Use `--debug` when you need to inspect request behavior from the terminal.
- For campaign editing, save `contentRevisionId` from `campaigns create` or `email-messages get`, then pass it to `email-messages update --expected-revision-id`. Use `--force` only when overwriting concurrent edits is acceptable.
- Use `--lmx-file` for non-trivial LMX bodies; pair with the `loops-lmx` skill for valid markup.
- If the user needs an exact flag or command not covered here, fall back to `loops agent-context`.
