/**
 * Minimal type declarations for `mammoth/mammoth.browser`.
 *
 * The upstream package ships types for the Node entry point only, so we
 * declare the tiny surface we actually use from the browser bundle.
 */
declare module "mammoth/mammoth.browser" {
  export type ConvertResult = {
    value: string;
    messages: Array<{ type: string; message: string }>;
  };
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: Record<string, unknown>
  ): Promise<ConvertResult>;
  export function extractRawText(
    input: { arrayBuffer: ArrayBuffer }
  ): Promise<ConvertResult>;
}
