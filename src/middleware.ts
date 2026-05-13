import createMiddleware from "next-intl/middleware";
import { routing } from "./lib/routing";

export default createMiddleware(routing);

export const config = {
  // Match all routes except API routes, Next.js internals, and static assets.
  matcher: ["/((?!api|_next|_vercel|favicon.ico|hero.jpg|icons|.*\\..*).*)"],
};
