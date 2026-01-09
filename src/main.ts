import { MarkdownRenderer, Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import MarkdownIt from "markdown-it";
import type { RuleBlock } from "markdown-it";

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

type AdmonitionMeta = {
  calloutType: string;
  title: string | null;
  collapsible: boolean;
  open: boolean;
};

function parseTitle(raw: string): string | null {
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

function parseHeader(line: string): AdmonitionMeta | null {
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

function extractContent(state: any, startLine: number, endLine: number): { content: string; endLine: number } | null {
  const contentLines: string[] = [];
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

function mkdocsAdmonitionRule(md: MarkdownIt): RuleBlock {
  return (state, startLine, endLine, silent) => {
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
  };
}

function renderAdmonition(md: MarkdownIt): void {
  md.renderer.rules.mkdocs_admonition = (tokens, idx, options, env) => {
    const token = tokens[idx];
    const meta = token.meta as AdmonitionMeta;
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

export function registerMkdocsAdmonitions(md: MarkdownIt): void {
  md.block.ruler.before("fence", "mkdocs_admonition", mkdocsAdmonitionRule(md), {
    alt: ["paragraph", "reference", "blockquote", "list"]
  });
  renderAdmonition(md);
}

export default class MkdocsMaterialAdmonitions extends Plugin {
  private fallbackMd: MarkdownIt | null = null;

  onload(): void {
    const registerMarkdownIt = (this as unknown as { registerMarkdownIt?: (cb: (md: MarkdownIt) => void) => void }).registerMarkdownIt;
    if (typeof registerMarkdownIt === "function") {
      registerMarkdownIt((md) => {
        registerMkdocsAdmonitions(md);
      });
      return;
    }

    this.fallbackMd = new MarkdownIt({ html: true, linkify: true });
    registerMkdocsAdmonitions(this.fallbackMd);
    this.registerMarkdownPostProcessor(async (element, context) => {
      await this.processFallback(element, context);
    });
  }

  private async processFallback(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    if (!this.fallbackMd) {
      return;
    }

    const section = context.getSectionInfo(element);
    if (!section) {
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const text = await this.app.vault.cachedRead(file);
    const lines = text.split(/\r?\n/);
    const startLine = Math.max(0, section.lineStart);
    const endLine = Math.min(lines.length, section.lineEnd + 1);

    let line = startLine;
    if (!element.querySelector("[data-line]")) {
      const headerLine = lines[startLine] ?? "";
      const meta = parseHeader(headerLine.trim());
      if (!meta) {
        return;
      }

      const extracted = this.extractContentFromLines(lines, startLine + 1);
      if (!extracted) {
        return;
      }

      const container = this.buildCalloutContainer(meta);
      await MarkdownRenderer.render(
        this.app,
        extracted.contentLines.join("\n"),
        container.content,
        context.sourcePath,
        this
      );
      element.innerHTML = "";
      element.appendChild(container.root);
      return;
    }

    while (line < endLine) {
      const rawLine = lines[line] ?? "";
      const meta = parseHeader(rawLine.trim());
      if (!meta) {
        line += 1;
        continue;
      }

      const extracted = this.extractContentFromLines(lines, line + 1);
      if (!extracted) {
        line += 1;
        continue;
      }

      const blockText = [
        rawLine.trimEnd(),
        ...extracted.contentLines.map((contentLine) => `    ${contentLine}`)
      ].join("\n");
      const html = this.fallbackMd.render(blockText);

      const startEl = this.findElementByLine(element, line);
      if (!startEl) {
        line = extracted.endLine;
        continue;
      }

      const endEl = this.findElementAtOrAfterLine(element, extracted.endLine);
      this.replaceRangeWithHtml(element, startEl, endEl, html);

      line = extracted.endLine;
    }
  }

  private extractContentFromLines(lines: string[], startLine: number): { contentLines: string[]; endLine: number } | null {
    const contentLines: string[] = [];
    let line = startLine;
    let sawIndented = false;

    while (line < lines.length) {
      const text = lines[line] ?? "";
      if (!text) {
        contentLines.push("");
        line += 1;
        continue;
      }

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

  private findElementByLine(root: Element, line: number): Element | null {
    return (
      root.querySelector(`[data-line="${line}"]`) ??
      root.querySelector(`[data-line="${line + 1}"]`)
    );
  }

  private findElementAtOrAfterLine(root: Element, line: number): Element | null {
    const candidates = Array.from(root.querySelectorAll("[data-line]")) as Element[];
    let best: Element | null = null;
    let bestLine = Number.POSITIVE_INFINITY;
    for (const el of candidates) {
      const raw = el.getAttribute("data-line");
      if (!raw) {
        continue;
      }
      const value = Number.parseInt(raw, 10);
      if (Number.isNaN(value)) {
        continue;
      }
      if (value >= line && value < bestLine) {
        best = el;
        bestLine = value;
      }
      if (value + 1 >= line && value + 1 < bestLine) {
        best = el;
        bestLine = value + 1;
      }
    }
    return best;
  }

  private replaceRangeWithHtml(root: Element, startEl: Element, endEl: Element | null, html: string): void {
    const container = document.createElement("div");
    container.innerHTML = html;

    let node: Element | null = startEl;
    while (node && node !== endEl) {
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }

    while (container.firstChild) {
      root.insertBefore(container.firstChild, endEl);
    }
  }

  private buildCalloutElement(meta: AdmonitionMeta, innerHtml: string): HTMLElement {
    const container = this.buildCalloutContainer(meta);
    container.content.innerHTML = innerHtml;
    return container.root;
  }

  private buildCalloutContainer(meta: AdmonitionMeta): { root: HTMLElement; content: HTMLElement } {
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
}
