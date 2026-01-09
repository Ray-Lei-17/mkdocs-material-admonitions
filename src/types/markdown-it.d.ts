declare module "markdown-it" {
  export type RuleBlock = (
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
  ) => boolean;

  export type RendererRule = (
    tokens: Token[],
    idx: number,
    options: unknown,
    env: unknown,
    self: Renderer
  ) => string;

  export interface StateBlock {
    src: string;
    blkIndent: number;
    bMarks: number[];
    eMarks: number[];
    tShift: number[];
    sCount: number[];
    line: number;
    isEmpty(line: number): boolean;
    push(type: string, tag: string, nesting: number): Token;
  }

  export interface Token {
    block: boolean;
    map: [number, number] | null;
    meta: unknown;
    content: string;
  }

  export interface Renderer {
    rules: Record<string, RendererRule>;
  }

  export interface Ruler {
    before(
      beforeName: string,
      ruleName: string,
      fn: RuleBlock,
      options?: { alt?: string[] }
    ): void;
  }

  export interface MarkdownItOptions {
    html?: boolean;
    linkify?: boolean;
  }

  export interface Utils {
    escapeHtml(html: string): string;
  }

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);
    block: { ruler: Ruler };
    renderer: Renderer;
    utils: Utils;
    render(src: string, env?: unknown): string;
  }
}
