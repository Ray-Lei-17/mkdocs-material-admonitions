import fs from "fs";
import path from "path";
import MarkdownIt from "markdown-it";

const VALID_TYPES = new Set([
  "note",
  "info",
  "tip",
  "warning",
  "important",
  "caution",
  "danger",
  "bug",
  "example",
  "quote",
  "failure",
  "success",
  "question"
]);

function parseTitle(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const first = trimmed[0];
  if (first === '"' || first === "'") {
    const end = trimmed.indexOf(first, 1);
    if (end > 0) {
      return trimmed.slice(1, end);
    }
    return trimmed.slice(1);
  }
  return trimmed;
}

function parseHeader(line) {
  const match = line.match(/^(!!!|\?\?\?\+?)\s+([A-Za-z][\w-]*)(.*)?$/);
  if (!match) {
    return null;
  }

  const marker = match[1];
  const rawType = match[2].toLowerCase();
  const title = parseTitle(match[3] ?? "");

  const calloutType = VALID_TYPES.has(rawType) ? rawType : "note";
  const collapsible = marker.startsWith("???");
  const open = marker === "???+" || marker === "!!!";

  return {
    calloutType,
    title,
    collapsible,
    open
  };
}

function extractContent(state, startLine, endLine) {
  const contentLines = [];
  let nextLine = startLine;
  let sawIndented = false;

  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      contentLines.push("");
      nextLine += 1;
      continue;
    }

    const indent = state.sCount[nextLine] - state.blkIndent;
    if (indent < 4) {
      break;
    }

    sawIndented = true;
    const lineStart = state.bMarks[nextLine] + state.blkIndent;
    const lineEnd = state.eMarks[nextLine];
    let pos = lineStart;

    if (state.src.charCodeAt(pos) === 0x09) {
      pos += 1;
    } else {
      let spaces = 0;
      while (spaces < 4 && state.src.charCodeAt(pos) === 0x20) {
        pos += 1;
        spaces += 1;
      }
    }

    contentLines.push(state.src.slice(pos, lineEnd));
    nextLine += 1;
  }

  if (!sawIndented) {
    return null;
  }

  return {
    content: contentLines.join("\n"),
    endLine: nextLine
  };
}

function registerMkdocsAdmonitions(md) {
  md.block.ruler.before("fence", "mkdocs_admonition", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (start + 3 > max) {
      return false;
    }

    const lineText = state.src.slice(start, max);
    if (!lineText.startsWith("!!!") && !lineText.startsWith("???")) {
      return false;
    }

    const meta = parseHeader(lineText.trim());
    if (!meta) {
      return false;
    }

    if (silent) {
      return true;
    }

    const extracted = extractContent(state, startLine + 1, endLine);
    if (!extracted) {
      return false;
    }

    const token = state.push("mkdocs_admonition", "", 0);
    token.block = true;
    token.map = [startLine, extracted.endLine];
    token.meta = meta;
    token.content = extracted.content;

    state.line = extracted.endLine;
    return true;
  }, {
    alt: ["paragraph", "reference", "blockquote", "list"]
  });

  md.renderer.rules.mkdocs_admonition = (tokens, idx, options, env) => {
    const token = tokens[idx];
    const meta = token.meta;
    const title = meta.title ? md.utils.escapeHtml(meta.title) : "";
    const inner = md.render(token.content, env);

    if (meta.collapsible) {
      const openAttr = meta.open ? " open" : "";
      const titleHtml = `<summary class="callout-title"><span class="callout-title-inner">${title}</span></summary>`;
      return `<details class="callout mkdocs-admonition" data-callout="${meta.calloutType}"${openAttr}>${titleHtml}<div class="callout-content">${inner}</div></details>`;
    }

    const titleHtml = title
      ? `<div class="callout-title"><div class="callout-title-inner">${title}</div></div>`
      : "";
    return `<div class="callout mkdocs-admonition" data-callout="${meta.calloutType}">${titleHtml}<div class="callout-content">${inner}</div></div>`;
  };
}

const fixturesDir = path.resolve("tests/fixtures");
const md = new MarkdownIt({ html: true, linkify: true });
registerMkdocsAdmonitions(md);

const files = fs.readdirSync(fixturesDir).filter((file) => file.endsWith(".md"));
let failed = 0;

for (const file of files) {
  const name = file.replace(/\.md$/, "");
  const input = fs.readFileSync(path.join(fixturesDir, file), "utf8");
  const expectedPath = path.join(fixturesDir, `${name}.html`);
  const expected = fs.readFileSync(expectedPath, "utf8").trimEnd();
  const actual = md.render(input).trimEnd();

  if (actual !== expected) {
    failed += 1;
    console.log(`FAIL ${name}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
