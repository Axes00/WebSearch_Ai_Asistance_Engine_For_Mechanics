import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateAccessCode, hashAccessCode } from "@/lib/access";
import { sendAccessCodeEmail } from "@/lib/accessEmail";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  id: z.string().min(1).max(100),
  action: z.enum(["approve", "reject"]),
});

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export async function GET(req: NextRequest) {
  const from = parseDate(req.nextUrl.searchParams.get("from"));
  const to = parseDate(req.nextUrl.searchParams.get("to"), true);
  const rows = await prisma.accessRequest.findMany({
    where: from || to ? { requestedAt: { gte: from, lte: to } } : undefined,
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json({
    requests: rows.map(({ codeHash: _codeHash, ...row }) => row),
  });
}

export async function PATCH(req: NextRequest) {
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
  }

  const request = await prisma.accessRequest.findUnique({ where: { id: parsed.data.id } });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  if (parsed.data.action === "reject") {
    const updated = await prisma.accessRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        codeHash: null,
        approvedAt: null,
      },
    });
    const { codeHash: _codeHash, ...safe } = updated;
    return NextResponse.json({ request: safe });
  }

  if (request.status === "approved") {
    return NextResponse.json(
      { error: "This request has already been approved" },
      { status: 409 }
    );
  }

  const code = generateAccessCode();
  try {
    await sendAccessCodeEmail({
      email: request.email,
      firstName: request.firstName,
      code,
    });
    const updated = await prisma.accessRequest.update({
      where: { id: request.id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        codeHash: hashAccessCode(request.email, code),
      },
    });
    const { codeHash: _codeHash, ...safe } = updated;
    return NextResponse.json({ request: safe });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
