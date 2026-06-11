import { createReadStream } from "node:fs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { renderPdfPreviewPage } from "@/lib/pdfPreview";
import { resolveItemPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params;
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (
    !item ||
    item.itemType !== "file" ||
    item.isHidden ||
    item.isAdminHidden ||
    !item.isBrowsable
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (item.fileType !== "pdf" && item.fileType !== "doc") {
    return NextResponse.json(
      { error: "Preview images are only available for PDF/DOC files" },
      { status: 400 }
    );
  }

  let abs: string;
  try {
    abs = resolveItemPath(item.relativePath);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const pngAbs = await renderPdfPreviewPage({
      itemId: item.id,
      abs,
      fileType: item.fileType,
      page: Number(page),
    });
    return new Response(nodeStreamToWeb(createReadStream(pngAbs)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Preview failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
