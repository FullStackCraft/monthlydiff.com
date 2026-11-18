"use client";

import { useEffect, useState } from "react";

export function NewsletterLink({ action }: { action: "confirm" | "unsubscribe" }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ message: string; retry: boolean }>();
  const pending = action === "confirm" ? "Confirming your subscription…" : "Unsubscribing…";

  useEffect(() => {
    const token = window.location.hash.slice(1);
    let current = true;
    async function complete() {
      if (!token) {
        setResult({ message: "Open the link from your email to continue.", retry: false });
        return;
      }
      try {
        const response = await fetch(`/api/newsletter/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!current) return;
        if (response.ok) window.history.replaceState(null, "", window.location.pathname);
        setResult({ message: data.message, retry: response.status === 409 || response.status === 429 || response.status >= 500 });
      } catch {
        if (current) setResult({ message: "We couldn’t reach the subscription service.", retry: true });
      }
    }
    void complete();
    return () => { current = false; };
  }, [action, attempt]);

  return (
    <>
      <p role="status" aria-live="polite">{result?.message ?? pending}</p>
      {result?.retry && <button className="button" onClick={() => { setResult(undefined); setAttempt(attempt + 1); }}>Try again</button>}
      <noscript>Enable JavaScript and reopen this email link to continue.</noscript>
    </>
  );
}
