"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type Status = "passed" | "failed" | "warning" | "skipped";
type Severity = "critical" | "high" | "medium" | "low";

interface TestResult {
  id: string;
  category: string;
  name: string;
  description: string;
  status: Status;
  severity: Severity;
  expected?: string;
  actual?: string;
  location?: string;
  page?: string;
}

interface PageResult {
  url: string;
  status: number | null;
  title: string;
  loadTime: number;
  passed: string[];
  warnings: string[];
  failed: string[];
}

interface ScannerIssue {
  title: string;
  severity: Severity;
  description: string;
  location?: string;
  page?: string;
}

interface ScanResult {
  url: string;
  score: number;
  issues: ScannerIssue[];
  pages: Array<{ url: string; status: number | null; title: string; issues: ScannerIssue[] }>;
  links: Array<{ url: string; status: number | null; result: string; sourcePage: string; finalUrl: string }>;
  stats: {
    pagesScanned: number;
    linksChecked: number;
    brokenLinks: number;
    unreachableLinks: number;
    redirects: number;
    issuesFound: number;
  };
  qa?: {
    tests: TestResult[];
    summary: {
      total: number;
      passed: number;
      failed: number;
      warnings: number;
      skipped: number;
      completed: number;
      score: number;
    };
    pages: PageResult[];
  };
}

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [dollPosition, setDollPosition] = useState({ left: 4, y: 18 });
  const [dollBubbleOpen, setDollBubbleOpen] = useState(false);
  const [dollMessageStep, setDollMessageStep] = useState(0);
  const [milkshakeVisible, setMilkshakeVisible] = useState(false);
  const [dollFollowingButton, setDollFollowingButton] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [milkshakeDragging, setMilkshakeDragging] = useState(false);
  const [milkshakePosition, setMilkshakePosition] = useState({ top: 0 });
  const [manualDollPosition, setManualDollPosition] = useState<{ left: number; y: number } | null>(null);
  const [draggingDoll, setDraggingDoll] = useState(false);
  const suppressDollClick = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const suppressMilkshakeClick = useRef(false);
  const milkshakeDragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function updateDollPosition() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      const left = Math.sin(progress * Math.PI * 3) >= 0 ? 86 : 4;

      setDollPosition({ left, y: 18 + progress * 62 });
    }

    updateDollPosition();
    window.addEventListener("scroll", updateDollPosition, { passive: true });
    return () => window.removeEventListener("scroll", updateDollPosition);
  }, []);

  useEffect(() => {
    if (!dollBubbleOpen) return;

    const closeBubble = window.setTimeout(() => {
      setDollBubbleOpen(false);
    }, 5000);

    return () => window.clearTimeout(closeBubble);
  }, [dollBubbleOpen, dollMessageStep]);

  function scrollToReview() {
    setDollFollowingButton(false);
    setManualDollPosition(null);
    setDollBubbleOpen(false);
    setDollMessageStep(0);
    setMilkshakeVisible(false);
    setWelcomeVisible(true);

    window.setTimeout(() => {
      setWelcomeVisible(false);
      router.push("/contact");
    }, 2000);
  }

  function acceptMilkshake() {
    setDollMessageStep(1);
    setDollBubbleOpen(true);
    setMilkshakeVisible(true);
  }

  function startDraggingDoll(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY };
    suppressDollClick.current = false;
    setDraggingDoll(true);
  }

  function dragDoll(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingDoll) return;

    const distance = Math.hypot(
      event.clientX - dragStart.current.x,
      event.clientY - dragStart.current.y
    );

    if (distance > 4) {
      suppressDollClick.current = true;
    }

    if (!suppressDollClick.current) return;

    setManualDollPosition({
      left: Math.min(88, Math.max(2, (event.clientX / window.innerWidth) * 100 - 4)),
      y: Math.min(94, Math.max(8, (event.clientY / window.innerHeight) * 100)),
    });
  }

  function stopDraggingDoll(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDraggingDoll(false);
  }

  function openDollBubble() {
    if (suppressDollClick.current) {
      suppressDollClick.current = false;
      return;
    }

    setDollBubbleOpen(true);
  }

  function catchMilkshake() {
    setMilkshakeVisible(false);
    setDollMessageStep(2);
    setDollBubbleOpen(true);
    setDollFollowingButton(true);

    window.setTimeout(() => setDollMessageStep(3), 1800);
  }

  function startDraggingMilkshake(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    milkshakeDragStart.current = { x: event.clientX, y: event.clientY };
    suppressMilkshakeClick.current = false;
    setMilkshakeDragging(true);
    setMilkshakePosition({ top: (event.clientY / window.innerHeight) * 100 });
  }

  function dragMilkshake(event: PointerEvent<HTMLButtonElement>) {
    if (!milkshakeDragging) return;

    const distance = Math.hypot(
      event.clientX - milkshakeDragStart.current.x,
      event.clientY - milkshakeDragStart.current.y
    );

    if (distance > 4) suppressMilkshakeClick.current = true;
    if (!suppressMilkshakeClick.current) return;

    setMilkshakePosition({
      top: Math.min(92, Math.max(4, (event.clientY / window.innerHeight) * 100)),
    });
  }

  function stopDraggingMilkshake(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setMilkshakeDragging(suppressMilkshakeClick.current);
  }

  function clickMilkshake() {
    if (suppressMilkshakeClick.current) {
      suppressMilkshakeClick.current = false;
      return;
    }

    catchMilkshake();
  }

  const dollMessages = [
    "Would you like a mango milkshake?",
    "Hurry, click on it!",
    "I want you to do something for me.",
    "Click on the button here.",
  ];

  const displayedDollLeft = 4;

  async function scanWebsite() {
    setError("");
    setResult(null);

    if (!url.trim()) {
      setError("Please enter a website URL.");
      return;
    }

    let formattedUrl = url.trim();

    if (
      !formattedUrl.startsWith("http://") &&
      !formattedUrl.startsWith("https://")
    ) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: formattedUrl,
        }),
      });

      const responseText = await response.text();
      let data: { error?: string } & Partial<ScanResult> = {};

      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText) as { error?: string } & Partial<ScanResult>;
        } catch {
          throw new Error(
            `The scan server returned an invalid response (HTTP ${response.status}).`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `The scan could not finish (HTTP ${response.status}). The deployed server may have timed out.`
        );
      }

      if (!data.qa) {
        throw new Error("The scan server returned no results. Please try again.");
      }

      setResult(data as ScanResult);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to scan website."
      );
    } finally {
      setLoading(false);
    }
  }

  function statusClasses(status: string) {
    if (status === "passed") {
      return "border-green-200 bg-green-50";
    }

    if (status === "failed") {
      return "border-red-200 bg-red-50";
    }

    if (status === "warning") {
      return "border-yellow-200 bg-yellow-50";
    }

    return "border-gray-200 bg-gray-50";
  }

  function statusDot(status: string) {
    if (status === "passed") {
      return "bg-green-500";
    }

    if (status === "failed") {
      return "bg-red-500";
    }

    if (status === "warning") {
      return "bg-yellow-500";
    }

    return "bg-gray-400";
  }

  function statusText(status: string) {
    if (status === "passed") return "Passed";
    if (status === "failed") return "Failed";
    if (status === "warning") return "Warning";
    return "Skipped";
  }

  function readableSeverity(severity: Severity) {
    if (severity === "critical") return "Urgent";
    if (severity === "high") return "Important";
    if (severity === "medium") return "Needs attention";
    return "Minor";
  }

  function readableLocation(value?: string) {
    if (!value) return "This page";

    try {
      const parsed = new URL(value);
      return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
    } catch {
      return "This page";
    }
  }

  function safeTechnicalValue(value: string) {
    try {
      const parsed = new URL(value);
      const sensitive = /key|token|secret|password|passwd|auth|credential/i;

      for (const key of parsed.searchParams.keys()) {
        if (sensitive.test(key)) {
          parsed.searchParams.set(key, "[hidden]");
        }
      }

      return parsed.toString();
    } catch {
      return value
        .replace(/(api[-_]?key|token|secret|password|passwd)=([^&\s]+)/gi, "$1=[hidden]");
    }
  }

  function readableIssue(issue: ScannerIssue) {
    const title = issue.title.toLowerCase();

    if (title.includes("broken link")) {
      return { title: "A link does not work", description: "Visitors may see an error when they follow this link." };
    }

    if (title.includes("unreachable link")) {
      return { title: "A link could not be opened", description: "OtherLab could not reach this link, so it may be unavailable." };
    }

    if (title.includes("redirect")) {
      return { title: "A link takes visitors somewhere else", description: "This link sends visitors to a different page than expected." };
    }

    if (title.includes("console error")) {
      return { title: "The page has a behind-the-scenes error", description: "Something went wrong while the page was running. Some features may not work correctly." };
    }

    if (title.includes("network request")) {
      return { title: "Part of the page could not load", description: "A file or service needed by the page did not respond." };
    }

    if (title.includes("missing page title")) {
      return { title: "The page is missing a title", description: "Visitors may have trouble identifying this page in their browser tab." };
    }

    if (title.includes("missing meta description")) {
      return { title: "The page is missing a short description", description: "Search engines may not have a clear summary to show for this page." };
    }

    if (title.includes("missing mobile viewport")) {
      return { title: "The page may not fit well on phones", description: "The page does not tell phones how to size and display its content." };
    }

    if (title.includes("image missing alt")) {
      return { title: "An image needs a description", description: "People using a screen reader may not know what this image shows." };
    }

    if (title.includes("horizontal mobile overflow")) {
      return { title: "The page is wider than the screen", description: "Phone users may need to scroll sideways to see everything." };
    }

    if (title.includes("not using https")) {
      return { title: "The website connection is not fully secure", description: "This page is not using the secure connection expected for a public website." };
    }

    if (title.includes("page returns an error") || title.includes("could not be scanned")) {
      return { title: "This page could not be opened", description: "Visitors may not be able to use this page right now." };
    }

    return { title: issue.title, description: issue.description };
  }

  function getSimpleExplanation(test: TestResult) {
    if (test.actual) {
      return test.actual;
    }

    if (test.status === "passed") {
      return "This check worked correctly.";
    }

    if (test.status === "failed") {
      return "OtherLab found a problem with this part of the website.";
    }

    if (test.status === "warning") {
      return "OtherLab found something that may need attention.";
    }

    return "OtherLab could not safely perform this test yet.";
  }

  function TestCard({ test }: { test: TestResult }) {
    return (
      <div
        className={`rounded-2xl border p-5 ${statusClasses(
          test.status
        )}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${statusDot(
              test.status
            )}`}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900">
                {test.name}
              </h3>

              <div className="flex items-center gap-2">
                <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-gray-500">
                  {test.id}
                </span>

                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {statusText(test.status)}
                </span>
              </div>
            </div>

            <p className="mt-2 text-sm leading-6 text-gray-700">
              {getSimpleExplanation(test)}
            </p>

            {test.location && (
              <div className="mt-3 break-all rounded-lg bg-white/70 p-3">
                <p className="text-xs font-medium text-gray-400">
                  Page checked
                </p>

                <p className="mt-1 text-xs text-gray-600">
                  {readableLocation(test.page || test.location)}
                </p>
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-gray-500">
                Technical details
              </summary>

              <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-gray-600">
                <p>
                  <strong>Type:</strong>{" "}
                  {test.category}
                </p>

                <p className="mt-1">
                  <strong>Importance:</strong>{" "}
                  {readableSeverity(test.severity)}
                </p>

                {test.expected && (
                  <p className="mt-1">
                    <strong>Expected:</strong>{" "}
                    {test.expected}
                  </p>
                )}

                {test.actual && (
                  <p className="mt-1">
                    <strong>Actual:</strong>{" "}
                    {test.actual}
                  </p>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main
      className="coraline-page min-h-screen text-[#d9d0b8]"
      style={
        {
          "--doll-left": `${displayedDollLeft}vw`,
          "--doll-y": `${dollFollowingButton ? 78 : manualDollPosition?.y ?? dollPosition.y}vh`,
          "--milkshake-top": `${milkshakePosition.top}vh`,
        } as CSSProperties
      }
    >
      <div className="doll-companion">
        <button
          type="button"
          className={`doll-trigger ${draggingDoll ? "doll-trigger-dragging" : ""}`}
          aria-label="Talk to the doll"
          onClick={openDollBubble}
          onPointerDown={startDraggingDoll}
          onPointerMove={dragDoll}
          onPointerUp={stopDraggingDoll}
          onPointerCancel={stopDraggingDoll}
        >
          <Image
            src="/doll.png"
            alt=""
            className="doll-image"
            width={112}
            height={112}
          />
        </button>

        {dollBubbleOpen && (
          <div
            className={`doll-bubble ${displayedDollLeft < 50 ? "doll-bubble-right" : "doll-bubble-left"}`}
            role="dialog"
            aria-label="Milkshake offer"
          >
            {dollMessageStep === 0 && (
              <button
                type="button"
                className="doll-choice doll-choice-no"
                aria-label="No, close this message"
                onClick={() => setDollBubbleOpen(false)}
              >
                x
              </button>
            )}
            <p
              key={dollMessageStep}
              className="doll-message-typewriter"
              aria-label={dollMessages[dollMessageStep]}
            >
              {Array.from(dollMessages[dollMessageStep]).map((character, index) => (
                <span
                  key={`${dollMessageStep}-${index}`}
                  className="doll-message-character"
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  {character === " " ? "\u00a0" : character}
                </span>
              ))}
            </p>
            {dollMessageStep === 0 && (
              <button
                type="button"
                className="doll-choice doll-choice-yes"
                aria-label="Yes, show me the milkshake"
                onClick={acceptMilkshake}
              >
                ✓
              </button>
            )}
          </div>
        )}

      </div>

      {milkshakeVisible && (
        <button
          type="button"
          className={`milkshake-drop ${milkshakeDragging ? "milkshake-dragging" : ""}`}
          aria-label="Catch the mango milkshake"
          onClick={clickMilkshake}
          onPointerDown={startDraggingMilkshake}
          onPointerMove={dragMilkshake}
          onPointerUp={stopDraggingMilkshake}
          onPointerCancel={stopDraggingMilkshake}
        >
          <Image
            src="/milkshake.png"
            alt="Mango milkshake"
            width={104}
            height={104}
            onAnimationEnd={() => setMilkshakeVisible(false)}
          />
        </button>
      )}

      <button
        type="button"
        className="floating-cta-button"
        aria-label="Jump to the personal QA review section"
        onClick={scrollToReview}
      >
        <Image src="/button.png" alt="" width={72} height={72} />
      </button>

      {welcomeVisible && (
        <div className="welcome-screen" role="status" aria-live="polite">
          <div className="welcome-content">
            <p>Welcome to OtherLab</p>
            <span>Have a suggestion, idea, or a website that needs a closer look?</span>
            <div className="welcome-actions">
              <a href="mailto:insharahaman8@gmail.com?subject=An%20idea%20for%20OtherLab">
                Share an idea
              </a>
              <a href="/contact">Reach out</a>
            </div>
          </div>
        </div>
      )}

      <div className="coraline-stars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-16">

        {/* HERO */}

        <div className="mx-auto max-w-3xl text-center">

          <div className="stitched-border mb-6 inline-flex rounded-full bg-[#3d315b] px-4 py-2 text-sm font-medium text-[#d8b84c] shadow-[3px_3px_0_rgba(0,0,0,0.28)]">
            OtherLab by Insharah
          </div>

          <h1
            className="text-5xl font-bold tracking-tight sm:text-7xl"
            aria-label="Does your website actually work?"
          >
            <span className="typewriter-line">
              {Array.from("Does your website").map((character, index) => (
                <span
                  key={`header-first-${index}`}
                  className="header-character"
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  {character === " " ? "\u00a0" : character}
                </span>
              ))}
            </span>
            <span className="typewriter-line typewriter-line-accent text-[#d8b84c]">
              {Array.from("actually work?").map((character, index) => (
                <span
                  key={`header-second-${index}`}
                  className="header-character"
                  aria-hidden="true"
                  style={{ animationDelay: `${("Does your website".length + 2 + index) * 45}ms` }}
                >
                  {character === " " ? "\u00a0" : character}
                </span>
              ))}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-500">
            OtherLab checks the parts of your website visitors use first,
            then explains anything that may need fixing in plain language.
          </p>

          {/* URL INPUT */}

          <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row">

            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  scanWebsite();
                }
              }}
              placeholder="https://yourwebsite.com"
              className="h-14 flex-1 rounded-xl border border-gray-300 px-5 text-base outline-none transition focus:border-black"
            />

            <button
              onClick={scanWebsite}
              disabled={loading}
              className="h-14 rounded-xl border border-[#d8b84c] bg-[#171717] px-7 font-medium text-[#d9d0b8] shadow-[5px_5px_0_#665a86] transition hover:-translate-y-0.5 hover:bg-[#3d315b] hover:shadow-[3px_3px_0_#d8b84c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Checking website..." : "Check my website"}
            </button>

          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-left text-sm text-red-600">
              {error}
            </div>
          )}

        </div>

        {/* LOADING */}

        {loading && (
          <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-gray-200 p-6">

            <div className="flex justify-between text-sm">
              <span className="font-medium">
                Checking your website...
              </span>

              <span className="text-gray-400">
                Please wait
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-black" />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              OtherLab is opening your website like a visitor would,
              checking pages, links, images, and common problems.
            </p>

          </div>
        )}

        {/* RESULTS */}

        {result && result.qa && (
          <div className="mt-16">

            {/* SCORE SUMMARY */}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

              <div className="rounded-2xl border border-gray-200 p-6">
                <p className="text-sm text-gray-500">
                  Website score
                </p>

                <p className="mt-2 text-5xl font-bold">
                  {result.qa.summary.score}
                </p>

                <p className="mt-2 text-sm text-gray-400">
                  out of 100
                </p>
              </div>

              <a href="#passed-checks" className="summary-tab rounded-2xl border border-green-200 bg-green-50 p-6">
                <p className="text-sm font-medium text-green-700">
                  Passed
                </p>

                <p className="mt-2 text-4xl font-bold text-green-700">
                  {result.qa.summary.passed}
                </p>

                <p className="mt-2 text-sm text-green-600">
                  Working correctly
                </p>
              </a>

              <a href="#failed-checks" className="summary-tab rounded-2xl border border-red-200 bg-red-50 p-6">
                <p className="text-sm font-medium text-red-700">
                  Failed
                </p>

                <p className="mt-2 text-4xl font-bold text-red-700">
                  {result.qa.summary.failed}
                </p>

                <p className="mt-2 text-sm text-red-600">
                  Problems found
                </p>
              </a>

              <a href="#warning-checks" className="summary-tab rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
                <p className="text-sm font-medium text-yellow-700">
                  Warnings
                </p>

                <p className="mt-2 text-4xl font-bold text-yellow-700">
                  {result.qa.summary.warnings}
                </p>

                <p className="mt-2 text-sm text-yellow-600">
                  Needs review
                </p>
              </a>

              <a href="#skipped-checks" className="summary-tab rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <p className="text-sm font-medium text-gray-500">
                  Skipped
                </p>

                <p className="mt-2 text-4xl font-bold text-gray-600">
                  {result.qa.summary.skipped}
                </p>

                <p className="mt-2 text-sm text-gray-500">
                  Not automated yet
                </p>
              </a>

            </div>

            {/* WEBSITE INFO */}

            <div className="mt-6 rounded-2xl border border-gray-200 p-6">

              <p className="text-sm text-gray-500">
                Website tested
              </p>

              <h2 className="mt-1 break-all text-2xl font-semibold">
                {result.url}
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-500">
                OtherLab tested the website using a real browser.
                It can safely test public pages automatically,
                while sensitive workflows such as payments and
                private accounts require dedicated test access.
              </p>

            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Pages scanned", result.stats.pagesScanned],
                ["Links checked", result.stats.linksChecked],
                ["Broken links", result.stats.brokenLinks],
                ["Unreachable", result.stats.unreachableLinks],
                ["Redirects", result.stats.redirects],
                ["Scanner issues", result.stats.issuesFound],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* PAGES TESTED */}

            {result.qa.pages &&
              result.qa.pages.length > 0 && (
                <section className="mt-12">

                  <div className="mb-5">

                    <h2 className="text-2xl font-bold">
                      Pages tested
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      OtherLab discovered these internal pages and
                      checked them automatically.
                    </p>

                  </div>

                  <div className="grid gap-4 md:grid-cols-2">

                    {result.qa.pages.map(
                      (page: PageResult, index: number) => (
                        <div
                          key={`${page.url}-${index}`}
                          className="rounded-2xl border border-gray-200 p-5"
                        >

                          <div className="flex items-start justify-between gap-4">

                            <div className="min-w-0">

                              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                Page {index + 1}
                              </p>

                              <h3 className="mt-1 break-all font-semibold">
                                {page.url}
                              </h3>

                            </div>

                            <span
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                                page.status &&
                                page.status >= 200 &&
                                page.status < 400
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {page.status
                                ? `HTTP ${page.status}`
                                : "Failed"}
                            </span>

                          </div>

                          {page.title && (
                            <p className="mt-3 text-sm text-gray-500">
                              <strong className="text-gray-700">
                                Title:
                              </strong>{" "}
                              {page.title}
                            </p>
                          )}

                          <div className="mt-4 grid grid-cols-2 gap-3">

                            <div className="rounded-lg bg-gray-50 p-3">
                              <p className="text-xs text-gray-400">
                                Load time
                              </p>

                              <p className="mt-1 font-semibold">
                                {page.loadTime} ms
                              </p>
                            </div>

                            <div className="rounded-lg bg-gray-50 p-3">
                              <p className="text-xs text-gray-400">
                                Result
                              </p>

                              <p className="mt-1 font-semibold">
                                {page.failed?.length
                                  ? "Problems found"
                                  : page.warnings?.length
                                  ? "Review needed"
                                  : "Passed"}
                              </p>
                            </div>

                          </div>

                          {page.passed?.length > 0 && (
                            <div className="mt-4">

                              <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
                                Passed
                              </p>

                              <ul className="mt-2 space-y-1">

                                {page.passed.map(
                                  (
                                    item: string,
                                    i: number
                                  ) => (
                                    <li
                                      key={i}
                                      className="text-sm text-gray-600"
                                    >
                                      ✓ {item}
                                    </li>
                                  )
                                )}

                              </ul>

                            </div>
                          )}

                          {page.warnings?.length > 0 && (
                            <div className="mt-4">

                              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-600">
                                Warnings
                              </p>

                              <ul className="mt-2 space-y-1">

                                {page.warnings.map(
                                  (
                                    item: string,
                                    i: number
                                  ) => (
                                    <li
                                      key={i}
                                      className="text-sm text-gray-600"
                                    >
                                      ! {item}
                                    </li>
                                  )
                                )}

                              </ul>

                            </div>
                          )}

                          {page.failed?.length > 0 && (
                            <div className="mt-4">

                              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                                Failed
                              </p>

                              <ul className="mt-2 space-y-1">

                                {page.failed.map(
                                  (
                                    item: string,
                                    i: number
                                  ) => (
                                    <li
                                      key={i}
                                      className="text-sm text-gray-600"
                                    >
                                      ✕ {item}
                                    </li>
                                  )
                                )}

                              </ul>

                            </div>
                          )}

                        </div>
                      )
                    )}

                  </div>

                </section>
              )}

            {/* PASSED TESTS */}

            <section id="passed-checks" className="mt-12 scroll-mt-8">

              <div className="mb-5">

                <div className="flex items-end justify-between gap-4">

                  <div>

                    <h2 className="text-2xl font-bold">
                      Checks that passed
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      These checks worked correctly.
                    </p>

                  </div>

                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                    {result.qa.summary.passed} passed
                  </span>

                </div>

              </div>

              <div className="grid gap-4 md:grid-cols-2">

                {result.qa.tests
                  .filter(
                    (test: TestResult) =>
                      test.status === "passed"
                  )
                    .map((test: TestResult) => (
                    <TestCard
                      key={test.id}
                      test={test}
                    />
                  ))}

                {result.qa.summary.passed === 0 && (
                  <div className="rounded-2xl border border-gray-200 p-6 md:col-span-2">
                    <p className="text-sm text-gray-500">
                      No automated checks have passed yet.
                    </p>
                  </div>
                )}

              </div>

            </section>

            {/* FAILED TESTS */}

            <section id="failed-checks" className="mt-12 scroll-mt-8">

              <div className="mb-5">

                <div className="flex items-end justify-between gap-4">

                  <div>

                    <h2 className="text-2xl font-bold">
                      Problems found
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      These checks failed and should be investigated.
                    </p>

                  </div>

                  <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                    {result.qa.summary.failed} failed
                  </span>

                </div>

              </div>

              <div className="grid gap-4 md:grid-cols-2">

                {result.qa.tests
                  .filter(
                    (test: TestResult) =>
                      test.status === "failed"
                  )
                    .map((test: TestResult) => (
                    <TestCard
                      key={test.id}
                      test={test}
                    />
                  ))}

                {result.qa.summary.failed === 0 && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-6 md:col-span-2">

                    <h3 className="font-semibold text-green-700">
                      No automated failures found
                    </h3>

                    <p className="mt-2 text-sm text-green-600">
                      OtherLab did not detect a definite failure
                      in the checks it was able to perform.
                    </p>

                  </div>
                )}

              </div>

            </section>

            {/* WARNINGS */}

            <section id="warning-checks" className="mt-12 scroll-mt-8">

              <div className="mb-5">

                <div className="flex items-end justify-between gap-4">

                  <div>

                    <h2 className="text-2xl font-bold">
                      Things to review
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      These are not necessarily broken, but they
                      deserve a closer look.
                    </p>

                  </div>

                  <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
                    {result.qa.summary.warnings} warnings
                  </span>

                </div>

              </div>

              <div className="grid gap-4 md:grid-cols-2">

                {result.qa.tests
                  .filter(
                    (test: TestResult) =>
                      test.status === "warning"
                  )
                    .map((test: TestResult) => (
                    <TestCard
                      key={test.id}
                      test={test}
                    />
                  ))}

                {result.qa.summary.warnings === 0 && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-6 md:col-span-2">

                    <p className="text-sm text-green-700">
                      No warnings were detected.
                    </p>

                  </div>
                )}

              </div>

            </section>

            {/* SKIPPED */}

            <section id="skipped-checks" className="mt-12 scroll-mt-8">

              <div className="mb-5">

                <div className="flex items-end justify-between gap-4">

                  <div>

                    <h2 className="text-2xl font-bold">
                      Checks not tested yet
                    </h2>

                    <p className="mt-1 text-sm text-gray-600">
                      These checks need a private account, test payment, or extra information before they can be checked safely.
                    </p>

                  </div>

                  <span className="rounded-full bg-[#d8b84c] px-3 py-1 text-sm font-medium text-[#171717]">
                    {result.qa.summary.skipped} skipped
                  </span>

                </div>

              </div>

              <div id="cta-section" className="coraline-card mt-5 rounded-2xl border p-5 scroll-mt-8">
                <p className="text-lg font-semibold text-[#171717]">
                  Need a proper QA review?
                </p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#51475a]">
                  I can test the private parts of your product with you, explain what is wrong, and help you make a clear fix list.
                </p>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
                  <a
                    className="coraline-link"
                    href="mailto:insharahaman8@gmail.com?subject=Book%20an%20OtherLab%20session"
                  >
                    Book a session by email
                  </a>
                  <a
                    className="coraline-link"
                    href="https://www.linkedin.com/in/inshar-aman/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Connect on LinkedIn
                  </a>
                </div>
              </div>

              <details className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  Show the {result.qa.summary.skipped} checks that need extra access or setup
                </summary>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {result.qa.tests
                    .filter((test: TestResult) => test.status === "skipped")
                    .map((test: TestResult) => (
                      <TestCard key={test.id} test={test} />
                    ))}
                </div>
              </details>

            </section>

            {/* ORIGINAL SCANNER ISSUES */}

            {result.issues &&
              result.issues.length > 0 && (
                <section className="mt-12">

                  <div className="mb-5">

                    <h2 className="text-2xl font-bold">
                      Things to fix or review
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Additional problems detected while crawling
                      the website.
                    </p>

                  </div>

                  <div className="grid gap-4 md:grid-cols-2">

                    {result.issues.map(
                      (issue: ScannerIssue, index: number) => {
                        const friendly = readableIssue(issue);

                        return (
                          <div
                            key={index}
                            className="rounded-2xl border border-gray-200 p-5"
                          >

                            <div className="flex items-start justify-between gap-4">

                              <h3 className="font-semibold">
                                {friendly.title}
                              </h3>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                issue.severity ===
                                "high"
                                  ? "bg-red-100 text-red-700"
                                  : issue.severity ===
                                    "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {issue.severity}
                            </span>

                            </div>

                            <p className="mt-3 text-sm leading-6 text-gray-500">
                              {friendly.description}
                            </p>

                            <p className="mt-4 text-sm text-gray-500">
                              <strong className="text-gray-700">Where:</strong>{" "}
                              {readableLocation(issue.page || issue.location)}
                            </p>

                            <details className="mt-4">
                              <summary className="cursor-pointer text-xs font-medium text-gray-500">
                                Show technical details
                              </summary>

                              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                                <p><strong>Original check:</strong> {issue.title}</p>
                                {issue.location && (
                                  <p className="mt-1 break-all"><strong>Technical location:</strong> {safeTechnicalValue(issue.location)}</p>
                                )}
                                <p className="mt-1 break-all"><strong>Reported detail:</strong> {issue.description}</p>
                              </div>
                            </details>

                          </div>
                        );
                      }
                    )}

                  </div>

                </section>
              )}

          </div>
        )}

        {/* EMPTY STATE */}

        {!result && !loading && (
          <div className="mt-10 text-center">

            <p className="text-sm text-gray-400">
              No account required. Enter a URL and OtherLab will
              test it.
            </p>

            <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="font-medium">
                  1. Enter URL
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Tell OtherLab which website to test.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="font-medium">
                  2. OtherLab scans
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  It opens the website and checks multiple pages.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="font-medium">
                  3. See the results
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  See what passed, failed, or needs attention.
                </p>
              </div>

            </div>

          </div>
        )}

      </section>
    </main>
  );
}