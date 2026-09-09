import { Browser, Page } from "playwright";
import { launchBrowser } from "@/lib/browser";

export interface Issue {
  title: string;
  severity: "high" | "medium" | "low";
  description: string;
  location?: string;
  page?: string;
}

interface PageResult {
  url: string;
  status: number | null;
  title: string;
  issues: Issue[];
}

interface LinkResult {
  sourcePage: string;
  url: string;
  finalUrl: string;
  status: number | null;
  result:
    | "working"
    | "redirect"
    | "broken"
    | "unreachable";
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);

  parsed.hash = "";

  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}

function isInternalUrl(
  url: string,
  baseUrl: string
): boolean {
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);

    return target.hostname === base.hostname;
  } catch {
    return false;
  }
}

async function checkLink(
  browser: Browser,
  url: string,
  sourcePage: string
): Promise<LinkResult> {
  const page = await browser.newPage();

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const status = response?.status() ?? null;
    const finalUrl = page.url();

    if (status === null) {
      return {
        sourcePage,
        url,
        finalUrl,
        status,
        result: "unreachable",
      };
    }

    if (status >= 400) {
      return {
        sourcePage,
        url,
        finalUrl,
        status,
        result: "broken",
      };
    }

    if (
      normalizeUrl(finalUrl) !==
      normalizeUrl(url)
    ) {
      return {
        sourcePage,
        url,
        finalUrl,
        status,
        result: "redirect",
      };
    }

    return {
      sourcePage,
      url,
      finalUrl,
      status,
      result: "working",
    };
  } catch {
    return {
      sourcePage,
      url,
      finalUrl: url,
      status: null,
      result: "unreachable",
    };
  } finally {
    await page.close();
  }
}

export async function scanWebsite(
  url: string
) {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();

    const baseUrl = normalizeUrl(url);

    const pagesToScan: string[] = [baseUrl];

    const scannedUrls = new Set<string>();

    const pageResults: PageResult[] = [];

    const discoveredLinks = new Map<
      string,
      string
    >();

    const globalIssues: Issue[] = [];

    /*
     * --------------------------------------------------
     * CRAWL WEBSITE
     * --------------------------------------------------
     */

    while (
      pagesToScan.length > 0 &&
      scannedUrls.size < 4
    ) {
      const currentUrl = pagesToScan.shift();

      if (!currentUrl) {
        break;
      }

      const normalizedCurrent =
        normalizeUrl(currentUrl);

      if (scannedUrls.has(normalizedCurrent)) {
        continue;
      }

      scannedUrls.add(normalizedCurrent);

      const pageIssues: Issue[] = [];
      let scanPage: Page | null = null;

      try {
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];

        scanPage = await browser.newPage({
          viewport: {
            width: 1280,
            height: 720,
          },
        });

        scanPage.on(
          "console",
          (message) => {
            if (message.type() === "error") {
              consoleErrors.push(
                message.text()
              );
            }
          }
        );

        scanPage.on(
          "requestfailed",
          (request) => {
            failedRequests.push(
              `${request.method()} ${request.url()}`
            );
          }
        );

        const response = await scanPage.goto(
          normalizedCurrent,
          {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          }
        );

        const status =
          response?.status() ?? null;

        /*
         * HTTP STATUS
         */

        if (
          status !== null &&
          status >= 400
        ) {
          pageIssues.push({
            title: "Page returns an error",
            severity: "high",
            description: `This page returned HTTP status ${status}.`,
            location: normalizedCurrent,
            page: normalizedCurrent,
          });
        }

        /*
         * HTTPS
         */

        if (
          normalizedCurrent.startsWith(
            "http://"
          )
        ) {
          pageIssues.push({
            title: "Website is not using HTTPS",
            severity: "high",
            description:
              "The page is being accessed over HTTP instead of HTTPS.",
            location: normalizedCurrent,
            page: normalizedCurrent,
          });
        }

        /*
         * TITLE
         */

        const title =
          await scanPage.title();

        if (!title.trim()) {
          pageIssues.push({
            title: "Missing page title",
            severity: "medium",
            description:
              "This page does not have a title element.",
            page: normalizedCurrent,
          });
        }

        /*
         * META DESCRIPTION
         */

        const metaDescription =
          await scanPage.locator(
            'meta[name="description"]'
          ).count();

        if (metaDescription === 0) {
          pageIssues.push({
            title: "Missing meta description",
            severity: "low",
            description:
              "This page does not contain a meta description.",
            page: normalizedCurrent,
          });
        }

        /*
         * MOBILE VIEWPORT
         */

        const viewportMeta =
          await scanPage.locator(
            'meta[name="viewport"]'
          ).count();

        if (viewportMeta === 0) {
          pageIssues.push({
            title: "Missing mobile viewport",
            severity: "medium",
            description:
              "The page does not define a mobile viewport.",
            page: normalizedCurrent,
          });
        }

        /*
         * IMAGES
         */

        const images =
          await scanPage.locator("img").all();

        for (const image of images) {
          const src =
            await image.getAttribute("src");

          const alt =
            await image.getAttribute("alt");

          if (
            alt === null ||
            alt.trim() === ""
          ) {
            pageIssues.push({
              title: "Image missing alt text",
              severity: "low",
              description:
                "An image does not have accessible alt text.",
              location: src || "Unknown image",
              page: normalizedCurrent,
            });
          }
        }

        /*
         * HORIZONTAL OVERFLOW
         */

        const hasOverflow =
          await scanPage.evaluate(() => {
            return (
              document.documentElement
                .scrollWidth >
              window.innerWidth
            );
          });

        if (hasOverflow) {
          pageIssues.push({
            title: "Horizontal mobile overflow",
            severity: "medium",
            description:
              "Page content is wider than the viewport and may scroll horizontally.",
            page: normalizedCurrent,
          });
        }

        /*
         * BUTTONS
         */

        const buttons =
          await scanPage
            .locator("button")
            .count();

        if (buttons === 0) {
          // Not automatically an issue.
        }

        /*
         * LINKS
         */

        const links =
          await scanPage
            .locator("a[href]")
            .evaluateAll(
              (elements) =>
                elements.map(
                  (element) =>
                    (
                      element as HTMLAnchorElement
                    ).href
                )
            );

        for (const link of links) {
          try {
            const normalizedLink =
              normalizeUrl(link);

            if (
              normalizedLink.startsWith(
                "http://"
              ) ||
              normalizedLink.startsWith(
                "https://"
              )
            ) {
              if (
                !discoveredLinks.has(
                  normalizedLink
                )
              ) {
                discoveredLinks.set(
                  normalizedLink,
                  normalizedCurrent
                );
              }

              /*
               * Add internal pages to crawl queue.
               */

              if (
                isInternalUrl(
                  normalizedLink,
                  baseUrl
                ) &&
                !scannedUrls.has(
                  normalizedLink
                ) &&
                !pagesToScan.includes(
                  normalizedLink
                )
              ) {
                pagesToScan.push(
                  normalizedLink
                );
              }
            }
          } catch {
            // Ignore malformed links.
          }
        }

        /*
         * CONSOLE ERRORS
         */

        for (const error of consoleErrors) {
          pageIssues.push({
            title: "JavaScript console error",
            severity: "medium",
            description:
              "A JavaScript error was detected in the browser console.",
            location: error,
            page: normalizedCurrent,
          });
        }

        /*
         * FAILED REQUESTS
         */

        for (const request of failedRequests) {
          pageIssues.push({
            title: "Failed network request",
            severity: "medium",
            description:
              "A browser network request failed while loading the page.",
            location: request,
            page: normalizedCurrent,
          });
        }

        pageResults.push({
          url: normalizedCurrent,
          status,
          title,
          issues: pageIssues,
        });

        globalIssues.push(
          ...pageIssues
        );

      } catch (error) {
        pageResults.push({
          url: normalizedCurrent,
          status: null,
          title: "",
          issues: [
            {
              title: "Page could not be scanned",
              severity: "high",
              description:
                error instanceof Error
                  ? error.message
                  : "Unknown scanning error.",
              page: normalizedCurrent,
            },
          ],
        });
      } finally {
        if (scanPage) {
          await scanPage.close().catch(() => undefined);
        }
      }
    }

    /*
     * --------------------------------------------------
     * CHECK LINKS
     * --------------------------------------------------
     */

    const linkResults: LinkResult[] = [];

    const linksToCheck = Array.from(
      discoveredLinks.entries()
    ).slice(0, 20);

    for (const [
      link,
      sourcePage,
    ] of linksToCheck) {
      const result = await checkLink(
        browser,
        link,
        sourcePage
      );

      linkResults.push(result);

      if (result.result === "broken") {
        globalIssues.push({
          title: "Broken link",
          severity: "high",
          description: `This link returned HTTP status ${result.status}.`,
          location: result.url,
          page: result.sourcePage,
        });
      }

      if (
        result.result ===
        "unreachable"
      ) {
        globalIssues.push({
          title: "Unreachable link",
          severity: "high",
          description:
            "TinyQA could not reach this link.",
          location: result.url,
          page: result.sourcePage,
        });
      }

      if (
        result.result ===
        "redirect"
      ) {
        globalIssues.push({
          title: "Link redirects",
          severity: "low",
          description: `This link redirects to ${result.finalUrl}.`,
          location: result.url,
          page: result.sourcePage,
        });
      }
    }

    /*
     * --------------------------------------------------
     * CALCULATE SCORE
     * --------------------------------------------------
     */

    const highIssues =
      globalIssues.filter(
        (issue) =>
          issue.severity === "high"
      ).length;

    const mediumIssues =
      globalIssues.filter(
        (issue) =>
          issue.severity === "medium"
      ).length;

    const lowIssues =
      globalIssues.filter(
        (issue) =>
          issue.severity === "low"
      ).length;

    let score = 100;

    score -= highIssues * 10;
    score -= mediumIssues * 5;
    score -= lowIssues * 2;

    score = Math.max(
      0,
      Math.min(100, score)
    );

    /*
     * --------------------------------------------------
     * STATISTICS
     * --------------------------------------------------
     */

    const brokenLinks =
      linkResults.filter(
        (link) =>
          link.result === "broken"
      ).length;

    const unreachableLinks =
      linkResults.filter(
        (link) =>
          link.result ===
          "unreachable"
      ).length;

    const redirects =
      linkResults.filter(
        (link) =>
          link.result ===
          "redirect"
      ).length;

    return {
      url: baseUrl,

      score,

      issues: globalIssues,

      pages: pageResults,

      links: linkResults,

      stats: {
        pagesScanned:
          pageResults.length,

        linksChecked:
          linkResults.length,

        brokenLinks,

        unreachableLinks,

        redirects,

        issuesFound:
          globalIssues.length,
      },
    };
  } catch (error) {
    console.error(
      "Scanner error:",
      error
    );

    throw new Error(
      error instanceof Error
        ? error.message
        : "Website scan failed."
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}