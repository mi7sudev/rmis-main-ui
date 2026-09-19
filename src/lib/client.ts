"use client";

import type { Role } from "@/lib/roles";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  extensionName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  applicant: { id: string; isProfileComplete: boolean } | null;
};

/**
 * Fetch wrapper with robust error handling for a government production system.
 *
 * ERROR HANDLING POLICY:
 *   - Network errors (server unreachable, timeout): "Unable to connect to the server. Please check your internet connection and try again."
 *   - 401 Unauthorized: "Your session has expired. Please sign in again."
 *   - 403 Forbidden: "You do not have permission to perform this action."
 *   - 404 Not Found: "The requested information could not be found."
 *   - 400 Bad Request: Uses the server-provided error message (safe — set by route handlers)
 *   - 500 Internal Server Error: "An unexpected error occurred. Please try again later."
 *   - Other: "An error occurred while processing your request."
 *
 * The raw server error message is only used for 4xx client errors (where the
 * route handler set a human-readable message). 5xx errors always get a generic
 * message — the server logs the full details internally.
 *
 * TRANSPORT RULES:
 *   - JSON body (default) → explicit `Content-Type: application/json`.
 *   - FormData body (file upload) → NO Content-Type is set; the browser must
 *     generate the `multipart/form-data; boundary=…` header itself. (Setting
 *     it manually strips the boundary and the server cannot parse the body —
 *     this exact bug is why uploads used to bypass this wrapper.)
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const isMultipart = options?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        ...(options?.headers || {}),
      },
      credentials: "include",
    });
  } catch {
    // Network error — server unreachable, DNS failure, timeout, CORS, etc.
    throw new Error(
      "Unable to connect to the server. Please check your internet connection and try again."
    );
  }

  // Parse JSON response (may fail if server returns HTML or empty body)
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // For 4xx errors, the server's error message is safe to show
    // (it was set by the route handler, not a raw exception)
    if (res.status >= 400 && res.status < 500) {
      const serverMessage = data?.error as string | undefined;
      if (serverMessage) {
        throw new Error(serverMessage);
      }
      // Fallback for 4xx without a message
      if (res.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (res.status === 403) {
        throw new Error("You do not have permission to perform this action.");
      }
      if (res.status === 404) {
        throw new Error("The requested information could not be found.");
      }
      throw new Error("Your request could not be processed. Please check your input and try again.");
    }

    // For 5xx errors, NEVER show the server's error message to the user
    // (it might contain internal details despite our sanitization efforts)
    throw new Error(
      "An unexpected error occurred. Please try again later. If the problem persists, contact support."
    );
  }

  return data as T;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fullName(user?: { firstName?: string | null; lastName?: string | null; middleName?: string | null; extensionName?: string | null } | null): string {
  if (!user) return "";
  const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
  let name = parts.join(" ");
  if (user.extensionName) name += `, ${user.extensionName}`;
  return name || "Unnamed";
}
