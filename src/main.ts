import {
  App,
  MarkdownRenderChild,
  MarkdownRenderer,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import MarkdownIt from "markdown-it";
import type { RuleBlock } from "markdown-it";
import {
  buildCalloutContainer,
  extractContentFromLines,
  parseHeader,
  type AdmonitionMeta,
  type AdmonitionParseOptions
} from "./admonition";
import { livePreviewExtension } from "./live-preview";

function extractContent(
  state: MarkdownIt.StateBlock,
  startLine: number,
  endLine: number,
  options: AdmonitionParseOptions = {}
): { content: string; endLine: number } | null {
  const contentLines: string[] = [];
  let nextLine = startLine;
  let sawIndented = false;
  let emptyRun = 0;

  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      emptyRun += 1;
      if (options.endOnDoubleBlank && emptyRun >= 2) {
        break;
      }
      contentLines.push("");
      nextLine += 1;
      continue;
    }

    emptyRun = 0;
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

function mkdocsAdmonitionRule(md: MarkdownIt, options: AdmonitionParseOptions): RuleBlock {
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

    const extracted = extractContent(state, startLine + 1, endLine, options);
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

export function registerMkdocsAdmonitions(md: MarkdownIt, options: AdmonitionParseOptions = {}): void {
  md.block.ruler.before("fence", "mkdocs_admonition", mkdocsAdmonitionRule(md, options), {
    alt: ["paragraph", "reference", "blockquote", "list"]
  });
  renderAdmonition(md);
}

function createFragmentFromHtml(html: string): DocumentFragment {
  const range = document.createRange();
  return range.createContextualFragment(html);
}

export default class MkdocsMaterialAdmonitions extends Plugin {
  private fallbackMd: MarkdownIt | null = null;
  settings: MkdocsMaterialAdmonitionsSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    try {
      this.registerEditorExtension(livePreviewExtension(this.app, this, () => this.getLivePreviewOptions()));
    } catch (error) {
      console.error("mkdocs live preview extension failed", error);
    }

    this.fallbackMd = new MarkdownIt({ html: true, linkify: true });
    registerMkdocsAdmonitions(this.fallbackMd, this.getParseOptions());
    this.registerMarkdownPostProcessor(async (element, context) => {
      await this.processFallback(element, context);
    });

    this.addSettingTab(new MkdocsMaterialAdmonitionsSettingTab(this.app, this));
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

      const extracted = extractContentFromLines(lines, startLine + 1, this.getParseOptions());
      if (!extracted) {
        return;
      }

      const container = this.buildCalloutContainer(meta);
      const renderChild = new MarkdownRenderChild(container.content);
      this.addChild(renderChild);
      await MarkdownRenderer.render(
        this.app,
        extracted.contentLines.join("\n"),
        container.content,
        context.sourcePath,
        renderChild
      );
      element.replaceChildren();
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

      const extracted = extractContentFromLines(lines, line + 1, this.getParseOptions());
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

  private findElementByLine(root: Element, line: number): Element | null {
    return (
      root.querySelector(`[data-line="${line}"]`) ??
      root.querySelector(`[data-line="${line + 1}"]`)
    );
  }

  private findElementAtOrAfterLine(root: Element, line: number): Element | null {
    const candidates = Array.from(root.querySelectorAll("[data-line]"));
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
    const fragment = createFragmentFromHtml(html);

    let node: Element | null = startEl;
    while (node && node !== endEl) {
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }

    root.insertBefore(fragment, endEl);
  }

  private buildCalloutContainer(meta: AdmonitionMeta): { root: HTMLElement; content: HTMLElement } {
    return buildCalloutContainer(meta);
  }

  private getParseOptions(): AdmonitionParseOptions {
    return {
      endOnDoubleBlank: this.settings.endOnDoubleBlank
    };
  }

  private getLivePreviewOptions(): { endOnDoubleBlank: boolean; enabled: boolean } {
    return {
      endOnDoubleBlank: this.settings.endOnDoubleBlank,
      enabled: this.settings.livePreviewEnabled
    };
  }

  private async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<MkdocsMaterialAdmonitionsSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  private async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

type MkdocsMaterialAdmonitionsSettings = {
  endOnDoubleBlank: boolean;
  livePreviewEnabled: boolean;
};

const DEFAULT_SETTINGS: MkdocsMaterialAdmonitionsSettings = {
  endOnDoubleBlank: true,
  livePreviewEnabled: true
};

class MkdocsMaterialAdmonitionsSettingTab extends PluginSettingTab {
  private plugin: MkdocsMaterialAdmonitions;

  constructor(app: App, plugin: MkdocsMaterialAdmonitions) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Double blank line ends admonition")
      .setDesc("When enabled, two consecutive empty lines end an admonition block.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.endOnDoubleBlank).onChange(async (value) => {
          this.plugin.settings.endOnDoubleBlank = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Enable Live Preview rendering")
      .setDesc("When disabled, Live Preview will show the source text for MkDocs admonitions.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.livePreviewEnabled).onChange(async (value) => {
          this.plugin.settings.livePreviewEnabled = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
