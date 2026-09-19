import { NextResponse, type NextRequest } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Send a user-facing error response.
 *
 * The `safeDetails` parameter is ONLY for Zod validation errors (field-level
 * validation messages that help users fix their input). It must NEVER contain
 * raw exceptions, stack traces, or internal system information.
 *
 * For all other errors, use the single-argument form: err("Message")
 */
export function err(message: string, status = 400, safeDetails?: Record<string, unknown>) {
  const body: { error: string; details?: Record<string, unknown> } = { error: message };
  if (safeDetails && Object.keys(safeDetails).length > 0) {
    body.details = safeDetails;
  }
  return NextResponse.json(body, { status });
}

/**
 * handleApi wraps a route handler and catches all errors.
 *
 * ERROR VISIBILITY POLICY (government production system):
 *   - ApiError: the message is safe for users (set by the route handler)
 *   - All other errors: users see a generic "Something went wrong" message
 *   - The full error (message, stack, name) is logged server-side via console.error
 *   - NO raw Prisma errors, FK violations, stack traces, file paths, or internal
 *     details are ever sent to the client
 *
 * This is critical for a government system — revealing internal errors could
 * expose database structure, file paths, or help attackers probe vulnerabilities.
 */
export function handleApi<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<NextResponse>
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (e) {
      // ApiError is a controlled error — its message is safe for users
      if (e instanceof ApiError) {
        return err(e.message, e.status);
      }

      // Log the FULL error server-side for debugging (never sent to client)
      const errorDetail = {
        name: e instanceof Error ? e.name : typeof e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        timestamp: new Date().toISOString(),
      };
      console.error("[API ERROR]", JSON.stringify(errorDetail, null, 2));

      // Return ONLY a generic message to the user — no internal details
      return err(
        "An unexpected error occurred. Please try again. If the problem persists, contact support.",
        500
      );
    }
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
