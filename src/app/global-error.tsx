"use client";

/**
 * Global Error Boundary — catches unexpected React rendering crashes.
 *
 * This is the last line of defense. If any component throws during render
 * (not just async errors), this page shows instead of a blank white screen.
 * The full error is logged to the console for debugging, but the user sees
 * only a professional, government-style error page.
 */

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the full error server-side for debugging
    console.error("[GLOBAL ERROR BOUNDARY]", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f5f5f0",
            padding: "2rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #cccccc",
              borderRadius: "4px",
              maxWidth: "480px",
              width: "100%",
              overflow: "hidden",
            }}
          >
            {/* Government-style header */}
            <div
              style={{
                backgroundColor: "#003876",
                color: "#ffffff",
                padding: "1rem 1.5rem",
                borderBottom: "3px solid #FCD116",
              }}
            >
              <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                System Error
              </h1>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#bfd0e8" }}>
                Recruitment Management & Information System
              </p>
            </div>

            {/* Error body */}
            <div style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "4px",
                  backgroundColor: "#FEE2E2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem",
                }}
              >
                <AlertCircle size={28} color="#CE1126" />
              </div>

              <h2
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#1a1a1a",
                }}
              >
                An unexpected error occurred
              </h2>

              <p
                style={{
                  margin: "0 0 1.5rem",
                  fontSize: "0.875rem",
                  color: "#595959",
                  lineHeight: 1.5,
                }}
              >
                We apologize for the inconvenience. The system encountered an
                unexpected error while processing your request. Our team has been
                notified and is working to resolve the issue.
              </p>

              {/* Action buttons */}
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={reset}
                  style={{
                    backgroundColor: "#003876",
                    color: "#ffffff",
                    border: "1px solid #003876",
                    borderRadius: "4px",
                    padding: "0.5rem 1.25rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <RefreshCw size={16} />
                  Try Again
                </button>
                <button
                  onClick={() => {
                    window.location.href = "/";
                  }}
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#003876",
                    border: "1px solid #003876",
                    borderRadius: "4px",
                    padding: "0.5rem 1.25rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Home size={16} />
                  Return Home
                </button>
              </div>

              {/* Reference number for support */}
              {error.digest && (
                <p
                  style={{
                    margin: "1.5rem 0 0",
                    fontSize: "0.75rem",
                    color: "#999999",
                  }}
                >
                  Reference: {error.digest}
                </p>
              )}
            </div>
          </div>

          {/* Government footer */}
          <p
            style={{
              marginTop: "1.5rem",
              fontSize: "0.75rem",
              color: "#999999",
              textAlign: "center",
            }}
          >
            © {new Date().getFullYear()} Department of Science and Technology —
            Metals Industry Research and Development Center
          </p>
        </div>
      </body>
    </html>
  );
}
