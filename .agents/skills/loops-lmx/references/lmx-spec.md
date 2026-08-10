# LMX Specification

LMX (Loops Markup Language) is an XML-based email content format for the Loops editor and email editing API endpoints. Every element is a PascalCase tag; there is no Markdown or HTML shorthand.

---

## 1. Core Rules

1. **XML, not HTML.** Tags are case-sensitive PascalCase: `<Paragraph>`, not `<paragraph>` or `<p>`.
2. **Self-closing tags must use `/>`.** Example: `<Image src="..." />`, `<Br />`, `<Divider />`.
3. **Only documented tags are valid.** Unknown tags fail parsing.
4. **Unknown attributes are warnings and have no effect.** Do not invent attributes.
5. **Required attributes must be present.** Required attrs include `src` on `<Image />`, `componentId` on `<Component>`, `name` on `<Icon />`, and `href` on `<Link>`. Missing required attributes can make email-message updates fail with HTTP 422 because LMX cannot compile.
6. **All attribute values are quoted strings.** Numbers and booleans are written as strings: `width="400"`, `notrack="true"`.
7. **Top-level text and variables are invalid.** Wrap all text and variables in a block tag such as `<Paragraph>`.
8. **Whitespace between block tags is ignored.** Indent and line-break freely.
9. **Escape `<` and `&` in text** as `&lt;` and `&amp;`. Escape `"` and `&` in attribute values as `&quot;` and `&amp;`.
10. **One `<Style />` tag maximum.** It is top-level metadata. Prefer putting it first; the exporter always emits it first.
11. **LMX is separate from MJML upload syntax.** Do not use MJML tags or legacy dynamic tag prefixes inside LMX (for example `{DATA_VARIABLE:...}` or unprefixed `{firstName}`).
12. **API payload limit:** LMX sent through the email-message API must be at most 100 KB.

---

## 2. Top-Level Structure

A valid document contains zero or more top-level block tags, plus an optional single `<Style />`:

```text
H1, H2, H3, Paragraph, Quote, CodeBlock, Button, Image,
Divider, OrderedList, UnorderedList, Columns, Component,
Icons, Section, Style
```

Not valid at the top level:

```text
ListItem, ColumnItem, Icon, Br, Strong, Em, Underline, Strike,
Code, Text, Link
```

Example:

```xml
<Style themeId="st_123" bodyColor="#ffffff" backgroundColor="#f1f5f9" bodyYPadding="24" />
<H1>Welcome</H1>
<Paragraph>Hello world.</Paragraph>
```

---

## 3. Content Types And Nesting

| Content type | Meaning |
| --- | --- |
| `inline` | Text, variables, inline tags, and `<Br />` |
| `text` | Text and variables only; no inline formatting tags |
| `raw` | Literal text only; braces are not parsed as variables |
| `none` | No text content; only declared element children or self-closing |

Nesting summary:

- `<H1>`, `<H2>`, `<H3>`, `<Paragraph>`, `<Quote>`, `<ListItem>` -> inline content.
- `<Button>` -> text content with variables allowed, but no inline formatting tags.
- `<CodeBlock>` -> raw literal text; variables are not parsed.
- `<OrderedList>`, `<UnorderedList>` -> one or more `<ListItem>` children.
- `<Columns>` -> two to four `<ColumnItem>` children.
- `<ColumnItem>` -> block tags, excluding `<Style>` and nested `<Columns>`.
- `<Component>` -> block tags, excluding `<Style>` and nested `<Component>`.
- `<Section>` -> block tags, excluding `<Style>` and nested `<Section>`.
- `<Icons>` -> one to 100 `<Icon />` children.
- Self-closing with no children: `<Image />`, `<Divider />`, `<Br />`, `<Icon />`, `<Style />`.

---

## 4. Shared Attributes

### Block Style Attributes

These appear on many block tags:

| Attribute | Type | Notes |
| --- | --- | --- |
| `blockColor` | hex color | Block background |
| `blockBorderRadius` | number | 0-999 |
| `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | number | Pixels |

### Text Block Attributes

Used by headings, paragraphs, quotes, and list items:

| Attribute | Type | Notes |
| --- | --- | --- |
| `fontSize` | number | Headings/paragraphs/list items: 12-64 |
| `lineHeight` | number | Percentage, 100-300 |
| `align` | enum | `left`, `center`, `right` |
| block style attrs | mixed | See above |

---

## 5. Block Tag Reference

### 5.1 Headings: `<H1>`, `<H2>`, `<H3>`

Inline content. Optional text block attributes.

```xml
<H1>Plain heading</H1>
<H2 align="center" fontSize="28">Centered heading</H2>
<H3 blockColor="#f8fafc" paddingTop="16">Heading on a tinted block</H3>
```

### 5.2 `<Paragraph>`

Inline content. Optional text block attributes.

```xml
<Paragraph>Plain paragraph.</Paragraph>
<Paragraph>Mixed <Strong>bold</Strong>, <Em>italic</Em>, and <Link href="https://loops.so">a link</Link>.</Paragraph>
<Paragraph>Hello {contact.firstName}.</Paragraph>
```

### 5.3 `<Quote>`

Inline content. Optional text block attributes.

```xml
<Quote>A short quotation.</Quote>
<Quote fontSize="16">Quoted <Em>italic</Em> text.</Quote>
```

### 5.4 `<CodeBlock>`

Raw literal text only. Inline tags and variables are not parsed.

Optional attributes: `fontSize`, `lineHeight`, and block style attrs.

```xml
<CodeBlock>const literal = "{contact.firstName}";</CodeBlock>
```

### 5.5 `<Button>`

Text content with variables allowed. Inline tags such as `<Strong>` and `<Link>` are invalid inside buttons.

| Attribute | Type | Required | Notes |
| --- | --- | :---: | --- |
| `href` | url / dynamic string | | Supports variables; include it for clickable CTA buttons |
| `bgColor`, `textColor`, `borderColor`, `blockColor` | hex color | | |
| `borderRadius` | number | | 0-999 |
| `borderWidth` | number | | 0-16 |
| `innerXPadding`, `innerYPadding` | number | | 0-100 |
| `fontSize` | number | | 6-64 |
| `align` | enum | | `left`, `center`, `right` |
| `notrack` | boolean | | `"true"` disables tracking for this link |
| block style attrs | mixed | | Block background / padding |

```xml
<Button href="https://loops.so/start" bgColor="#000000" textColor="#ffffff" borderRadius="12">Get started</Button>
<Button href="https://app.example.com/users/{contact.userId}">Open profile</Button>
```

Do not use the old `size` attribute; it is not supported.

### 5.6 `<Image />`

Self-closing.

| Attribute | Type | Required | Notes |
| --- | --- | :---: | --- |
| `src` | url | yes | Static placeholder/source URL; no variables |
| `alt` | string / dynamic string | | Supports variables |
| `href` | url / dynamic string | | Supports variables |
| `width` | number | | 12-600 pixels |
| `align` | enum | | `left`, `center`, `right` |
| `borderRadius` | number | | 0-999 |
| `borderWidth` | number | | 0-16 |
| `borderColor` | hex color | | |
| `dynamicSrc` | url / dynamic string | | Use this for dynamic image URLs |
| `notrack` | boolean | | |
| block style attrs | mixed | | Block background / padding |

```xml
<Image src="https://cdn.example.com/logo.png" alt="Company logo" width="180" align="center" />
<Image src="https://cdn.example.com/avatar-placeholder.png" dynamicSrc="{contact.avatarUrl}" alt="{contact.firstName}" />
```

Use a static `src` for the placeholder or Loops-hosted image. For externally hosted dynamic images, keep `src` static and put the dynamic URL in `dynamicSrc`. Dynamic images must be publicly accessible and use an email-safe image extension such as `.jpg` or `.png`.

### 5.7 `<Divider />`

Self-closing.

| Attribute | Type | Notes |
| --- | --- | --- |
| `align` | enum | `left`, `center`, `right` |
| `width` | number | Percentage, 10-100 |
| `borderWidth` | number | 1-16 |
| `color` | hex color | |
| block style attrs | mixed | Block background / padding |

```xml
<Divider />
<Divider width="80" color="#cbd5e1" />
```

### 5.8 `<Br />`

Line break inside inline content. Never top-level.

```xml
<Paragraph>Line one<Br />Line two</Paragraph>
```

### 5.9 `<OrderedList>` / `<UnorderedList>` and `<ListItem>`

Lists must contain at least one `<ListItem>`. `<ListItem>` accepts inline content and optional text block attributes except `align`.

`<OrderedList>` attributes:

| Attribute | Type | Notes |
| --- | --- | --- |
| `start` | number | Starting number |
| `align` | enum | `left`, `center`, `right` |

`<UnorderedList>` attributes:

| Attribute | Type | Notes |
| --- | --- | --- |
| `align` | enum | `left`, `center`, `right` |

```xml
<OrderedList start="3">
  <ListItem>First item</ListItem>
  <ListItem>Second item with <Strong>bold</Strong></ListItem>
</OrderedList>
```

### 5.10 `<Columns>` and `<ColumnItem>`

Multi-column layout. `<Columns>` must contain two to four `<ColumnItem>` children. `<ColumnItem>` takes no attributes and contains block tags, excluding nested columns.

`<Columns>` attributes:

| Attribute | Type | Notes |
| --- | --- | --- |
| `gap` | number | 12-150 pixels |
| `widths` | string | Comma-separated percentages matching the number of columns, such as `"50,50"`, `"33,33,34"`, or `"25,25,25,25"` |
| `verticalAlignment` | enum | `top`, `middle`, `bottom` |
| `stackOnMobile` | boolean | |
| `reverseOnMobile` | boolean | |
| block style attrs | mixed | Block background / padding |

```xml
<Columns gap="24" widths="40,60" verticalAlignment="middle">
  <ColumnItem>
    <H3>Left</H3>
    <Paragraph>Left body.</Paragraph>
  </ColumnItem>
  <ColumnItem>
    <Image src="https://cdn.example.com/pic.png" />
  </ColumnItem>
</Columns>
```

### 5.11 `<Component>`

Embeds a reusable Loops email component. `componentId` is required.

Two input forms are accepted:

- Self-closing reference: `<Component componentId="cmp_123" />`
- Explicit children: `<Component componentId="cmp_123"><Paragraph>Local override</Paragraph></Component>`

Components cannot nest inside components.

| Attribute | Type | Required | Notes |
| --- | --- | :---: | --- |
| `componentId` | string | yes | Team-owned component id |
| block style attrs | mixed | | Block background / padding |

```xml
<Component componentId="cmp_123" />
<Component componentId="cmp_123" blockColor="#f8fafc" paddingTop="16">
  <Paragraph>Locally edited component content</Paragraph>
</Component>
```

### 5.12 `<Section>`

Clickable or styled block container. Use sections to create layout cards, groups, or framed content areas around related blocks. Contains block tags. Sections cannot nest inside sections.

| Attribute | Type | Notes |
| --- | --- | --- |
| `href` | url / dynamic string | Supports variables |
| `notrack` | boolean | `"true"` disables tracking |
| block style attrs | mixed | Block background / padding |

```xml
<Section href="https://example.com/{contact.userId}" blockColor="#f8fafc" blockBorderRadius="12" paddingTop="16" paddingBottom="16">
  <H2>Account summary</H2>
  <Paragraph>Review your latest activity.</Paragraph>
</Section>
```

### 5.13 `<Icons>` and `<Icon />`

Social/icon row. `<Icons>` must contain one to 100 `<Icon />` children.

`<Icons>` attributes:

| Attribute | Type | Notes |
| --- | --- | --- |
| `align` | enum | `left`, `center`, `right` |
| `gap` | number | 4-200 pixels |
| `size` | number | 18-48 pixels |
| `color` | enum | `#000000`, `#808080`, or `#ffffff` |
| block style attrs | mixed | Block background / padding |

`<Icon />` attributes:

| Attribute | Type | Required | Notes |
| --- | --- | :---: | --- |
| `name` | string | yes | Known Font Awesome icon name |
| `href` | url | | |
| `notrack` | boolean | | |

```xml
<Icons align="center" gap="20" size="24" color="#000000">
  <Icon name="twitter" href="https://x.com/loops" />
  <Icon name="github" href="https://github.com/loops" />
</Icons>
```

Common icon names include `twitter`, `instagram`, `linkedin`, `youtube`, `github`, `discord`, `envelope`, `link`, and `phone`. Unknown icon names are validation errors. Per-icon `color` is not supported.

### 5.14 `<Style />`

Self-closing top-level metadata. It does not render content. All attributes are optional. Use `themeId` for the current theme/style-template id.

| Attribute | Type |
| --- | --- |
| `themeId` | string |
| `backgroundColor`, `backgroundXPadding`, `backgroundYPadding` | string / number |
| `bodyColor`, `bodyXPadding`, `bodyYPadding`, `bodyFontFamily`, `bodyFontCategory` | string / number |
| `borderColor`, `borderWidth`, `borderRadius` | string / number |
| `buttonBodyColor`, `buttonBodyXPadding`, `buttonBodyYPadding` | string / number |
| `buttonBorderColor`, `buttonBorderWidth`, `buttonBorderRadius` | string / number |
| `buttonTextColor`, `buttonTextFontSize` | string / number |
| `dividerColor`, `dividerBorderWidth` | string / number |
| `textBaseColor`, `textBaseFontSize`, `textBaseLineHeight`, `textBaseLetterSpacing` | string / number |
| `textLinkColor` | string |
| `heading1Color`, `heading1FontSize`, `heading1LineHeight`, `heading1LetterSpacing` | string / number |
| `heading2Color`, `heading2FontSize`, `heading2LineHeight`, `heading2LetterSpacing` | string / number |
| `heading3Color`, `heading3FontSize`, `heading3LineHeight`, `heading3LetterSpacing` | string / number |

```xml
<Style themeId="st_123" bodyColor="#ffffff" backgroundColor="#f1f5f9" bodyYPadding="24" />
<Paragraph>Hello</Paragraph>
```

If `themeId` references a theme that already defines body/background colors, duplicate `bodyColor` and `backgroundColor` attributes are not required unless you want to override the theme. If `bodyColor` is omitted and the theme does not provide one, the `backgroundColor` is visible behind the email content instead of a distinct body/card surface.

---

## 6. Inline Tags

Inline tags live inside inline-content blocks (`<H1>`, `<H2>`, `<H3>`, `<Paragraph>`, `<Quote>`, `<ListItem>`) and can nest inside one another.

| Tag | Effect |
| --- | --- |
| `<Strong>...</Strong>` | Bold |
| `<Em>...</Em>` | Italic |
| `<Underline>...</Underline>` | Underline |
| `<Strike>...</Strike>` | Strikethrough |
| `<Code>...</Code>` | Inline code |
| `<Text>...</Text>` | No format; carries `textColor` only |
| `<Link href="...">...</Link>` | Hyperlink |

All format tags plus `<Text>` accept optional `textColor`. It must be a 3- or 6-digit hex color such as `#f00` or `#ff0000`.

`<Link>` attributes:

| Attribute | Type | Required | Notes |
| --- | --- | :---: | --- |
| `href` | url / dynamic string | yes | Supports variables |
| `notrack` | boolean | | `"true"` disables tracking |

```xml
<Paragraph>Mixed <Strong>bold</Strong>, <Em>italic</Em>, and <Strong><Em>both</Em></Strong>.</Paragraph>
<Paragraph>A <Link href="https://example.com/{contact.userId}">dynamic link</Link>.</Paragraph>
<Paragraph><Text textColor="#f00">Red text</Text> and <Strong textColor="#00f">blue bold text</Strong>.</Paragraph>
```

---

## 7. Variables And Dynamic Content

LMX variables use braced expressions with explicit namespaces.

| Syntax | Kind | Email types |
| --- | --- | --- |
| `{contact.firstName}` | Contact property / merge tag | Campaign and workflow email messages |
| `{event.planName}` | Event property | Workflow email messages |
| `{data.resetLink}` | Transactional data variable | Transactional email messages |

Use explicit namespaces in LMX. The prefix tells Loops which data source to resolve at send time.

Email-type rules:

- **Campaigns** support `{contact.*}` only.
- **Workflow emails** support `{contact.*}` and `{event.*}`.
- **Transactional emails** support `{data.*}` only.

Variables can be used in LMX email bodies, and also in email sending settings (subject, preview, from name, from email, reply to), both in the Loops editor and when updating email messages with the API.

### Contact properties (`{contact.X}`)

Use `{contact.apiName}` for campaign and workflow personalization, for example `{contact.firstName}`.

Default contact properties currently include:

```text
firstName, lastName, email, notes, source, userGroup, userId,
subscribed, createdAt
```

Custom contact properties are referenced by API name, for example `{contact.companyName}`.

### Event properties (`{event.X}`)

Use `{event.propertyName}` in workflow email LMX when the value comes from the triggering event. The name after `event.` must match a property on the event that triggered the workflow.

```xml
<H1>Welcome to {event.planName}</H1>
<Paragraph>Hi {contact.firstName}, your {event.planName} plan is ready.</Paragraph>
```

```json
{
  "email": "user@example.com",
  "eventName": "signup",
  "eventProperties": {
    "planName": "Pro"
  }
}
```

Event-property rules:

- Names are case-sensitive.
- Event properties are scoped to the triggering event; they do not update the contact record.
- Provide `eventPropertiesFallbacks` on the email message when a property may be missing.

### Transactional data variables (`{data.X}`)

Use `{data.variableName}` in transactional email LMX. The name after `data.` must match a key in the `dataVariables` object on `POST /v1/transactional`.

```xml
<H1>Reset your password, {data.firstName}</H1>
<Paragraph>Click the button below to choose a new password.</Paragraph>
<Button href="{data.resetLink}" align="center">Reset password</Button>
```

```json
{
  "transactionalId": "cll42l54f20i1la0lfooe3z12",
  "email": "user@example.com",
  "dataVariables": {
    "firstName": "Alex",
    "resetLink": "https://app.example.com/reset/abc123"
  }
}
```

Transactional data-variable rules:

- Names are case-sensitive (`{data.resetLink}` and `{data.ResetLink}` are different variables).
- Names may contain only letters, numbers, underscores, and dashes.
- API values may be `string` or `number`.
- Non-optional variables must be present in `dataVariables` or the send fails.
- Optional variables may be omitted from the request or sent as an empty string `""` (`null` does not work).

Do not use editor or MJML transactional syntax in LMX:

- `{resetLink}` (unprefixed) is invalid in LMX; use `{data.resetLink}`.
- `{DATA_VARIABLE:resetLink}` is valid in MJML and the Loops editor, but not in LMX.

Use the namespace that matches the email type: `{contact.X}` for campaigns and workflow emails, `{event.X}` for workflow emails when the value comes from the triggering event, and `{data.X}` for transactional emails. Do not mix namespaces across email types.

Variables are valid in:

- inline content: headings, paragraphs, quotes, list items, and inline tags
- button text
- supported dynamic attributes:
  - `<Button href="...">`
  - `<Link href="...">`
  - `<Image alt="..." href="..." dynamicSrc="...">`
  - `<Section href="...">`

Variables are not valid:

- at the top level
- inside `<CodeBlock>` (braces are literal)
- inside unsupported attributes such as `<Image src="{contact.avatarUrl}" />`
- unprefixed in validated LMX (`{firstName}` should be `{contact.firstName}`, `{event.firstName}`, or `{data.firstName}` depending on email type)

### Fallback Values

LMX does not have inline fallback syntax. Do not invent forms such as `{contact.firstName|there}`, `{contact.firstName:there}`, `{contact.firstName ?? "there"}`, or attributes like `fallback="there"`.

Fallbacks for contact and event properties are editor/email-message metadata outside the LMX string. The LMX import/export path serializes only the variable reference itself:

```xml
<Paragraph>Hi {contact.firstName}</Paragraph>
```

If a user asks for fallback behavior in LMX output, mention that the LMX markup can reference the variable, but fallback values must be configured through the Loops editor or metadata path that owns the email message fallbacks (`contactPropertiesFallbacks` for campaigns and workflow emails, `eventPropertiesFallbacks` for workflow emails). For transactional emails, mark a data variable as optional in the editor instead of inventing inline fallback syntax.

---

## 8. Common Mistakes

| Mistake | Fix |
| --- | --- |
| `<paragraph>`, `<p>`, `<P>` | Use `<Paragraph>` |
| `<Image src="x.png">` | Use `<Image src="x.png" />` |
| `<Image />` | Add the required static `src`: `<Image src="https://..." />` |
| CTA `<Button>` without `href` | Add `href` when the button should be clickable |
| `<Link>docs</Link>` | Add the required `href`: `<Link href="https://...">docs</Link>` |
| `<Component />` | Add the required `componentId`: `<Component componentId="cmp_123" />` |
| `<Icon />` | Add the required `name`: `<Icon name="twitter" />` |
| Plain text at top level | Wrap in `<Paragraph>...</Paragraph>` |
| `<Strong>` at top level | Wrap in a block such as `<Paragraph>` |
| `<Button><Strong>Click</Strong></Button>` | Button text cannot contain inline tags |
| `{firstName}` in LMX | Use `{contact.firstName}` for campaigns and workflow emails, `{event.firstName}` only when the value comes from the triggering event, or `{data.firstName}` for transactional emails |
| `{event.planName}` in a campaign or transactional email | Event properties are valid only in workflow email LMX |
| `{contact.firstName}` in transactional LMX | Transactional emails support `{data.*}` only |
| `{data.resetLink}` in a campaign or workflow email | Data variables are valid only in transactional email LMX |
| `{DATA_VARIABLE:resetLink}` in LMX | Use `{data.resetLink}`; `DATA_VARIABLE:` is MJML/editor syntax, not LMX |
| `{resetLink}` in transactional LMX | Use `{data.resetLink}` |
| `{contact.firstName|there}` or similar fallback syntax | No inline fallback syntax exists in LMX; configure fallbacks outside the LMX string |
| `<Image src="{contact.imageUrl}" />` | Use static `src` plus `dynamicSrc="{contact.imageUrl}"` |
| `<Columns>` with one or more than four `<ColumnItem>` children | Use two to four `<ColumnItem>` children |
| `<Icon color="#f00" />` | Set `color` on `<Icons>` and use one of the allowed colors |
| `<Icons color="#334155">` | Use `#000000`, `#808080`, or `#ffffff` |
| Two `<Style />` tags | Use only one |
| Adjacent top-level `<Section>` siblings with no spacer | Add a line-break spacer between sections unless the user explicitly specified a different spacing treatment |
| Adjacent top-level `blockColor` blocks with no spacer | Add visible vertical space between highlighted blocks unless they are intentionally one connected card |
| Unescaped `<` or `&` in text | Use `&lt;` and `&amp;` |
| Manual legal footer, postal address, or unsubscribe block | Omit it; Loops adds required footer content automatically. A branded footer component can appear above it |

---

## 9. Full Example Documents

### Campaign example

```xml
<Style themeId="st_123" bodyColor="#ffffff" backgroundColor="#f3f4f6" bodyYPadding="24" textBaseColor="#111827" />
<H1>Welcome, {contact.firstName}</H1>
<Paragraph fontSize="16" lineHeight="150">
  Thanks for joining. Read <Link href="https://loops.so/docs">the docs</Link> to get started.
</Paragraph>
<UnorderedList>
  <ListItem>Create your first campaign</ListItem>
  <ListItem>Add your audience</ListItem>
  <ListItem>Send a test email</ListItem>
</UnorderedList>
<Button href="https://app.example.com/account/{contact.userId}" align="center" bgColor="#000000" textColor="#ffffff" borderRadius="12">Open account</Button>
<Divider width="80" color="#d1d5db" />
<Columns gap="24" widths="50,50" verticalAlignment="top">
  <ColumnItem>
    <H3>Docs</H3>
    <Paragraph>Start with the quickstart.</Paragraph>
  </ColumnItem>
  <ColumnItem>
    <Image src="https://example.com/logo.png" alt="Company logo" width="180" />
  </ColumnItem>
</Columns>
<Section blockColor="#f8fafc" blockBorderRadius="12" paddingTop="16" paddingBottom="16">
  <Paragraph>Manage your subscription from your account settings.</Paragraph>
</Section>
<Icons align="center" gap="20" size="24" color="#000000">
  <Icon name="twitter" href="https://x.com/loops" />
  <Icon name="linkedin" href="https://www.linkedin.com/company/loops" />
</Icons>
```

### Workflow example

```xml
<Style themeId="st_123" bodyColor="#ffffff" backgroundColor="#f3f4f6" bodyYPadding="24" textBaseColor="#111827" />
<H1>Welcome to {event.planName}</H1>
<Paragraph fontSize="16" lineHeight="150">
  Hi {contact.firstName}, thanks for signing up for the {event.planName} plan.
</Paragraph>
<Button href="https://app.example.com/onboarding" align="center" bgColor="#000000" textColor="#ffffff" borderRadius="12">Get started</Button>
```

### Transactional example

```xml
<Style themeId="st_123" bodyColor="#ffffff" backgroundColor="#f3f4f6" bodyYPadding="24" textBaseColor="#111827" />
<H1>Reset your password</H1>
<Paragraph fontSize="16" lineHeight="150">
  Hi {data.firstName}, we received a request to reset your password.
</Paragraph>
<Button href="{data.resetLink}" align="center" bgColor="#000000" textColor="#ffffff" borderRadius="12">Reset password</Button>
<Paragraph fontSize="14" lineHeight="150">
  If you did not request this, you can ignore this email.
</Paragraph>
```
