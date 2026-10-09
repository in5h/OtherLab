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
}

/** fetch() that follows redirects manually so every hop passes the public-host check. */
async function safeFetch(
  start: URL,
  method: "GET" | "HEAD",
  timeoutMs: number,
): Promise<FetchOutcome> {
  let current = start;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicHost(current);
    const response = await fetch(current, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new SiteCheckError("The website redirected to an unsupported address.");
      }
      continue;
    }
    return { response, finalUrl: current, redirects };
  }
  throw new SiteCheckError("The website redirected too many times.");
}

async function readLimitedText(response: Response): Promise<{ text: string; bytes: number }> {
  if (!response.body) return { text: "", bytes: 0 };
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
  return { text: Buffer.concat(chunks).toString("utf8"), bytes };
}

function describeFetchError(error: unknown): string {
  if (error instanceof SiteCheckError) return error.message;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The website took longer than 10 seconds to respond.";
  }
  const cause = (error as { cause?: { code?: string } })?.cause?.code;
  if (cause === "ENOTFOUND" || cause === "EAI_AGAIN") {
    return "Could not find that website. Check the spelling of the address.";
  }
  if (cause === "ECONNREFUSED") return "The website refused the connection.";
  if (cause?.startsWith("CERT_") || cause?.includes("SSL") || cause?.includes("TLS")) {
    return "The website's security certificate could not be verified.";
  }
  return "The website could not be reached.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Pure HTML/header analysis, separated from networking so it can be tested with fixtures. */
export function analyzePage(input: {
  html: string;
  finalUrl: URL;
  headers: Headers;
  responseTimeMs: number;
  htmlBytes: number;
}): { checks: CheckResult[]; links: URL[] } {
  const { html, finalUrl, headers, responseTimeMs, htmlBytes } = input;
  const $ = cheerio.load(html);
  const checks: CheckResult[] = [];
  const isHttps = finalUrl.protocol === "https:";

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
        ? `The HTML is ${formatBytes(htmlBytes)}.`
        : `The HTML is ${formatBytes(htmlBytes)}, which is heavy and slows down first load.`,
  });

  const title = $("head > title").first().text().trim() || $("title").first().text().trim();
  checks.push(
    !title
      ? { id: "title", label: "Page title", status: "fail", detail: "The page has no <title>. It is shown in browser tabs and search results." }
      : title.length < 10 || title.length > 70
        ? { id: "title", label: "Page title", status: "warn", detail: `"${title}" is ${title.length} characters. 10–70 characters works best in search results.` }
        : { id: "title", label: "Page title", status: "pass", detail: `"${title}"` },
  );

  const description = $('meta[name="description" i]').attr("content")?.trim() ?? "";
  checks.push(
    !description
      ? { id: "description", label: "Meta description", status: "warn", detail: "No meta description. Search engines will guess a summary from the page text." }
      : description.length < 50 || description.length > 160
        ? { id: "description", label: "Meta description", status: "warn", detail: `The description is ${description.length} characters. 50–160 characters works best.` }
        : { id: "description", label: "Meta description", status: "pass", detail: `${description.length} characters.` },
  );

  const viewport = $('meta[name="viewport" i]').attr("content") ?? "";
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

  const h1Count = $("h1").length;
  checks.push(
    h1Count === 1
      ? { id: "h1", label: "Main heading", status: "pass", detail: `"${$("h1").first().text().trim().slice(0, 80)}"` }
      : h1Count === 0
        ? { id: "h1", label: "Main heading", status: "warn", detail: "The page has no <h1> heading." }
        : { id: "h1", label: "Main heading", status: "warn", detail: `The page has ${h1Count} <h1> headings. One main heading is clearer.` },
  );

  const images = $("img");
  const missingAlt = images.filter((_, el) => $(el).attr("alt") === undefined).length;
  checks.push(
    images.length === 0
      ? { id: "alt", label: "Image descriptions", status: "pass", detail: "No images found on the page." }
      : missingAlt === 0
        ? { id: "alt", label: "Image descriptions", status: "pass", detail: `All ${plural(images.length, "image")} have alt text.` }
        : { id: "alt", label: "Image descriptions", status: missingAlt / images.length > 0.25 ? "fail" : "warn", detail: `${missingAlt} of ${plural(images.length, "image")} have no alt attribute.` },
  );

  const unlabeled = $("input, select, textarea")
    .filter((_, el) => {
      const node = $(el);
      const type = (node.attr("type") ?? "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return false;
      const id = node.attr("id");
      const hasLabelFor = id ? $("label").filter((_, l) => $(l).attr("for") === id).length > 0 : false;
      return !(
        hasLabelFor ||
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

  const hasIcon = $('link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]').length > 0;
  checks.push(
    hasIcon
      ? { id: "favicon", label: "Favicon", status: "pass", detail: "A site icon is declared." }
      : { id: "favicon", label: "Favicon", status: "warn", detail: "No icon is declared in the page. Browsers will fall back to /favicon.ico if it exists." },
  );

  if (isHttps) {
    const insecure = $('img[src^="http:" i], script[src^="http:" i], iframe[src^="http:" i], link[rel~="stylesheet" i][href^="http:" i], video[src^="http:" i], audio[src^="http:" i], source[src^="http:" i]').length;
    checks.push(
      insecure === 0
        ? { id: "mixed", label: "Mixed content", status: "pass", detail: "No resources are loaded over insecure HTTP." }
        : { id: "mixed", label: "Mixed content", status: "fail", detail: `${plural(insecure, "resource")} ${insecure === 1 ? "is" : "are"} loaded over HTTP and may be blocked by browsers.` },
    );
  }

  const securityHeaders = [
    ...(isHttps ? [["strict-transport-security", "Strict-Transport-Security"]] : []),
    ["content-security-policy", "Content-Security-Policy"],
    ["x-content-type-options", "X-Content-Type-Options"],
  ];
  const missingHeaders = securityHeaders.filter(([h]) => !headers.has(h)).map(([, name]) => name);
  checks.push(
    missingHeaders.length === 0
      ? { id: "headers", label: "Security headers", status: "pass", detail: "Key security headers are present." }
      : { id: "headers", label: "Security headers", status: "warn", detail: `Missing: ${missingHeaders.join(", ")}.` },
  );

  const seen = new Set<string>();
  const links: URL[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#")) return;
    let link: URL;
    try {
      link = new URL(href, finalUrl);
    } catch {
      return;
    }
    if (link.protocol !== "http:" && link.protocol !== "https:") return;
    link.hash = "";
    if (link.href === finalUrl.href || seen.has(link.href)) return;
    seen.add(link.href);
    links.push(link);
  });
  // Prefer the site's own pages, since those are the ones the owner can fix.
  links.sort((a, b) => Number(b.host === finalUrl.host) - Number(a.host === finalUrl.host));

  return { checks, links };
}

async function checkLink(link: URL): Promise<number | "error"> {
  try {
    let { response } = await safeFetch(link, "HEAD", LINK_TIMEOUT_MS);
    // Many servers reject HEAD; retry those with GET before calling the link broken.
    if (response.status === 405 || response.status === 403 || response.status === 501) {
      ({ response } = await safeFetch(link, "GET", LINK_TIMEOUT_MS));
      await response.body?.cancel();
    }
    return response.status;
  } catch {
    return "error";
  }
}

async function checkLinks(links: URL[]): Promise<CheckResult> {
  const sample = links.slice(0, MAX_LINKS_TO_CHECK);
  if (sample.length === 0) {
    return { id: "links", label: "Links", status: "pass", detail: "No links to other pages were found." };
  }

  const broken: string[] = [];
  let index = 0;
  async function worker() {
    while (index < sample.length) {
      const link = sample[index++];
      const status = await checkLink(link);
      // 401/403/429 usually mean "blocked bots" rather than a dead page.
      if (status === "error" || (status >= 400 && ![401, 403, 429].includes(status))) {
        broken.push(`${link.href} (${status === "error" ? "unreachable" : status})`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LINK_CONCURRENCY, sample.length) }, worker));

  const scope =
    links.length > sample.length
      ? `the first ${sample.length} of ${plural(links.length, "link")}`
      : plural(sample.length, "link");
  if (broken.length === 0) {
    return { id: "links", label: "Links", status: "pass", detail: `Checked ${scope}; all of them work.` };
  }
  return {
    id: "links",
    label: "Links",
    status: "fail",
    detail: `Checked ${scope}; ${broken.length} broken: ${broken.slice(0, 5).join(", ")}${broken.length > 5 ? ", …" : ""}`,
  };
}

export async function checkSite(rawUrl: string): Promise<SiteReport> {
  const requested = normalizeUrl(rawUrl);

  const started = performance.now();
  let outcome: FetchOutcome;
  try {
    outcome = await safeFetch(requested, "GET", PAGE_TIMEOUT_MS);
  } catch (error) {
    throw new SiteCheckError(describeFetchError(error));
  }
  const { response, finalUrl } = outcome;
  const responseTimeMs = Math.round(performance.now() - started);

  if (!response.ok) {
    await response.body?.cancel();
    throw new SiteCheckError(
      `The website answered with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}, so the page could not be checked.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/html|xml/i.test(contentType)) {
    await response.body?.cancel();
    throw new SiteCheckError(`That address returns ${contentType.split(";")[0]}, not a web page.`);
  }

  let html: string;
  let htmlBytes: number;
  try {
    ({ text: html, bytes: htmlBytes } = await readLimitedText(response));
  } catch (error) {
    throw new SiteCheckError(describeFetchError(error));
  }

  const { checks, links } = analyzePage({
    html,
    finalUrl,
    headers: response.headers,
    responseTimeMs,
    htmlBytes,
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
  checks.push(await checkLinks(links));

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
