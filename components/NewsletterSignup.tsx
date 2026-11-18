"use client";

import { useState, type FormEvent } from "react";

export function NewsletterSignup() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const { email, website } = Object.fromEntries(new FormData(form));
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const result = await response.json();
      setMessage(result.message || "We couldn’t process the signup. Try again in a moment.");
      if (response.ok) form.reset();
    } catch {
      setMessage("We couldn’t process the signup. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={subscribe} className="signup-form">
      <label htmlFor="signup-email" className="sr-only">Email address</label>
      <div className="signup-fields">
        <input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
        <div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <button className="button" type="submit" disabled={pending}>{pending ? "Sending…" : "Subscribe"}</button>
      </div>
      <p className="muted" role="status" aria-live="polite">{message}</p>
    </form>
  );
}
