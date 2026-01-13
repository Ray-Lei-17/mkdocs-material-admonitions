import { type App, Component, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { EditorState, RangeSetBuilder, StateField, type Extension } from "@codemirror/state";
import {
  buildCalloutContainer,
  extractContentFromLines,
  parseHeader,
  type AdmonitionMeta
} from "./admonition";

type LivePreviewOptions = {
  endOnDoubleBlank: boolean;
  enabled: boolean;
};

class AdmonitionWidget extends WidgetType {
  private app: App;
  private parent: Component;
  private meta: AdmonitionMeta;
  private content: string;
  private sourcePath: string;
  private anchor: number;

  constructor(
    app: App,
    parent: Component,
    meta: AdmonitionMeta,
    content: string,
    sourcePath: string,
    anchor: number
  ) {
    super();
    this.app = app;
    this.parent = parent;
    this.meta = meta;
    this.content = content;
    this.sourcePath = sourcePath;
    this.anchor = anchor;
  }

  eq(other: AdmonitionWidget): boolean {
    return (
      this.content === other.content &&
      this.sourcePath === other.sourcePath &&
      this.meta.calloutType === other.meta.calloutType &&
      this.meta.title === other.meta.title &&
      this.meta.collapsible === other.meta.collapsible &&
      this.meta.open === other.meta.open
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const container = buildCalloutContainer(this.meta);
    container.root.classList.add("markdown-rendered");
    const renderChild = new MarkdownRenderChild(container.content);
    this.parent.addChild(renderChild);
    void MarkdownRenderer.render(this.app, this.content, container.content, this.sourcePath, renderChild).then(() => {
      requestAnimationFrame(() => view.requestMeasure());
    });
    container.root.addEventListener("mousedown", (event) => {
      const view = EditorView.findFromDOM(container.root);
      if (!view) {
        return;
      }
      event.preventDefault();
      view.focus();
      view.dispatch({ selection: { anchor: this.anchor } });
    });
    return container.root;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function selectionIntersects(selection: EditorState["selection"], from: number, to: number): boolean {
  for (const range of selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

function buildDecorations(
  state: EditorState,
  app: App,
  parent: Component,
  getOptions: () => LivePreviewOptions
): DecorationSet {
  const options = getOptions();
  if (!options.enabled) {
    return Decoration.none;
  }
  const sourcePath = app.workspace.getActiveFile()?.path ?? "";
  const doc = state.doc;
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i += 1) {
    lines.push(doc.line(i).text);
  }

  const builder = new RangeSetBuilder<Decoration>();
  let line = 0;
  while (line < lines.length) {
    const rawLine = lines[line] ?? "";
    const meta = parseHeader(rawLine.trim());
    if (!meta) {
      line += 1;
      continue;
    }

    const extracted = extractContentFromLines(lines, line + 1, options);
    if (!extracted) {
      line += 1;
      continue;
    }

    const endLineIndex = extracted.endLine - 1;
    const from = doc.line(line + 1).from;
    const to = doc.line(endLineIndex + 1).to;
    const content = extracted.contentLines.join("\n");

    if (!selectionIntersects(state.selection, from, to)) {
      const widget = new AdmonitionWidget(app, parent, meta, content, sourcePath, from);
      builder.add(from, to, Decoration.replace({ widget, block: true }));
    }

    line = extracted.endLine;
  }

  return builder.finish();
}

export function livePreviewExtension(
  app: App,
  parent: Component,
  getOptions: () => LivePreviewOptions
): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, app, parent, getOptions),
    update: (deco, tr) =>
      tr.docChanged || tr.selection
        ? buildDecorations(tr.state, app, parent, getOptions)
        : deco
  });
  return [field, EditorView.decorations.from(field)];
}
