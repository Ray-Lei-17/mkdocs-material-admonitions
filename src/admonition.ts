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

export type AdmonitionMeta = {
  calloutType: string;
  title: string | null;
  collapsible: boolean;
  open: boolean;
};

export type AdmonitionParseOptions = {
  endOnDoubleBlank?: boolean;
};

function parseTitle(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const first = trimmed[0];
  if (first === "\"" || first === "'") {
    const end = trimmed.indexOf(first, 1);
    if (end > 0) {
      return trimmed.slice(1, end);
    }
    return trimmed.slice(1);
  }
  return trimmed;
}

export function parseHeader(line: string): AdmonitionMeta | null {
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

export function extractContentFromLines(
  lines: string[],
  startLine: number,
  options: AdmonitionParseOptions = {}
): { contentLines: string[]; endLine: number } | null {
  const contentLines: string[] = [];
  let line = startLine;
  let sawIndented = false;
  let emptyRun = 0;

  while (line < lines.length) {
    const text = lines[line] ?? "";
    if (!text) {
      emptyRun += 1;
      if (options.endOnDoubleBlank && emptyRun >= 2) {
        break;
      }
      contentLines.push("");
      line += 1;
      continue;
    }

    emptyRun = 0;
    if (text.startsWith("\t")) {
      sawIndented = true;
      contentLines.push(text.slice(1));
      line += 1;
      continue;
    }

    if (text.startsWith("    ")) {
      sawIndented = true;
      contentLines.push(text.slice(4));
      line += 1;
      continue;
    }

    break;
  }

  if (!sawIndented) {
    return null;
  }

  return { contentLines, endLine: line };
}

export function buildCalloutContainer(meta: AdmonitionMeta): { root: HTMLElement; content: HTMLElement } {
  const container = document.createElement(meta.collapsible ? "details" : "div");
  container.className = "callout mkdocs-admonition";
  container.setAttribute("data-callout", meta.calloutType);
  if (meta.collapsible && meta.open) {
    container.setAttribute("open", "");
  }

  if (meta.collapsible) {
    const summary = document.createElement("summary");
    summary.className = "callout-title";
    const inner = document.createElement("span");
    inner.className = "callout-title-inner";
    inner.textContent = meta.title ?? "";
    summary.appendChild(inner);
    container.appendChild(summary);
  } else if (meta.title) {
    const title = document.createElement("div");
    title.className = "callout-title";
    const inner = document.createElement("div");
    inner.className = "callout-title-inner";
    inner.textContent = meta.title;
    title.appendChild(inner);
    container.appendChild(title);
  }

  const content = document.createElement("div");
  content.className = "callout-content";
  container.appendChild(content);

  return { root: container, content };
}
