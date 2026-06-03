import { prisma } from "@/lib/db";
import { accessSessionEmail } from "@/lib/access";

export async function hasCustomerAccess(token?: string) {
  const email = accessSessionEmail(token);
  if (!email) return false;
  const access = await prisma.accessRequest.findUnique({
    where: { email },
    select: { status: true },
  });
  return access?.status === "approved";
}
