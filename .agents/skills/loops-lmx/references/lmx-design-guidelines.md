# LMX Design Guidelines

These guidelines apply to every LMX document unless the user explicitly overrides a rule. They cover visual design decisions that the spec does not enforce but that produce good-looking, readable emails.

---

## Known Brand / Customer Context Gate

For net-new LMX emails and major redesigns, when the user has not specified otherwise, inspect available Loops themes and components for an existing brand system, header, footer, logo, or reusable layout before creating new brand styling. Prefer existing team-owned themes/components over recreating brand styling or sourcing new assets. Only use external brand assets or uploads when no suitable Loops-native asset exists, the user explicitly requests net-new treatment, or the current demo context clearly requires a one-off asset.

Design implications:

- Use a matching `themeId` when a team-owned theme already sets the right colors, typography, button defaults, body/background treatment, or padding.
- Use `<Component componentId="..." />` when a team-owned component already provides the header, footer, logo area, social row, CTA block, disclaimer, or reusable layout.
- Preserve brand cues from selected themes/components in surrounding LMX: color palette, logo placement, type scale, button style, surface treatment, header/footer rhythm, and tone.
- For net-new or otherwise unspecified brand treatment, do not rebuild a team's header, footer, logo block, or branded system from external websites or screenshots when a Loops-native component already exists, unless the user explicitly asks for that.
- Use uploads for brand assets only when the team-owned theme/component set does not cover the need, the user asks for a net-new asset, or the demo requires a one-off image.

---

## Set Body, Background, And Padding

Every document should have intentional body and background colors, plus deliberate body padding, either from a referenced theme or from explicit `<Style />` overrides.

- `bodyColor`: the email body/card background (the centered content area)
- `bodyXPadding` and `bodyYPadding`: inner left/right and top/bottom padding inside the email body/card
- `backgroundColor`: the page/canvas behind the body
- `backgroundXPadding` and `backgroundYPadding`: outer canvas padding around the email body/card

If `<Style />` has a `themeId` and that theme already defines suitable body and background colors, do not duplicate those attributes unless you are intentionally overriding the theme. If no theme is used, or the theme colors are unknown, set both `bodyColor` and `backgroundColor` explicitly.

Setting both colors, either via theme or overrides, gives the email a clear visual structure and prevents the renderer from falling back to defaults that may clash with your content.

If `bodyColor` is not set, the email body does not get a separate card/background color, so the `backgroundColor` shows through behind the content. That can be useful for plain/full-width designs, but for card-like styled emails set both values intentionally.

Set horizontal padding deliberately. Most production emails should not leave content pressed against the body edges. Use `bodyXPadding` for the default left/right breathing room instead of adding `paddingLeft` and `paddingRight` to every block.

Default approach:
- `bodyXPadding="24"` and `bodyYPadding="24"` for most polished emails
- `bodyXPadding="32"` when the design is sparse, premium, or card-like
- `bodyXPadding="16"` or `"20"` only for compact transactional emails or dense tables/checklists
- `backgroundXPadding` and `backgroundYPadding` only when you need explicit canvas gutters around a separate body/card

```xml
<!-- Good: standalone colors and body padding -->
<Style bodyColor="#ffffff" backgroundColor="#f1f5f9" bodyXPadding="24" bodyYPadding="24" />

<!-- Good: theme provides colors; only override what needs changing -->
<Style themeId="st_123" bodyXPadding="24" bodyYPadding="24" />

<!-- Not this: missing backgroundColor without a theme known to provide it -->
<Style bodyColor="#ffffff" />
```

If the user asks for a dark email:

```xml
<Style bodyColor="#0f172a" backgroundColor="#020617" bodyXPadding="24" bodyYPadding="24" />
```

Always infer sensible defaults for `bodyXPadding` and `bodyYPadding` (typically `"16"` to `"32"`) even when the user does not specify them.

---

## Contrast: No Same-Color-On-Same-Color

Never place text, icons, or UI elements in the same color (or near-same color) as their background. Common failure modes to check:

**Text vs block/body background:**
- If `bodyColor` is white (`#ffffff`), `textBaseColor` must be dark (e.g. `#0f172a`, `#1e293b`).
- If you set `blockColor` on a `<Paragraph>` or heading, the text inside must have sufficient contrast against that `blockColor`, not just the body.
- Never use `textColor="#ffffff"` on a block with `blockColor="#ffffff"` or a light `bodyColor`.

**Buttons:**
- `bgColor` and `textColor` on `<Button>` must contrast. Dark backgrounds need light text. Light backgrounds need dark text.
- If no explicit `textColor` is set on a `<Button>`, assume the document's `textBaseColor` will be used; ensure that still contrasts against the button `bgColor`.

**CodeBlock:**
- `<CodeBlock>` has its own `blockColor`. If you set a custom `blockColor` on a `<CodeBlock>`, also ensure the surrounding `bodyColor` and the code text color are visually distinct from that block. A good default is a slightly darker or muted tint of the body color (e.g. `#f1f5f9` on a white body).
- If you change `<CodeBlock blockColor="...">` to a dark color, you must also visually account for the code text; note that there is no explicit text color attribute on `<CodeBlock>`, so use `blockColor` values that contrast with the inherited text color.

**Icons:**
- `<Icons color="...">` sets the icon color. If the `<Icons>` block sits on a `bodyColor` background, the icon color must contrast against the body. White icons on a white body are invisible.
- If you set `blockColor` on the `<Icons>` element, icon color must contrast against that, not the body.

---

## Add Spacing Around Elements

Use `bodyXPadding` on `<Style />` for global left/right breathing room, and use `paddingTop` and `paddingBottom` on block elements for vertical rhythm. Emails without spacing feel dense and hard to scan.

Default approach:
- Global body padding: start with `bodyXPadding="24" bodyYPadding="24"` unless the theme already defines good padding.
- Headings (`<H1>`, `<H2>`, `<H3>`): add `paddingTop="24"` or `paddingTop="32"` unless they are the first element.
- `<Paragraph>` after a heading: `paddingBottom="8"` to `"16"` is typical.
- `<Button>`: add `paddingTop="24"` and `paddingBottom="24"` to give CTAs room.
- `<Divider>`: typically fine without explicit padding, but add `paddingTop="16" paddingBottom="16"` if elements feel crowded.
- `<Image />`: `paddingBottom="16"` unless immediately followed by a caption paragraph.
- Adjacent top-level `<Section>` nodes: always add visible space between them. Unless the user explicitly specifies another spacing approach, separate section siblings with a line-break spacer. `<Br />` is inline-only and never top-level, so use a valid block wrapper such as `<Paragraph><Br /></Paragraph>`.
- Adjacent highlighted siblings: if two consecutive top-level blocks both use `blockColor` (for example a callout `<Paragraph>` followed by a highlighted `<Columns>` card), add visible vertical space between them or consolidate them into one grouped block. A compact valid spacer is `<Paragraph fontSize="12" lineHeight="100"><Br /></Paragraph>`. Only let highlighted blocks touch when the intent is a single connected card.

Use block-level `paddingLeft` and `paddingRight` for local insets only, such as a pill, callout, or nested panel. Do not use repeated per-block X padding as a substitute for `bodyXPadding`.

```xml
<!-- Good: elements breathe -->
<Style bodyColor="#ffffff" backgroundColor="#f1f5f9" bodyXPadding="24" bodyYPadding="24" />
<H1 paddingTop="8" paddingBottom="4">Welcome aboard</H1>
<Paragraph paddingBottom="16">Here is what happens next.</Paragraph>
<Button href="https://loops.so" bgColor="#0f172a" textColor="#ffffff" align="center" paddingTop="8" paddingBottom="24">Get started</Button>
```

---

## Email Width And Density

Design for a narrow email preview, not a landing page. A good LMX email should feel readable around a 600px-wide body, with clear hierarchy and enough whitespace to scan quickly.

Default heading scale for designed emails:
- `heading1FontSize`: usually `26`
- `heading2FontSize`: usually `20` to `24`
- `heading3FontSize`: usually `15` to `17`

Use larger heading sizes only when the surrounding design is sparse enough for them. Most email headers should stay at `heading1FontSize="26"` instead of using landing-page-scale type.

Keep body copy readable:
- Body text is usually `15` to `18` px with comfortable line height.
- Avoid lines that feel too wide or too close to the body edge.
- Prefer whitespace, grouping, alignment, typography, and hierarchy before adding decorative surfaces.
- Follow the Known Brand / Customer Context Gate for brand sources. If no brand system is available, choose one restrained accent color with neutral grays and near-black text.

Avoid hero-scale type, decorative complexity, or many floating cards unless the source design explicitly calls for that treatment.

---

## Reference-Driven Layout Fidelity

When converting a visual reference, screenshot, existing email, or detailed design notes into LMX, preserve the reference's structure instead of flattening it into generic centered text.

Translate the design into email-safe LMX:
- Use `Style` for global body colors, X/Y padding, typography, and button defaults.
- Use `Section` for real grouped panels, cards, callouts, or linked groups.
- Use `Columns` for compact comparative groups, checklist rows, and stat groups.
- Use ordinary spacing for the rest of the document.

If a reference detail cannot be reproduced exactly in LMX, use the closest email-safe equivalent and keep the original hierarchy intact.

When a rendered preview is available, compare it against the reference before calling the document done. Check composition, body width, X/Y padding, heading scale, wrapping, card padding, button size and placement, divider spacing, and footer placement. If the words are right but the layout is materially different, revise the LMX.

---

## Net-New Email Design Workflow

For a brand-new campaign, lifecycle, workflow, or transactional email, run the Known Brand / Customer Context Gate before creating a new visual direction.

Start from a visual reference before writing LMX unless the user explicitly asks for a copy-only/minimal update. A sufficient reference can be a team-owned theme/component, user-provided screenshot/mockup, existing email, or concise written layout reference. In Codex, use imagegen/gpt-image only when the Loops-native and user-provided context does not already cover the design need.

Prompt image generation for a full email mockup, not a generic card or landing page. The reference should be implementable in LMX and should show the email body on a simple canvas.

Suggested prompt shape:

```text
Use case: ui-mockup
Asset type: Loops email design reference
Primary request: Design a polished [email type] email for [purpose].
Text (verbatim): "[visible text lines]"
Brand/system source: Use these discovered Loops theme/component cues:
  [theme colors, typography, button style, logo/header/footer/component notes]
Style/medium: high-fidelity email UI mockup, 600px-wide email body
Composition/framing: full email shown on a light gray canvas, crisp white body,
  clear vertical rhythm, no overlapping elements
Design language: realistic production-quality email, clear hierarchy, purposeful
  spacing, simple grouping, every block earns its place
Layout priorities: use spacing, grouping, alignment, typography, and hierarchy
  first; use subtle surface tints, dividers, and borders only when needed
Color palette: Use the customer's supplied brand palette. If no brand palette is
  provided, choose one restrained accent color, near-black CTA, neutral grays,
  and readable body text.
Typography: compact email typography, restrained H1/H2 scale, no landing-page
  hero type
Constraints: Must be implementable in Loops LMX with Style, Section, Columns,
  Paragraph, H1/H2/H3, Button, Divider, Image placeholders, and simple checklist
  rows. No unsupported illustrations, no decorative blobs, no overlapping
  layers, no custom icon systems, no invented product screenshots, no card-on-card
  clutter, no unreadable text.
```

After generating the reference:

1. Inspect the selected image before writing LMX. Do not rely on the prompt or file path alone.
2. If the reference has wrong text, impossible layout, unreadable copy, or unsupported visual features, iterate once with a focused correction.
3. Convert the selected structure to LMX while preserving discovered theme/component cues. Preserve the layout hierarchy, but normalize generated heading sizes to the email defaults in this guide.
4. Prefer email-safe equivalents for unsupported details: simple `Section` cards, shared-background `Columns`, subtle `blockColor` callouts, dividers, and ordinary spacing.
5. Keep generated image output as the visual source of truth. The generated image is not the email artifact; the final artifact is valid LMX.

---

## Reference-to-Render QA

For net-new emails and major redesigns, visual QA is required whenever a rendered Loops editor preview is available. Text checks are not enough because correct words can still produce a layout that misses the reference or violates the team's existing brand system.

Required comparison surfaces:

- overall composition, alignment, body width, and density
- heading scale, wrapping, hierarchy, and vertical rhythm
- body/card width, padding, border, radius, and background treatment
- pill, callout, columns, checklist rows, and button size/color/position
- divider/footer placement and spacing
- copy/content, including subject and preview text when applicable

Compare the selected visual reference, source component/theme, or screenshot against a fresh rendered email preview. Normalize the comparison by using the same email content region, viewport, selected email, editor mode, crop, and scale where practical. If the rendered email has the right words but the layout is materially different from the reference or team-owned source, revise the LMX and compare again.

If LMX cannot reproduce a reference detail, state which detail is unsupported, implement the closest email-safe equivalent, and verify that the result still preserves the reference's structure and visual hierarchy.

---

## Visual Contract Checklist

Before finalizing a designed LMX email, check the visual contract:

- Brand fidelity: the rendered email preserves the selected brand source's logo, header, footer, color, typography, and button cues.
- Layout structure: body width, X/Y padding, surface treatment, and vertical rhythm feel like a production email, not a landing page or generic card.
- Surfaces and borders: cards/callouts use wrapper surfaces such as `<Section>` or shared-background `<Columns>` instead of fragile per-child border tricks.
- Hierarchy: one clear primary heading, compact section headings, readable body text, and selective emphasis.
- Checklist/stat rows: use simple LMX-safe `Columns`, dividers, spacing, and text emphasis; do not depend on custom icon systems or overlapping art.
- CTA placement: primary CTA is easy to find, high contrast, and sized like an email button.
- Header/footer: header, footer, logo, and social treatment match the selected brand source; legal footer/unsubscribe content is not recreated manually.
- Render QA: a fresh Loops editor preview has been checked for spacing, wrapping, contrast, footer placement, and brand consistency.

---

## Copy Quality And Punctuation

LMX output is often generated from rough notes, screenshots, Markdown, HTML, or pasted marketing copy. Treat that material as source input, then produce copy that reads like a polished email while still respecting the user's intent.

### Generated Copy

For generated or rewritten copy:

- Avoid em dashes unless the user explicitly asks for them. Prefer commas, colons, parentheses, or shorter sentences.
- Avoid decorative arrow glyphs and ellipses unless they are part of a user-provided brand style or exact source copy.
- Keep sentences direct. Do not use punctuation to create artificial drama or a generic "AI-written" cadence.
- Prefer one clear idea per sentence over long compound lines.

### Source Copy

When the user asks for exact migration or preservation, keep source punctuation unless it violates XML escaping, creates invalid LMX, or conflicts with a rule the user explicitly asked you to apply. If the user asks to improve or rewrite the source, apply the generated-copy rules.

### Headings

Generated heading text in `<H1>`, `<H2>`, and `<H3>` should read like labels, not body sentences:

- Do not end generated headings with periods.
- Use question marks only for real questions.
- Use exclamation points sparingly and only when the requested tone calls for them.
- Preserve source heading punctuation only when the user asks for exact copy preservation.

Default to a small heading set. Most generated emails need one `<H1>`, a few `<H2>` elements only for major content breaks, and no `<H3>` unless the structure truly has nested hierarchy. Do not add a heading above every short paragraph, list, checklist item, or card. If a phrase only needs emphasis inside body copy, prefer `<Strong>` in a `<Paragraph>` or `<ListItem>` instead of introducing another heading level.

```xml
<!-- Good: headings read as labels -->
<H1>Welcome aboard</H1>
<H2>Your setup checklist</H2>
<H3>Before you send</H3>

<!-- Not this: terminal periods make headings feel like body copy -->
<H1>Welcome aboard.</H1>
<H2>Your setup checklist.</H2>
<H3>Before you send.</H3>
```

### CTAs And Buttons

Button copy should be compact and action-oriented:

- Use clear verbs such as `Start`, `View`, `Create`, `Send`, `Review`, or `Upgrade`.
- Avoid trailing periods in `<Button>` text.
- Avoid inline punctuation tricks to make a weak CTA feel stronger.

```xml
<!-- Good: short action copy -->
<Button href="https://example.com/report">View report</Button>

<!-- Not this: button copy is sentence-like and over-punctuated -->
<Button href="https://example.com/report">View your report.</Button>
```

---

## Rounded Column Layouts

LMX supports two, three, or four `<ColumnItem>` children inside `<Columns>`. If you need a rounded multi-column card, put the shared background and radius on `<Columns>` itself.

Avoid applying matching `blockBorderRadius` values to separate block elements inside each `<ColumnItem>` with the intention of rounding the whole column layout. Columns render as adjacent table cells; two independently rounded inner blocks placed side by side can produce awkward mismatched corners.

Avoid this pattern:

```xml
<!-- Bad - rounded inner blocks in columns look broken -->
<Columns gap="0" widths="50,50">
  <ColumnItem>
    <Paragraph blockColor="#e2e8f0" blockBorderRadius="12">Left</Paragraph>
  </ColumnItem>
  <ColumnItem>
    <Paragraph blockColor="#e2e8f0" blockBorderRadius="12">Right</Paragraph>
  </ColumnItem>
</Columns>
```

Use this pattern instead:

```xml
<Columns gap="24" widths="50,50" blockColor="#f8fafc" blockBorderRadius="12" paddingTop="16" paddingBottom="16">
  <ColumnItem>
    <Paragraph>Left</Paragraph>
  </ColumnItem>
  <ColumnItem>
    <Paragraph>Right</Paragraph>
  </ColumnItem>
</Columns>
```

For three- and four-column layouts, provide one width value per `<ColumnItem>`, for example `widths="33,33,34"` or `widths="25,25,25,25"`.

Rounding is fine on standalone blocks (outside `<Columns>`), on `<Button>`, and on `<Image />`.

---

## Centered Pill Labels

When a design calls for a small centered pill, badge, or eyebrow label, use a three-column layout with empty side columns and the pill in the center column. This keeps the pill from stretching full-width while preserving reliable email rendering.

Use `gap="12"` unless there is a reason for more space; `12` is the minimum valid `<Columns>` gap. Keep `stackOnMobile="false"` so the empty side columns continue to center the pill on mobile.

This is a narrow exception to the rounded-column guidance above: only the center column contains a rounded block, and the side columns are empty. Do not use this pattern to fake one connected rounded multi-column card; put the shared background and radius on `<Columns>` for that.

```xml
<Columns widths="25,50,25" gap="12" stackOnMobile="false">
  <ColumnItem>
    <Paragraph><Br /></Paragraph>
  </ColumnItem>

  <ColumnItem>
    <Paragraph
      fontSize="13"
      lineHeight="140"
      align="center"
      blockColor="#eef2ff"
      blockBorderRadius="999"
      paddingTop="8"
      paddingRight="14"
      paddingBottom="8"
      paddingLeft="14"
    >
      <Text textColor="#4f46e5">
        <Strong>Stripe</Strong> product announcement
      </Text>
    </Paragraph>
  </ColumnItem>

  <ColumnItem>
    <Paragraph><Br /></Paragraph>
  </ColumnItem>
</Columns>
```

Key details:

- `widths="25,50,25"` centers the pill by reserving empty side columns.
- `blockColor` sets the pill background.
- `blockBorderRadius="999"` makes the pill fully rounded.
- Side columns need valid block content, so use `<Paragraph><Br /></Paragraph>`.
- Keep pill text short enough for the center column, or widen the center column with a matching `widths` adjustment such as `20,60,20`.

---

## Sections For Callouts And Cards

Use `<Section>` sparingly when a design needs a callout, card, grouped controls, linked group, or framed content area around multiple related blocks. Put the background, radius, padding, and optional link on the section instead of repeating the same styling on every child block.

Do not wrap every heading/paragraph pair in a `<Section>` by default. Most email bodies should flow through ordinary top-level blocks (`<H1>`, `<H2>`, `<Paragraph>`, lists, images, buttons), with one or two `<Section>` callouts only where the emphasis is useful. Many floating cards in the email body make the layout feel busy unless that card-heavy style is explicitly requested or clearly present in the source design.

```xml
<H1>Your report is ready</H1>
<Paragraph paddingBottom="16">Here are the highlights from this week.</Paragraph>

<Section blockColor="#f8fafc" blockBorderRadius="12" paddingTop="16" paddingRight="16" paddingBottom="16" paddingLeft="16">
  <H2>Account summary</H2>
  <Paragraph>Your latest report is ready.</Paragraph>
  <Button href="https://example.com/report" bgColor="#0f172a" textColor="#ffffff">View report</Button>
</Section>
```

Do not nest `<Section>` inside another `<Section>`. If you need grouped content inside a card, use ordinary child blocks, lists, columns, or dividers within one section.

When an explicit card-style layout does require multiple top-level `<Section>` siblings, do not place them directly next to each other. Add a line-break spacer between them unless the user explicitly specifies a different spacing treatment:

```xml
<Section blockColor="#f8fafc" blockBorderRadius="12" paddingTop="16" paddingRight="16" paddingBottom="16" paddingLeft="16">
  <H2>First group</H2>
  <Paragraph>Details for the first group.</Paragraph>
</Section>
<Paragraph><Br /></Paragraph>
<Section blockColor="#ffffff" blockBorderRadius="12" paddingTop="16" paddingRight="16" paddingBottom="16" paddingLeft="16">
  <H2>Second group</H2>
  <Paragraph>Details for the second group.</Paragraph>
</Section>
```

Apply the same spacing rule to other adjacent highlighted blocks. For example, do not place a `blockColor` paragraph directly against a `blockColor` columns group unless they are meant to read as one connected card.

---

## CodeBlock Color Pairing

When you set a custom `blockColor` on a `<CodeBlock>`, visually pair it with the surrounding body:

- Light body (`bodyColor="#ffffff"`): use a subtle tinted block, e.g. `blockColor="#f8fafc"` or `blockColor="#f1f5f9"`. This creates separation without jarring contrast.
- Dark body (`bodyColor="#0f172a"`): use a slightly lighter dark, e.g. `blockColor="#1e293b"`.
- Avoid colorful block colors on `<CodeBlock>`; code should read as technical/neutral.

---

## Visual Hierarchy Summary

- One `<H1>` per document (unless the content genuinely has multiple top-level sections).
- Follow heading levels in order: `<H1>` -> `<H2>` -> `<H3>`. Don't skip levels for styling reasons; adjust `fontSize` instead.
- Keep generated heading hierarchy compact by default: avoid creating a heading for every paragraph, list, or small card.
- Use subtle emphasis to draw attention to the most important content. In inline-content blocks such as `<Paragraph>`, `<ListItem>`, `<Quote>`, `<H1>`, `<H2>`, and `<H3>`, wrap short key phrases with `<Strong>` rather than bolding whole paragraphs.
- Buttons cannot contain inline formatting tags, so make CTA buttons feel visually strong through clear action copy, high-contrast `bgColor`/`textColor`, enough padding, centered alignment when appropriate, and a restrained `borderRadius`.
- Make headers and important callouts stand out with hierarchy, spacing, color, a light `blockColor` treatment, or a sparingly used `<Section>`. Keep emphasis selective so the whole email still feels calm and scannable.
- CTAs (`<Button>`) should stand out: high contrast, enough padding, aligned centrally for most transactional emails.
- Use `<Divider />` sparingly to separate distinct sections, not between every element.
- Keep icon rows (`<Icons>`) near the footer, typically the last or second-to-last block.
