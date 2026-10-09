"use client";

import { useRef, useState, type FormEvent } from "react";
import type { CheckStatus, SiteReport } from "@/lib/siteCheck";

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Passed",
  warn: "Needs attention",
  fail: "Failed",
};

const STATUS_ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

export default function SiteChecker() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<SiteReport | null>(null);
  const requestId = useRef(0);

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!url.trim()) {
      setError("Enter a website address to check.");
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json().catch(() => null);
      if (id !== requestId.current) return;
      if (!response.ok || !data || "error" in data) {
        setError(data?.error ?? `The check failed (HTTP ${response.status}). Please try again.`);
        return;
      }
      setReport(data as SiteReport);
    } catch {
      if (id === requestId.current) {
        setError("Could not reach OtherLab. Check your connection and try again.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const sortedChecks = report
    ? [...report.checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    : [];

  return (
    <>
      <form className="mt-10 flex w-full flex-col gap-3 sm:flex-row" onSubmit={runCheck} noValidate>
        <label htmlFor="site-url" className="sr-only">
          Website address
        </label>
        <input
          id="site-url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          placeholder="https://yourwebsite.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "site-url-error" : undefined}
          className="h-14 w-full rounded-xl border border-gray-300 sm:flex-1 px-5 text-base outline-none transition focus:border-[#d8b84c]"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-14 rounded-xl border border-[#d8b84c] bg-[#171717] px-7 font-medium text-[#d9d0b8] shadow-[5px_5px_0_#665a86] transition hover:-translate-y-0.5 hover:bg-[#3d315b] hover:shadow-[3px_3px_0_#d8b84c] disabled:translate-y-0 disabled:opacity-70"
        >
          {loading ? "Checking…" : "Check my website"}
        </button>
      </form>

      <div aria-live="polite" className="text-left">
        {error && (
          <p id="site-url-error" role="alert" className="check-error mt-4 rounded-xl px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {loading && (
          <p className="mt-6 text-center text-sm text-gray-400">
            Opening the page and testing its links. This can take up to 30 seconds…
          </p>
        )}

        {report && (
          <section className="mt-10" aria-label="Website check results">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-bold">Results</h2>
              <a
                className="break-all text-sm text-[#d8b84c] underline underline-offset-4"
                href={report.finalUrl}
                target="_blank"
                rel="noreferrer"
              >
                {report.finalUrl}
              </a>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {(["pass", "warn", "fail"] as const).map((status) => (
                <div key={status} className={`check-summary check-${status} rounded-xl p-4 text-center`}>
                  <p className="text-3xl font-bold">{report.summary[status]}</p>
                  <p className="mt-1 text-sm">{STATUS_LABEL[status]}</p>
                </div>
              ))}
            </div>

            <ul className="mt-6 space-y-3">
              {sortedChecks.map((check) => (
                <li key={check.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
                    <span className={`check-badge check-${check.status}`}>{STATUS_LABEL[check.status]}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{check.label}</p>
                      <p className="mt-1 break-words text-sm text-gray-500">{check.detail}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-gray-400">
              Checked {new Date(report.checkedAt).toLocaleString()} · server answered in {report.responseTimeMs} ms
            </p>
          </section>
        )}
      </div>
    </>
  );
}
