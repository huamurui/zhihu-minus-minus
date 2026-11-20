import type { ZhihuBlock, ZhihuTextRange } from './document';

export interface RichTextDiagnostic {
  readonly kind:
    | 'removed-node'
    | 'unsafe-url'
    | 'unsupported-node'
    | 'invalid-range'
    | 'missing-footnote';
  readonly sourceType: string;
  readonly nodeId?: string;
}

export interface RichTextSpan extends ZhihuTextRange {
  readonly kind:
    | 'strong'
    | 'emphasis'
    | 'underline'
    | 'strikethrough'
    | 'highlight'
    | 'subscript'
    | 'superscript'
    | 'code'
    | 'link';
  readonly nodeId: string;
  readonly url?: string;
  readonly color?: string;
}

export interface RichTextParagraph extends ZhihuTextRange {
  readonly nodeId: string;
  readonly paragraphId?: string;
  readonly kind: 'paragraph' | 'heading' | 'quote' | 'listItem' | 'code';
  readonly level?: number;
  readonly fontSize?: number;
  readonly lineHeight?: number;
  /** A synthetic U+200B anchor represents one blank line, never copied as text. */
  readonly emptyLine?: true;
  readonly indent?: number;
  readonly marginTop?: number;
  readonly marginBottom?: number;
}

export interface RichTextDecoration extends ZhihuTextRange {
  readonly id: string;
  readonly nodeId: string;
  readonly kind: 'solid' | 'dashed' | 'dotted' | 'wavy';
  readonly color?: string;
  readonly thickness?: number;
  readonly offset?: number;
  readonly actionId?: string;
  readonly hasComments?: true;
}

export interface RichTextAttachment extends ZhihuTextRange {
  readonly id: string;
  readonly nodeId: string;
  readonly kind: 'image' | 'formula';
  readonly role?: 'avatar';
  readonly url?: string;
  readonly latex?: string;
  readonly width?: number;
  readonly height?: number;
  readonly baselineOffset?: number;
  readonly alt?: string;
  readonly copyText: string;
}

export interface RichTextSourceRange extends ZhihuTextRange {
  readonly nodeId: string;
  readonly paragraphId?: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly kind: 'text' | 'synthetic' | 'attachment';
}

/** One UTF-16 buffer and one native selection context. */
export interface RichTextFlow {
  readonly id: string;
  readonly textVersion: string;
  readonly text: string;
  readonly spans: readonly RichTextSpan[];
  readonly paragraphs: readonly RichTextParagraph[];
  readonly decorations: readonly RichTextDecoration[];
  readonly attachments: readonly RichTextAttachment[];
  readonly sourceMap: readonly RichTextSourceRange[];
}

export type RichTextPart =
  | { readonly type: 'flow'; readonly flow: RichTextFlow }
  | { readonly type: 'block'; readonly block: ZhihuBlock };

export interface RichTextCompilation {
  readonly documentId: string;
  readonly parts: readonly RichTextPart[];
  readonly diagnostics: readonly RichTextDiagnostic[];
}

export interface RichTextSelectionEndpoint {
  readonly nodeId: string;
  readonly paragraphId?: string;
  /** UTF-16 offset within the source paragraph, excluding generated markers. */
  readonly offset: number;
}

export interface RichTextSelectionMapping {
  readonly text: string;
  readonly start: RichTextSelectionEndpoint;
  readonly end: RichTextSelectionEndpoint;
}
