import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/open-data(.*)",
  "/api/v1/master(.*)",
]);

export const proxy = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

// Next.js 16 proxy module loading: `adapterFn = middlewareModule.default || middlewareModule`
// During Turbopack HMR the named `proxy` export can be transiently stale; having a default
// export gives the runtime a second resolution path and avoids "adapterFn is not a function".
export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
