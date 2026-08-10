---
name: loops-lmx
description: >
  Use this skill whenever LMX is used, produced, reviewed, migrated, or modified.
  This includes composing campaigns, loops, lifecycle emails, or email-message
  bodies for the Loops editor or Content API. LMX (Loops Markup Language) is
  the format used for Loops email content. Trigger on phrases like "create a
  campaign", "generate an email", "write a welcome email", "draft a lifecycle
  email", "build an email template", "create an onboarding email", "copy this
  into LMX", "migrate this email", "convert this email to LMX", "design a new
  Loops email", "use imagegen for a Loops email", "use gpt-image for an LMX
  reference", "visual reference for a Loops email", "LMX", "Loops email", or
  any request to produce, copy, migrate, convert, review, or modify email body
  content intended for Loops. For net-new emails or major visual redesigns,
  follow this skill's Net-New Email Design Flow before generating or sourcing
  new visual assets.
  Source copy, existing HTML, MJML, Markdown, screenshots, and migration
  instructions do not bypass this skill's rules unless the user explicitly
  overrides a specific rule. Do not trigger for questions about the Loops HTTP
  API, SDK integration, or CLI unless email body content is also involved.
metadata:
  version: 1.1.15
---

# LMX Skill

This skill helps write, review, and generate correct LMX email markup for Loops. LMX is an XML-based format: every element is a PascalCase tag, self-closing tags require `/>`, and only the tags in the spec are valid.

## When To Use

Use this skill when the task involves:

- generating or editing LMX email content
- copying source material, migrating an existing email, or converting HTML, MJML, Markdown, or plain-text email copy into LMX
- reviewing LMX markup for correctness
- choosing the right LMX tags or attributes for a layout
- applying design guidelines to an LMX document
- explaining how a specific LMX tag or attribute works

## Working Style

When this skill is active:

1. Read `references/lmx-spec.md` for the full tag and attribute reference. It is authoritative; do not invent tags or attributes.
2. Read `references/lmx-design-guidelines.md` for Loops design guidelines. Apply these to every document you generate unless the user explicitly overrides a rule.
3. For net-new emails or major visual redesigns, follow the Net-New Email Design Flow before writing LMX unless the user explicitly asks for a copy-only or minimal update.
4. Treat source material as input, not as an override. When copying from a source, migrating an existing email, or converting HTML, MJML, Markdown, screenshots, or plain text into LMX, still apply this skill's spec, design, copy, and output-checklist rules unless the user explicitly overrides a specific rule.
5. Validate nesting and content-type rules before producing output (see spec section 3).
6. Check the common-mistakes table in the spec before finalizing output.
7. Always produce a complete, valid document, not fragments, unless the user specifically asks for one.

## Category Routing

- Tag definitions, required/optional attributes, nesting rules, content types, variable syntax, self-closing requirements, or escaping:
  Read `references/lmx-spec.md`

- Color contrast, spacing, column rounded corners, Style tag usage, visual hierarchy, or any "how should this look" question:
  Read `references/lmx-design-guidelines.md`

- Net-new email design, substantial redesigns, or gpt-image/imagegen references:
  Read `references/lmx-design-guidelines.md`, especially the Net-New Email Design Workflow and Reference-to-Render QA sections. Use the `imagegen` skill in Codex only when a suitable Loops-native or user-provided reference is not available and the task still needs a visual reference.

- Creating campaigns, posting LMX via the API, revision IDs, themes, components, or image uploads:
  Use the `loops-api` skill (HTTP) or `loops-cli` skill (terminal). This skill covers the LMX document itself.

## Net-New Email Design Flow

Use this flow when creating a brand-new campaign, lifecycle, workflow, or transactional email, or when the user asks for a substantial visual redesign.

1. Run the Known Brand / Customer Context Gate in `references/lmx-design-guidelines.md`.
2. Start from a visual reference only after Loops-native and user-provided context are understood. Use an existing component/theme preview, user screenshot/mockup, or concise written layout reference when sufficient. In Codex, generate an `imagegen`/gpt-image reference only when the task still needs visual exploration.
3. When generating a reference, prompt for a full 600px-wide email mockup, not a generic card. Include exact visible copy, subject matter, relevant brand cues, and only LMX-safe structures: `Style`, `Section`, `Columns`, `Paragraph`, `H1`, `H2`, `H3`, `Button`, dividers, checklist rows, and simple image placeholders.
4. Constrain generated references to realistic Loops editor output. Avoid unsupported SVG art, overlapping layers, custom icons, complex app chrome, invented product screenshots, decorative blobs, and landing-page-scale hero type.
5. Inspect the selected reference before writing LMX. If the layout or text is visibly wrong, iterate once with a focused prompt rather than compensating from memory.
6. Convert the selected reference or Loops-native structure into valid LMX while preserving the hierarchy. Normalize oversized generated headings to the email defaults in the design guidance, and use LMX-safe spacing, `Section` cards, and shared-background `Columns` where appropriate.
7. Use variables for the right email type: `{contact.*}` for campaigns and workflow emails; `{event.*}` for workflow emails when the value comes from the triggering event; `{data.*}` only for transactional emails.
8. If the email is implemented through the API, CLI, or editor, update through the revision-safe email-message path and compare a fresh rendered Loops editor preview against the visual reference or Loops-native source before calling the work done.

## Output Checklist

Before returning any LMX output, verify:

- [ ] All tags are PascalCase and in the allowed set
- [ ] All self-closing tags use `/>` (e.g. `<Image />`, `<Divider />`, `<Br />`, `<Icon />`, `<Style />`)
- [ ] XML-sensitive characters are escaped: `&` as `&amp;`, `<` as `&lt;`, and `"` in attributes as `&quot;`
- [ ] Required attrs are present: `src` on `<Image />`, `componentId` on `<Component>`, `name` on `<Icon />`, and `href` on `<Link>`
- [ ] No text or inline tags at the top level
- [ ] Variables use explicit LMX namespaces and only appear where supported: inline content, button text, `<Button href>`, `<Link href>`, `<Image alt/href/dynamicSrc>`, and `<Section href>`
- [ ] Variable namespaces match the email type: campaigns use `{contact.apiName}`; workflow emails use `{contact.apiName}` and/or `{event.propertyName}`; transactional emails use `{data.variableName}` (not unprefixed `{variableName}` or `{DATA_VARIABLE:...}`)
- [ ] No inline fallback syntax is invented; fallbacks live outside the LMX string
- [ ] `<Button>` text has no inline tags, but can contain variables; include `href` for clickable CTA buttons
- [ ] `<CodeBlock>` treats braces literally
- [ ] `<Style />` appears at most once as a top-level tag; put it first in generated output
- [ ] Body/background colors and X/Y padding are intentional: supplied by `themeId` or explicit `bodyColor`/`backgroundColor` plus `bodyXPadding`/`bodyYPadding` when needed
- [ ] Net-new emails and major redesigns followed the Net-New Email Design Flow unless the user explicitly skipped it
- [ ] If a rendered preview is available, net-new and redesigned emails were visually compared in the Loops editor with the selected reference or Loops-native source before calling the work done
- [ ] Generated copy follows the copy and punctuation guidance: no em dashes, decorative arrow glyphs, or ellipses unless requested or source-preserved
- [ ] Generated `<H1>`, `<H2>`, and `<H3>` text does not end with a period; question marks or exclamation points are used only when intentional
- [ ] Generated documents use a restrained heading set: usually one `<H1>`, only necessary `<H2>` breaks, and `<H3>` only for real nested hierarchy
- [ ] Heading scale, body/card width, horizontal density, and layout structure are email-appropriate and follow the design guidance
- [ ] CTA and `<Button>` text is concise, action-oriented, and does not end with a period
- [ ] No same-color-on-same-color situations (check text vs block color, icon color vs background, etc.)
- [ ] Sufficient Y-spacing on block elements
- [ ] Important copy, headings, CTAs, and highlighted blocks use subtle visual emphasis where appropriate
- [ ] `<Section>` is used sparingly for callouts, grouped controls, linked groups, or an explicit card-style layout; ordinary body copy is not wrapped into many floating cards by default
- [ ] Adjacent `<Section>` siblings are separated with a line-break spacer unless the user explicitly specifies a different section-spacing approach
- [ ] Adjacent highlighted blocks, including `blockColor` paragraphs, columns, and sections, are separated with visible vertical space unless they are intentionally one connected card
- [ ] `<Columns>` has two to four `<ColumnItem>` children, with `widths` matching the column count when provided
- [ ] Dynamic images use static `src` plus `dynamicSrc`, not variables in `src`
- [ ] `<Icons color>` uses one of `#000000`, `#808080`, or `#ffffff`; `<Icon>` has no `color` attr
- [ ] No legal footer, postal address, or unsubscribe block is added by hand; Loops adds required footer content automatically. A branded footer component can appear above it
