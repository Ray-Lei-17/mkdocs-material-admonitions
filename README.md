# MkDocs Material Admonitions (Obsidian)

Render MkDocs Material admonition syntax in Obsidian Reading view using a markdown-it block rule.

## Compatibility

- Obsidian version tested: v1.11.4.

## Syntax

```md
!!! type "Title"
    Content...

!!! type
    Content without a title bar.

??? type "Title"
    Collapsible, default closed.

???+ type "Title"
    Collapsible, default open.
```

- `type` is a word (letters/numbers/`-`/`_`). Unknown types fallback to `note`.
- Titles support double or single quotes. If omitted, no title bar is rendered.
- Content is an indented block: 4 spaces or 1 tab.
- Nested admonitions are supported (they render recursively in Reading view).
- Code fences inside the content are respected; `!!!`/`???` inside fenced code are not parsed.

## Rendering

- Uses Obsidian callout DOM: `.callout`, `data-callout`, `.callout-title`, `.callout-content`.
- Collapsible admonitions render as `<details>` with `<summary>`.
- Live Preview uses a CodeMirror extension; when the cursor is inside an admonition block, the source text is shown so you can edit it.

## Settings

- **Double blank line ends admonition** (default: on)  
  When enabled, two consecutive empty lines end an admonition block. This affects Reading view, Live Preview, and the fallback post-processor.

## Limitations

- Live Preview renders via a CodeMirror extension; editing inside rendered blocks may feel different than source mode.
- Live Preview spacing can appear wider than Reading view depending on theme/CM6 layout.

## Live Preview

- You can disable Live Preview rendering in Settings → “Enable Live Preview rendering”.
  When disabled, MkDocs admonitions show as source text in Live Preview.
- Title parsing is conservative; quoted titles are recommended.
- The plugin uses a post-processor in Reading view; nested MkDocs admonitions are not parsed, but Obsidian math/markdown extensions still render.

## Build

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at:

```
.obsidian/plugins/mkdocs-material-admonitions/
```

## Tests

Fixtures live in `tests/fixtures` with `.md` input and `.html` expected output.

```bash
npm run test
```

Fixtures included:
- `tests/fixtures/basic.md`
- `tests/fixtures/no-title.md`
- `tests/fixtures/collapsible-closed.md`
- `tests/fixtures/collapsible-open.md`
- `tests/fixtures/fallback-type.md`
- `tests/fixtures/nested.md`
