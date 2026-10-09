import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface SiteReport {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  checkedAt: string;
  checks: CheckResult[];
  summary: Record<CheckStatus, number>;
}

export class SiteCheckError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (compatible; OtherLabBot/1.0; +https://github.com/in5h/OtherLab)";
const PAGE_TIMEOUT_MS = 10_000;
const LINK_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_LINKS_TO_CHECK = 20;
const LINK_CONCURRENCY = 5;

/** Statuses that usually mean "this server blocks automated requests", not "this page is gone". */
const BOT_BLOCK_STATUSES = new Set([401, 403, 429, 999]);

/** Accepts "example.com", "https://example.com/path", etc. Returns a normalized http(s) URL. */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new SiteCheckError("Enter a website address to check.");

  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SiteCheckError("That does not look like a valid website address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SiteCheckError("Only http:// and https:// addresses can be checked.");
  }
  if (url.username || url.password) {
    throw new SiteCheckError("Addresses with embedded credentials are not supported.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !isIP(host)) {
    throw new SiteCheckError("Include the full domain, for example yourwebsite.com.");
  }
  url.hash = "";
  return url;
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    // IPv4-mapped/translated addresses in hex form, e.g. ::ffff:7f00:1 (how URL normalizes ::ffff:127.0.0.1)
    if (/^(::ffff:|64:ff9b::)[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower) || lower.startsWith("::ffff:0:")) {
      return true;
    }
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff")
    );
  }
  return true;
}

/** Blocks requests to localhost / private networks so the checker can't be used to probe internal services. */
async function assertPublicHost(url: URL): Promise<void> {
  if (process.env.OTHERLAB_ALLOW_PRIVATE_HOSTS === "1") return;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SiteCheckError("Local and private addresses cannot be checked.");
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new SiteCheckError(`Could not find a website at ${host}. Check the spelling.`);
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new SiteCheckError("Local and private addresses cannot be checked.");
  }
}

interface FetchOutcome {
  response: Response;
  finalUrl: URL;
  redirects: number;
  /** Time spent waiting on the website itself (all hops, up to response headers). */
  elapsedMs: number;
}

/** fetch() that follows redirects manually so every hop passes the public-host check. */
async function safeFetch(
  start: URL,
  method: "GET" | "HEAD",
  timeoutMs: number,
): Promise<FetchOutcome> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = start;
  let elapsedMs = 0;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicHost(current);
    const hopStarted = performance.now();
    const response = await fetch(current, {
      method,
      redirect: "manual",
      signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    elapsedMs += performance.now() - hopStarted;
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new SiteCheckError("The website redirected to an unsupported address.");
      }
      continue;
    }
    return { response, finalUrl: current, redirects, elapsedMs: Math.round(elapsedMs) };
  }
  throw new SiteCheckError("The website redirected too many times.");
}

function decodeHtml(bytes: Buffer, contentType: string): string {
  const declared =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ??
    bytes.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Unknown charset label: fall back to UTF-8 below.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function readLimitedBody(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new SiteCheckError("The page is larger than 3 MB, which is too large to analyse.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function errorCode(error: unknown): string | undefined {
  return (error as { cause?: { code?: string } })?.cause?.code;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function describeFetchError(error: unknown): string {
  if (error instanceof SiteCheckError) return error.message;
  if (isTimeout(error)) return "The website took longer than 10 seconds to respond.";
  const code = errorCode(error);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "Could not find that website. Check the spelling of the address.";
  }
  if (code === "ECONNREFUSED") return "The website refused the connection.";
  if (code === "ECONNRESET") return "The website closed the connection unexpectedly.";
  if (code?.startsWith("CERT_") || code?.includes("SSL") || code?.includes("TLS") || code?.includes("CERT")) {
    return "The website's security certificate could not be verified.";
  }
  return "The website could not be reached.";
}

function describeHttpError(status: number, statusText: string): string {
  if (BOT_BLOCK_STATUSES.has(status) || status === 503) {
    return `The website answered with HTTP ${status} and appears to block automated checks, so the page could not be analysed.`;
  }
  if (status === 404 || status === 410) {
    return `That page does not exist (HTTP ${status}). Check the address.`;
  }
  return `The website answered with HTTP ${status}${statusText ? ` ${statusText}` : ""}, so the page could not be checked.`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export interface PageAnalysis {
  checks: CheckResult[];
  links: URL[];
  /** True when the page declares an icon with <link rel="icon">; otherwise /favicon.ico should be probed. */
  declaresIcon: boolean;
}

/** Pure HTML/header analysis, separated from networking so it can be tested with fixtures. */
export function analyzePage(input: {
  html: string;
  finalUrl: URL;
  headers: Headers;
  responseTimeMs: number;
  htmlBytes: number;
}): PageAnalysis {
  const { html, finalUrl, headers, responseTimeMs, htmlBytes } = input;
  const $ = cheerio.load(html);
  const checks: CheckResult[] = [];
  const isHttps = finalUrl.protocol === "https:";

  // Relative links and resources resolve against <base href> when present.
  let baseUrl = finalUrl;
  const baseHref = $("base[href]").first().attr("href");
  if (baseHref) {
    try {
      baseUrl = new URL(baseHref, finalUrl);
    } catch {
      // Ignore an invalid <base>; browsers do the same.
    }
  }

  checks.push(
    isHttps
      ? { id: "https", label: "Secure connection (HTTPS)", status: "pass", detail: "The page is served over HTTPS." }
      : { id: "https", label: "Secure connection (HTTPS)", status: "fail", detail: "The page is served over plain HTTP. Browsers will mark it as \"Not secure\"." },
  );

  checks.push({
    id: "speed",
    label: "Server response time",
    status: responseTimeMs <= 800 ? "pass" : responseTimeMs <= 2500 ? "warn" : "fail",
    detail:
      responseTimeMs <= 800
        ? `The server answered in ${responseTimeMs} ms.`
        : `The server took ${responseTimeMs} ms to answer. Aim for under 800 ms.`,
  });

  checks.push({
    id: "size",
    label: "HTML size",
    status: htmlBytes <= 500 * 1024 ? "pass" : htmlBytes <= 1500 * 1024 ? "warn" : "fail",
    detail:
      htmlBytes <= 500 * 1024
        ? `The HTML is ${formatBytes(htmlBytes)} (uncompressed).`
        : `The HTML is ${formatBytes(htmlBytes)} (uncompressed), which is heavy and slows down first load.`,
  });

  // Ignore <title> elements inside inline SVGs; only the document title matters.
  const title = $("title")
    .filter((_, el) => $(el).closest("svg").length === 0)
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  checks.push(
    !title
      ? { id: "title", label: "Page title", status: "fail", detail: "The page has no <title>. It is shown in browser tabs and search results." }
      : title.length < 10 || title.length > 70
        ? { id: "title", label: "Page title", status: "warn", detail: `"${title}" is ${title.length} characters. 10–70 characters works best in search results.` }
        : { id: "title", label: "Page title", status: "pass", detail: `"${title}"` },
  );

  const description = ($('meta[name="description" i]').first().attr("content") ?? "").replace(/\s+/g, " ").trim();
  checks.push(
    !description
      ? { id: "description", label: "Meta description", status: "warn", detail: "No meta description. Search engines will guess a summary from the page text." }
      : description.length < 50 || description.length > 160
        ? { id: "description", label: "Meta description", status: "warn", detail: `The description is ${description.length} characters. 50–160 characters works best.` }
        : { id: "description", label: "Meta description", status: "pass", detail: `${description.length} characters.` },
  );

  const viewport = $('meta[name="viewport" i]').first().attr("content") ?? "";
  checks.push(
    /width\s*=\s*device-width/i.test(viewport)
      ? { id: "viewport", label: "Mobile friendly viewport", status: "pass", detail: "The page tells phones to use the device width." }
      : { id: "viewport", label: "Mobile friendly viewport", status: "fail", detail: "No viewport meta tag with width=device-width. The page will look tiny on phones." },
  );

  const lang = $("html").attr("lang")?.trim();
  checks.push(
    lang
      ? { id: "lang", label: "Page language", status: "pass", detail: `Language is set to "${lang}".` }
      : { id: "lang", label: "Page language", status: "warn", detail: "The <html> tag has no lang attribute, which screen readers rely on." },
  );

  const h1s = $("h1");
  const h1Text = (h1s.first().text().replace(/\s+/g, " ").trim() || h1s.first().find("img[alt]").attr("alt")?.trim() || "").slice(0, 80);
  checks.push(
    h1s.length === 1
      ? { id: "h1", label: "Main heading", status: "pass", detail: h1Text ? `"${h1Text}"` : "The page has one <h1> heading." }
      : h1s.length === 0
        ? { id: "h1", label: "Main heading", status: "warn", detail: "The page has no <h1> heading." }
        : { id: "h1", label: "Main heading", status: "warn", detail: `The page has ${h1s.length} <h1> headings. One main heading is clearer.` },
  );

  // Decorative images (hidden from assistive tech) don't need alt text.
  const images = $("img").filter((_, el) => {
    const img = $(el);
    const role = img.attr("role")?.toLowerCase();
    return img.attr("aria-hidden") !== "true" && role !== "presentation" && role !== "none";
  });
  const missingAlt = images.filter((_, el) => {
    const img = $(el);
    return (
      img.attr("alt") === undefined &&
      !img.attr("aria-label")?.trim() &&
      !img.attr("aria-labelledby")?.trim() &&
      !img.attr("title")?.trim()
    );
  }).length;
  checks.push(
    images.length === 0
      ? { id: "alt", label: "Image descriptions", status: "pass", detail: "No content images found on the page." }
      : missingAlt === 0
        ? { id: "alt", label: "Image descriptions", status: "pass", detail: `All ${plural(images.length, "image")} have alt text.` }
        : { id: "alt", label: "Image descriptions", status: missingAlt / images.length > 0.25 ? "fail" : "warn", detail: `${missingAlt} of ${plural(images.length, "image")} ${missingAlt === 1 ? "has" : "have"} no alt attribute.` },
  );

  const labelFor = new Set(
    $("label[for]")
      .map((_, l) => $(l).attr("for"))
      .get(),
  );
  const unlabeled = $("input, select, textarea")
    .filter((_, el) => {
      const node = $(el);
      const type = (node.attr("type") ?? "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return false;
      if (node.attr("hidden") !== undefined || node.attr("aria-hidden") === "true") return false;
      const id = node.attr("id");
      return !(
        (id && labelFor.has(id)) ||
        node.closest("label").length > 0 ||
        node.attr("aria-label")?.trim() ||
        node.attr("aria-labelledby")?.trim() ||
        node.attr("title")?.trim()
      );
    }).length;
  checks.push(
    unlabeled === 0
      ? { id: "labels", label: "Form field labels", status: "pass", detail: "Every form field has a label." }
      : { id: "labels", label: "Form field labels", status: "warn", detail: `${plural(unlabeled, "form field")} ${unlabeled === 1 ? "has" : "have"} no label, so screen reader users won't know what to type.` },
  );

  const declaresIcon =
    $("link[rel]").filter((_, el) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test($(el).attr("rel") ?? "")).length > 0;
  checks.push(
    declaresIcon
      ? { id: "favicon", label: "Favicon", status: "pass", detail: "A site icon is declared." }
      : { id: "favicon", label: "Favicon", status: "warn", detail: "No site icon is declared and none was found at /favicon.ico." },
  );

  if (isHttps) {
    // Only absolute http:// URLs are insecure; relative URLs inherit https.
    const insecureAttr = (value: string | undefined) => value?.trim().toLowerCase().startsWith("http:") ?? false;
    const insecureSrcset = (value: string | undefined) =>
      value?.split(",").some((candidate) => insecureAttr(candidate.trim().split(/\s+/)[0])) ?? false;
    let insecure = 0;
    $("img, script, iframe, video, audio, source, embed, track, link[rel], object").each((_, el) => {
      const node = $(el);
      const tag = (el as { tagName?: string }).tagName?.toLowerCase();
      if (tag === "link") {
        if (/(^|\s)(stylesheet|icon|preload|modulepreload)(\s|$)/i.test(node.attr("rel") ?? "") && insecureAttr(node.attr("href"))) insecure++;
        return;
      }
      if (insecureAttr(node.attr("src")) || insecureAttr(node.attr("data")) || insecureSrcset(node.attr("srcset"))) insecure++;
    });
    checks.push(
      insecure === 0
        ? { id: "mixed", label: "Mixed content", status: "pass", detail: "No resources are loaded over insecure HTTP." }
        : { id: "mixed", label: "Mixed content", status: "fail", detail: `${plural(insecure, "resource")} ${insecure === 1 ? "is" : "are"} loaded over HTTP and may be blocked by browsers.` },
    );
  }

  const hasMetaCsp = $('meta[http-equiv="content-security-policy" i]').length > 0;
  const securityHeaders: { present: boolean; name: string }[] = [
    ...(isHttps ? [{ present: headers.has("strict-transport-security"), name: "Strict-Transport-Security" }] : []),
    { present: headers.has("content-security-policy") || hasMetaCsp, name: "Content-Security-Policy" },
    { present: headers.has("x-content-type-options"), name: "X-Content-Type-Options" },
  ];
  const missingHeaders = securityHeaders.filter((h) => !h.present).map((h) => h.name);
  checks.push(
    missingHeaders.length === 0
      ? { id: "headers", label: "Security headers", status: "pass", detail: "Key security headers are present." }
      : { id: "headers", label: "Security headers", status: "warn", detail: `Missing: ${missingHeaders.join(", ")}.` },
  );

  const pageWithoutHash = new URL(finalUrl);
  pageWithoutHash.hash = "";
  const seen = new Set<string>([pageWithoutHash.href]);
  const links: URL[] = [];
  $("a[href], area[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#")) return;
    let link: URL;
    try {
      link = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (link.protocol !== "http:" && link.protocol !== "https:") return;
    link.hash = "";
    if (seen.has(link.href)) return;
    seen.add(link.href);
    links.push(link);
  });
  // Prefer the site's own pages, since those are the ones the owner can fix. sort() is stable, so page order is kept.
  links.sort((a, b) => Number(b.host === finalUrl.host) - Number(a.host === finalUrl.host));

  return { checks, links, declaresIcon };
}

export type LinkOutcome =
  | { kind: "ok"; status: number }
  | { kind: "broken"; status: number }
  | { kind: "blocked"; status: number }
  | { kind: "unreachable"; reason: string };

/** Classifies an HTTP status the way a visitor would experience the link. */
export function classifyLinkStatus(status: number): LinkOutcome["kind"] {
  if (status >= 200 && status < 400) return "ok";
  if (BOT_BLOCK_STATUSES.has(status)) return "blocked";
  return "broken";
}

async function checkLink(link: URL): Promise<LinkOutcome> {
  try {
    let status: number;
    try {
      const { response } = await safeFetch(link, "HEAD", LINK_TIMEOUT_MS);
      await response.body?.cancel();
      status = response.status;
    } catch (error) {
      if (error instanceof SiteCheckError) throw error;
      status = 0; // Some servers drop HEAD requests entirely; retry with GET below.
    }
    // Many servers answer HEAD incorrectly (400/403/404/405/501...). Only trust an error after a real GET.
    if (status === 0 || status >= 400) {
      const { response } = await safeFetch(link, "GET", LINK_TIMEOUT_MS);
      await response.body?.cancel();
      status = response.status;
    }
    const kind = classifyLinkStatus(status);
    return kind === "ok" ? { kind, status } : kind === "blocked" ? { kind, status } : { kind: "broken", status };
  } catch (error) {
    return {
      kind: "unreachable",
      reason: error instanceof SiteCheckError ? error.message : isTimeout(error) ? "timed out" : (errorCode(error) ?? "connection failed"),
    };
  }
}

export async function checkLinks(links: URL[], pageHost: string): Promise<CheckResult> {
  const sample = links.slice(0, MAX_LINKS_TO_CHECK);
  if (sample.length === 0) {
    return { id: "links", label: "Links", status: "pass", detail: "No links to other pages were found." };
  }

  const results: { link: URL; outcome: LinkOutcome }[] = [];
  let index = 0;
  async function worker() {
    while (index < sample.length) {
      const link = sample[index++];
      results.push({ link, outcome: await checkLink(link) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(LINK_CONCURRENCY, sample.length) }, worker));

  const broken = results.filter((r) => r.outcome.kind === "broken");
  // A timeout or connection error on the site's own page is a real problem; on someone else's site it may be temporary.
  const unreachableInternal = results.filter((r) => r.outcome.kind === "unreachable" && r.link.host === pageHost);
  const unreachableExternal = results.filter((r) => r.outcome.kind === "unreachable" && r.link.host !== pageHost);
  const blocked = results.filter((r) => r.outcome.kind === "blocked");

  const describe = (r: { link: URL; outcome: LinkOutcome }) =>
    `${r.link.href} (${"status" in r.outcome ? r.outcome.status : r.outcome.reason})`;
  const list = (items: typeof results) =>
    items.slice(0, 5).map(describe).join(", ") + (items.length > 5 ? ", …" : "");

  const scope =
    links.length > sample.length
      ? `the first ${sample.length} of ${plural(links.length, "link")}`
      : plural(sample.length, "link");

  const parts: string[] = [];
  if (broken.length) parts.push(`${broken.length} broken: ${list(broken)}`);
  if (unreachableInternal.length) parts.push(`${unreachableInternal.length} of the site's own pages could not be reached: ${list(unreachableInternal)}`);
  if (unreachableExternal.length) parts.push(`${unreachableExternal.length} external ${unreachableExternal.length === 1 ? "link" : "links"} could not be reached right now: ${list(unreachableExternal)}`);
  if (blocked.length) parts.push(`${blocked.length} ${blocked.length === 1 ? "site blocks" : "sites block"} automated checks, so ${blocked.length === 1 ? "it was" : "they were"} skipped`);

  const status: CheckStatus =
    broken.length || unreachableInternal.length ? "fail" : unreachableExternal.length ? "warn" : "pass";
  if (parts.length === 0) {
    return { id: "links", label: "Links", status, detail: `Checked ${scope}; all of them work.` };
  }
  return { id: "links", label: "Links", status, detail: `Checked ${scope}; ${parts.join("; ")}.` };
}

async function faviconExists(pageUrl: URL): Promise<boolean> {
  try {
    const { response } = await safeFetch(new URL("/favicon.ico", pageUrl), "GET", LINK_TIMEOUT_MS);
    await response.body?.cancel();
    const type = response.headers.get("content-type") ?? "";
    // Some servers answer every path with an HTML page; that isn't an icon.
    return response.ok && !/html/i.test(type);
  } catch {
    return false;
  }
}

/** True when an https:// request failed because HTTPS itself is unavailable (no TLS listener or a bad certificate). */
function httpsUnavailable(error: unknown): boolean {
  const code = errorCode(error) ?? "";
  return (
    ["ECONNREFUSED", "ECONNRESET", "EPROTO"].includes(code) ||
    code.includes("CERT") ||
    code.includes("SSL") ||
    code.includes("TLS")
  );
}

class PageFetchError extends SiteCheckError {
  constructor(
    message: string,
    readonly httpsUnavailable: boolean,
  ) {
    super(message);
  }
}

async function fetchPage(url: URL): Promise<FetchOutcome> {
  try {
    return await safeFetch(url, "GET", PAGE_TIMEOUT_MS);
  } catch (error) {
    throw new PageFetchError(describeFetchError(error), !(error instanceof SiteCheckError) && httpsUnavailable(error));
  }
}

export async function checkSite(rawUrl: string): Promise<SiteReport> {
  const requested = normalizeUrl(rawUrl);
  const schemeGiven = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl.trim());

  let outcome: FetchOutcome;
  try {
    outcome = await fetchPage(requested);
  } catch (error) {
    // "example.com" was assumed to be HTTPS. If HTTPS isn't available at all, try plain HTTP like a browser would.
    if (schemeGiven || !(error instanceof PageFetchError) || !error.httpsUnavailable) throw error;
    const httpUrl = new URL(requested);
    httpUrl.protocol = "http:";
    try {
      outcome = await fetchPage(httpUrl);
    } catch {
      throw error;
    }
  }
  const { response, finalUrl } = outcome;
  const responseTimeMs = outcome.elapsedMs;

  if (!response.ok) {
    await response.body?.cancel();
    throw new SiteCheckError(describeHttpError(response.status, response.statusText));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    await response.body?.cancel();
    throw new SiteCheckError(`That address returns ${contentType.split(";")[0].trim()}, not a web page.`);
  }

  let body: Buffer;
  try {
    body = await readLimitedBody(response);
  } catch (error) {
    throw new SiteCheckError(describeFetchError(error));
  }

  const { checks, links, declaresIcon } = analyzePage({
    html: decodeHtml(body, contentType),
    finalUrl,
    headers: response.headers,
    responseTimeMs,
    htmlBytes: body.byteLength,
  });

  checks.unshift({
    id: "status",
    label: "Page loads",
    status: "pass",
    detail:
      outcome.redirects > 0
        ? `Loaded ${finalUrl.href} after ${plural(outcome.redirects, "redirect")} (HTTP ${response.status}).`
        : `Loaded with HTTP ${response.status}.`,
  });

  const [linkCheck, hasFaviconFile] = await Promise.all([
    checkLinks(links, finalUrl.host),
    declaresIcon ? Promise.resolve(true) : faviconExists(finalUrl),
  ]);
  if (!declaresIcon && hasFaviconFile) {
    const favicon = checks.find((c) => c.id === "favicon");
    if (favicon) {
      favicon.status = "pass";
      favicon.detail = "A site icon was found at /favicon.ico.";
    }
  }
  checks.push(linkCheck);

  const summary: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) summary[check.status]++;

  return {
    requestedUrl: requested.href,
    finalUrl: finalUrl.href,
    statusCode: response.status,
    responseTimeMs,
    checkedAt: new Date().toISOString(),
    checks,
    summary,
  };
}
