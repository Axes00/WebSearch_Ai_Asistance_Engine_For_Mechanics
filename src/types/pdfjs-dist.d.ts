declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export function getDocument(options: {
    data: Uint8Array;
    disableWorker?: boolean;
  }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getViewport(options: { scale: number }): {
          width: number;
          height: number;
        };
        render(options: {
          canvasContext: unknown;
          viewport: { width: number; height: number };
        }): { promise: Promise<void> };
      }>;
    }>;
  };
}

declare module "pdf-poppler" {
  const pdfPoppler: {
    info(file: string): Promise<{ pages?: string | number }>;
    convert(
      file: string,
      options: {
        format: "png" | "jpeg" | "tiff";
        out_dir: string;
        out_prefix: string;
        page: number | null;
      }
    ): Promise<void>;
  };
  export default pdfPoppler;
}
