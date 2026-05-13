import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

/**
 * Convert a Node ReadStream into a Web ReadableStream Next.js can return.
 */
function nodeStreamToWeb(
  stream: NodeJS.ReadableStream
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk) => {
        const u8 =
          chunk instanceof Uint8Array
            ? chunk
            : new Uint8Array(Buffer.from(chunk as string));
        controller.enqueue(u8);
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      (stream as unknown as { destroy: () => void }).destroy?.();
    },
  });
}

/**
 * Build a Response for an on-disk file, honoring HTTP Range requests for
 * large PDFs / videos so the browser can seek efficiently.
 */
export async function rangedFileResponse(
  absolutePath: string,
  opts: {
    contentType: string;
    filename?: string;
    inline?: boolean;
    range?: string | null;
  }
): Promise<Response> {
  const stats = await stat(absolutePath);
  const total = stats.size;

  // RFC 5987 encoding for filenames with spaces / Greek characters.
  const filename = opts.filename ?? "file";
  const safeFilename = encodeURIComponent(filename);
  const disposition = `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${safeFilename}`;

  if (opts.range) {
    const match = /bytes=(\d*)-(\d*)/.exec(opts.range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (start >= total || end >= total || start > end) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      const chunkSize = end - start + 1;
      const stream = nodeStreamToWeb(
        createReadStream(absolutePath, { start, end })
      );
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": opts.contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }
  }

  const stream = nodeStreamToWeb(createReadStream(absolutePath));
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": opts.contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
