import type { Instrumentation } from "next";

/**
 * Structured server error logging. Vercel/most hosts collect stdout, so these lines
 * are searchable in the log drain. Swap in Sentry (or similar) here when ready.
 * Only the path is logged — never query strings, which can carry magic-link tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      message: e.message,
      digest: e.digest,
      stack: e.stack?.split("\n").slice(0, 6).join("\n"),
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
