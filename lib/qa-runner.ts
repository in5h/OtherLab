import { Browser, Page, ConsoleMessage, Request, Response } from "playwright";
import { launchBrowser } from "@/lib/browser";
import {
  QATest,
  QA_CHECKLIST,
  summarizeTests,
} from "@/lib/qa-engine";

const MAX_PAGES = 6;
const MAX_LINKS_PER_PAGE = 30;

type TestExecution = QATest & {
  page?: string;
};

type PageScan = {
  url: string;
  title: string;
  status: number | null;
  loadTime: number;
  passed: string[];
  warnings: string[];
  failed: string[];
};

function createTests(): TestExecution[] {
  return QA_CHECKLIST.map((test) => ({
    ...test,
    status: "skipped",
    actual: "This check was not run by the public scanner.",
  }));
}

function addExecution(
  executions: TestExecution[],
  testId: string,
  page: string,
  status: QATest["status"],
  actual: string,
  location?: string
) {
  const baseTest = QA_CHECKLIST.find(
    (test) => test.id === testId
  );

  if (!baseTest) {
    return;
  }

  executions.push({
    ...baseTest,
    status,
    actual,
    location: location || page,
    page,
  });
}

function isInternalUrl(
  baseUrl: string,
  targetUrl: string
) {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);

    return (
      target.protocol === base.protocol &&
      target.hostname === base.hostname
    );
  } catch {
    return false;
  }
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);

    parsed.hash = "";

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(
        /\/+$/,
        ""
      );
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/* -------------------------------------------------------
   PAGE DISCOVERY
------------------------------------------------------- */

async function discoverPages(
  page: Page,
  startUrl: string
) {
  const discovered = new Set<string>();

  discovered.add(
    normalizeUrl(startUrl)
  );

  try {
    const links = await page
      .locator("a[href]")
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const href =
              element.getAttribute("href");

            if (!href) {
              return null;
            }

            try {
              return new URL(
                href,
                window.location.href
              ).toString();
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[]
      );

    for (const link of links) {
      const normalized =
        normalizeUrl(link);

      if (
        isInternalUrl(
          startUrl,
          normalized
        ) &&
        !normalized.startsWith("mailto:") &&
        !normalized.startsWith("tel:")
      ) {
        discovered.add(normalized);
      }
    }
  } catch {
    // Discovery failure should not stop the scan.
  }

  return Array.from(discovered).slice(
    0,
    MAX_PAGES
  );
}

/* -------------------------------------------------------
   HTTPS
------------------------------------------------------- */

async function testHTTPS(
  executions: TestExecution[],
  url: string
) {
  if (url.startsWith("https://")) {
    addExecution(
      executions,
      "SEC-001",
      url,
      "passed",
      "The website uses HTTPS."
    );
  } else {
    addExecution(
      executions,
      "SEC-001",
      url,
      "failed",
      "The website uses HTTP instead of HTTPS."
    );
  }
}

/* -------------------------------------------------------
   PAGE LOAD
------------------------------------------------------- */

async function loadPage(
  page: Page,
  executions: TestExecution[],
  url: string,
  pageResults: PageScan[]
) {
  const start = Date.now();

  try {
    const response =
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

    const loadTime =
      Date.now() - start;

    const status =
      response?.status() ?? null;

    const title =
      await page.title();

    const pageResult: PageScan = {
      url,
      title,
      status,
      loadTime,
      passed: [],
      warnings: [],
      failed: [],
    };

    pageResults.push(pageResult);

    if (
      response &&
      status &&
      status >= 200 &&
      status < 400
    ) {
      pageResult.passed.push(
        `Page loaded successfully with HTTP ${status}.`
      );

      addExecution(
        executions,
        "DASH-001",
        url,
        "passed",
        `Page loaded successfully with HTTP status ${status}.`
      );
    } else {
      pageResult.failed.push(
        `Page returned HTTP ${status ?? "unknown"}.`
      );

      addExecution(
        executions,
        "DASH-001",
        url,
        "failed",
        `Page returned HTTP status ${status ?? "unknown"}.`
      );
    }

    if (loadTime <= 3000) {
      addExecution(
        executions,
        "PERF-001",
        url,
        "passed",
        `Page started loading in ${loadTime}ms.`
      );
    } else if (loadTime <= 5000) {
      addExecution(
        executions,
        "PERF-001",
        url,
        "warning",
        `Page took ${loadTime}ms to start loading.`
      );

      pageResult.warnings.push(
        `Slow initial load: ${loadTime}ms`
      );
    } else {
      addExecution(
        executions,
        "PERF-001",
        url,
        "failed",
        `Page took ${loadTime}ms to start loading.`
      );

      pageResult.failed.push(
        `Slow page load: ${loadTime}ms`
      );
    }

    return true;
  } catch {
    pageResults.push({
      url,
      title: "",
      status: null,
      loadTime: Date.now() - start,
      passed: [],
      warnings: [],
      failed: [
        "Page could not be loaded.",
      ],
    });

    addExecution(
      executions,
      "DASH-001",
      url,
      "failed",
      "TinyQA could not load this page."
    );

    return false;
  }
}

/* -------------------------------------------------------
   PAGE TITLE
------------------------------------------------------- */

async function testTitle(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const title =
    await page.title();

  if (title.trim()) {
    addExecution(
      executions,
      "UI-007",
      url,
      "passed",
      `The page has a title: "${title}".`
    );
  } else {
    addExecution(
      executions,
      "UI-007",
      url,
      "warning",
      "The page does not have a title."
    );
  }
}

/* -------------------------------------------------------
   META DESCRIPTION
------------------------------------------------------- */

async function testMetaDescription(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const description =
    await page
      .locator(
        'meta[name="description"]'
      )
      .getAttribute("content")
      .catch(() => null);

  if (description?.trim()) {
    addExecution(
      executions,
      "UI-008",
      url,
      "passed",
      "The page has a meta description."
    );
  } else {
    addExecution(
      executions,
      "UI-008",
      url,
      "warning",
      "The page does not have a meta description."
    );
  }
}

/* -------------------------------------------------------
   RESPONSIVE
------------------------------------------------------- */

async function testResponsive(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const viewports = [
    {
      id: "UI-001",
      name: "Desktop",
      width: 1440,
      height: 900,
    },
    {
      id: "UI-002",
      name: "Tablet",
      width: 768,
      height: 1024,
    },
    {
      id: "UI-003",
      name: "Mobile",
      width: 390,
      height: 844,
    },
  ];

  for (const viewport of viewports) {
    try {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const result =
        await page.evaluate(() => ({
          documentWidth:
            document.documentElement
              .scrollWidth,

          viewportWidth:
            window.innerWidth,
        }));

      if (
        result.documentWidth >
        result.viewportWidth + 5
      ) {
        addExecution(
          executions,
          viewport.id,
          url,
          "failed",
          `${viewport.name} layout is wider than the screen.`
        );
      } else {
        addExecution(
          executions,
          viewport.id,
          url,
          "passed",
          `${viewport.name} layout fits within the screen.`
        );
      }
    } catch {
      addExecution(
        executions,
        viewport.id,
        url,
        "warning",
        `TinyQA could not fully test the ${viewport.name} layout.`
      );
    }
  }
}

/* -------------------------------------------------------
   OVERFLOW
------------------------------------------------------- */

async function testOverflow(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const result =
    await page.evaluate(() => ({
      documentWidth:
        document.documentElement
          .scrollWidth,

      viewportWidth:
        window.innerWidth,
    }));

  if (
    result.documentWidth >
    result.viewportWidth + 5
  ) {
    addExecution(
      executions,
      "UI-004",
      url,
      "failed",
      "The page is wider than the screen and may require sideways scrolling."
    );
  } else {
    addExecution(
      executions,
      "UI-004",
      url,
      "passed",
      "The page fits within the screen width."
    );
  }
}

/* -------------------------------------------------------
   IMAGES
------------------------------------------------------- */

async function testImages(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const result =
    await page.evaluate(() => {
      const images =
        Array.from(
          document.images
        );

      return {
        total: images.length,

        broken: images.filter(
          (image) =>
            !image.complete ||
            image.naturalWidth === 0
        ).length,

        missingAlt:
          images.filter(
            (image) =>
              !image.hasAttribute(
                "alt"
              )
          ).length,
      };
    });

  if (result.broken > 0) {
    addExecution(
      executions,
      "UI-010",
      url,
      "failed",
      `${result.broken} image(s) appear to be broken.`
    );
  } else {
    addExecution(
      executions,
      "UI-010",
      url,
      "passed",
      `All ${result.total} detected image(s) loaded correctly.`
    );
  }

  if (result.missingAlt > 0) {
    addExecution(
      executions,
      "UI-011",
      url,
      "warning",
      `${result.missingAlt} image(s) do not have alt text.`
    );
  } else {
    addExecution(
      executions,
      "UI-011",
      url,
      "passed",
      "All detected images have alt text."
    );
  }
}

/* -------------------------------------------------------
   BUTTONS
------------------------------------------------------- */

async function testButtons(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const result =
    await page.evaluate(() => {
      const buttons =
        Array.from(
          document.querySelectorAll(
            "button, [role='button']"
          )
        );

      return {
        total: buttons.length,

        disabled:
          buttons.filter(
            (button) =>
              (button as HTMLButtonElement)
                .disabled ||
              button.getAttribute(
                "aria-disabled"
              ) === "true"
          ).length,

        empty:
          buttons.filter(
            (button) =>
              !button.textContent?.trim() &&
              !button.getAttribute(
                "aria-label"
              )
          ).length,
      };
    });

  if (result.total === 0) {
    addExecution(
      executions,
      "UI-006",
      url,
      "warning",
      "No buttons were detected on this page."
    );

    return;
  }

  if (result.empty > 0) {
    addExecution(
      executions,
      "UI-006",
      url,
      "warning",
      `${result.empty} button(s) do not have visible text or an aria-label.`
    );
  } else {
    addExecution(
      executions,
      "UI-006",
      url,
      "passed",
      `${result.total} button(s) were found and have usable labels.`
    );
  }
}

/* -------------------------------------------------------
   FORMS
------------------------------------------------------- */

async function testForms(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const result =
    await page.evaluate(() => {
      const forms =
        Array.from(
          document.forms
        );

      const inputs =
        Array.from(
          document.querySelectorAll(
            "input, textarea, select"
          )
        );

      const unlabeled =
        inputs.filter(
          (input) => {
            const id =
              input.getAttribute(
                "id"
              );

            const aria =
              input.getAttribute(
                "aria-label"
              );

            const labelled =
              id &&
              document.querySelector(
                `label[for="${id}"]`
              );

            return (
              !aria &&
              !labelled
            );
          }
        ).length;

      return {
        forms: forms.length,
        fields: inputs.length,
        unlabeled,
      };
    });

  if (result.forms === 0) {
    addExecution(
      executions,
      "APP-001",
      url,
      "skipped",
      "No forms were found on this page."
    );

    return;
  }

  addExecution(
    executions,
    "APP-001",
    url,
    "passed",
    `${result.forms} form(s) with ${result.fields} field(s) were found.`
  );

  if (result.unlabeled > 0) {
    addExecution(
      executions,
      "UI-005",
      url,
      "warning",
      `${result.unlabeled} form field(s) may not have an accessible label.`
    );
  } else {
    addExecution(
      executions,
      "UI-005",
      url,
      "passed",
      "Detected form fields have labels or aria-labels."
    );
  }
}

/* -------------------------------------------------------
   LINKS
------------------------------------------------------- */

async function testLinks(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const links =
    await page.locator(
      "a[href]"
    ).count();

  if (links > 0) {
    addExecution(
      executions,
      "DASH-003",
      url,
      "passed",
      `${links} link(s) were found on this page.`
    );
  } else {
    addExecution(
      executions,
      "DASH-003",
      url,
      "warning",
      "No links were detected on this page."
    );
  }
}

/* -------------------------------------------------------
   LINK CHECKING
------------------------------------------------------- */

async function testBrokenLinks(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const hrefs =
    await page
      .locator("a[href]")
      .evaluateAll(
        (elements) =>
          elements
            .map(
              (element) =>
                element.getAttribute(
                  "href"
                )
            )
            .filter(
              (href): href is string =>
                Boolean(href)
            )
      );

  const uniqueLinks =
    Array.from(
      new Set(hrefs)
    ).slice(
      0,
      MAX_LINKS_PER_PAGE
    );

  let broken = 0;

  for (const href of uniqueLinks) {
    if (
      href.startsWith(
        "javascript:"
      ) ||
      href.startsWith(
        "mailto:"
      ) ||
      href.startsWith("tel:") ||
      href.startsWith("#")
    ) {
      continue;
    }

    try {
      const absolute =
        new URL(
          href,
          url
        ).toString();

      const response =
        await page.request.get(
          absolute,
          {
            timeout: 10000,
            failOnStatusCode: false,
          }
        );

      if (
        response.status() >= 400
      ) {
        broken++;
      }
    } catch {
      broken++;
    }
  }

  if (broken === 0) {
    addExecution(
      executions,
      "UI-012",
      url,
      "passed",
      `No broken links were detected among ${uniqueLinks.length} checked links.`
    );
  } else {
    addExecution(
      executions,
      "UI-012",
      url,
      "failed",
      `${broken} broken or unreachable link(s) were detected.`
    );
  }
}

/* -------------------------------------------------------
   SENSITIVE URL
------------------------------------------------------- */

async function testSensitiveUrl(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const currentUrl =
    page.url();

  const patterns = [
    "password=",
    "passwd=",
    "token=",
    "access_token=",
    "secret=",
    "api_key=",
    "apikey=",
    "card_number=",
    "cvv=",
  ];

  const found =
    patterns.find(
      (pattern) =>
        currentUrl
          .toLowerCase()
          .includes(pattern)
    );

  if (found) {
    addExecution(
      executions,
      "SEC-012",
      url,
      "failed",
      `The URL appears to contain sensitive information such as "${found}".`,
      currentUrl
    );
  } else {
    addExecution(
      executions,
      "SEC-012",
      url,
      "passed",
      "No obvious sensitive credentials or payment information were found in the URL."
    );
  }
}

/* -------------------------------------------------------
   SECURITY HEADERS
------------------------------------------------------- */

async function testSecurityHeaders(
  response: Response | null,
  executions: TestExecution[],
  url: string
) {
  if (!response) {
    return;
  }

  const headers =
    response.headers();

  const securityHeaders = [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
  ];

  const missing =
    securityHeaders.filter(
      (header) =>
        !headers[header]
    );

  if (missing.length === 0) {
    addExecution(
      executions,
      "SEC-002",
      url,
      "passed",
      "Common security headers were detected."
    );
  } else {
    addExecution(
      executions,
      "SEC-002",
      url,
      "warning",
      `Some common security headers are missing: ${missing.join(", ")}`
    );
  }
}

/* -------------------------------------------------------
   CONSOLE ERRORS
------------------------------------------------------- */

async function testConsoleErrors(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const errors: string[] = [];

  const listener = (
    message: ConsoleMessage
  ) => {
    if (
      message.type() === "error"
    ) {
      errors.push(
        message.text()
      );
    }
  };

  page.on(
    "console",
    listener
  );

  try {
    await page.waitForTimeout(
      1500
    );

    if (errors.length === 0) {
      addExecution(
        executions,
        "PERF-006",
        url,
        "passed",
        "No JavaScript console errors were detected."
      );
    } else {
      addExecution(
        executions,
        "PERF-006",
        url,
        "warning",
        `${errors.length} JavaScript console error(s) were detected.`,
        errors
          .slice(0, 5)
          .join(" | ")
      );
    }
  } finally {
    page.off(
      "console",
      listener
    );
  }
}

/* -------------------------------------------------------
   NETWORK FAILURES
------------------------------------------------------- */

async function testNetworkFailures(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const failures: string[] = [];

  const listener = (request: Request) => {
    const failure =
      request.failure();

    if (failure) {
      failures.push(
        `${request.url()} - ${failure.errorText}`
      );
    }
  };

  page.on(
    "requestfailed",
    listener
  );

  try {
    await page.waitForTimeout(
      1500
    );

    if (failures.length === 0) {
      addExecution(
        executions,
        "PERF-007",
        url,
        "passed",
        "No failed network requests were detected during the test window."
      );
    } else {
      addExecution(
        executions,
        "PERF-007",
        url,
        "warning",
        `${failures.length} network request(s) failed.`,
        failures
          .slice(0, 10)
          .join(" | ")
      );
    }
  } finally {
    page.off(
      "requestfailed",
      listener
    );
  }
}

/* -------------------------------------------------------
   NAVIGATION
------------------------------------------------------- */

async function testNavigation(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const links =
    await page
      .locator(
        "a[href]"
      )
      .evaluateAll(
        (elements) =>
          elements
            .map(
              (element) => ({
                href:
                  element.getAttribute(
                    "href"
                  ),
                text:
                  element.textContent
                    ?.trim() || "",
              })
            )
            .filter(
              (item) =>
                item.href &&
                item.text
            )
            .slice(0, 10)
      );

  if (links.length === 0) {
    addExecution(
      executions,
      "DASH-003",
      url,
      "warning",
      "No usable navigation links were detected."
    );

    return;
  }

  addExecution(
    executions,
    "DASH-003",
    url,
    "passed",
    `${links.length} usable navigation link(s) were detected.`
  );
}

/* -------------------------------------------------------
   ACCESSIBILITY BASICS
------------------------------------------------------- */

async function testAccessibilityBasics(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const result =
    await page.evaluate(() => {
      const images =
        Array.from(
          document.images
        );

      const buttons =
        Array.from(
          document.querySelectorAll(
            "button"
          )
        );

      const inputs =
        Array.from(
          document.querySelectorAll(
            "input, textarea, select"
          )
        );

      const unnamedButtons =
        buttons.filter(
          (button) =>
            !button.textContent?.trim() &&
            !button.getAttribute(
              "aria-label"
            )
        ).length;

      const unnamedInputs =
        inputs.filter(
          (input) =>
            !input.getAttribute(
              "aria-label"
            ) &&
            !input.getAttribute(
              "id"
            )
        ).length;

      const missingAlt =
        images.filter(
          (image) =>
            !image.hasAttribute(
              "alt"
            )
        ).length;

      return {
        unnamedButtons,
        unnamedInputs,
        missingAlt,
      };
    });

  const problems =
    result.unnamedButtons +
    result.unnamedInputs +
    result.missingAlt;

  if (problems === 0) {
    addExecution(
      executions,
      "UI-005",
      url,
      "passed",
      "Basic accessibility checks passed."
    );
  } else {
    addExecution(
      executions,
      "UI-005",
      url,
      "warning",
      `${problems} potential accessibility issue(s) were detected.`
    );
  }
}

/* -------------------------------------------------------
   VIEWPORT META
------------------------------------------------------- */

async function testViewportMeta(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const viewport =
    await page
      .locator(
        'meta[name="viewport"]'
      )
      .count();

  if (viewport > 0) {
    addExecution(
      executions,
      "UI-003",
      url,
      "passed",
      "A responsive viewport meta tag was detected."
    );
  } else {
    addExecution(
      executions,
      "UI-003",
      url,
      "warning",
      "No viewport meta tag was detected."
    );
  }
}

/* -------------------------------------------------------
   LOCALHOST / DEBUG INFORMATION
------------------------------------------------------- */

async function testProductionLeaks(
  page: Page,
  executions: TestExecution[],
  url: string
) {
  const content =
    await page.content();

  const lower =
    content.toLowerCase();

  const leaks = [
    "localhost:",
    "127.0.0.1:",
    "console.log(",
    "debugger;",
  ];

  const found =
    leaks.filter(
      (item) =>
        lower.includes(item)
    );

  if (found.length === 0) {
    addExecution(
      executions,
      "SEC-013",
      url,
      "passed",
      "No obvious localhost or debug references were found in the rendered page."
    );
  } else {
    addExecution(
      executions,
      "SEC-013",
      url,
      "warning",
      `Potential development/debug references detected: ${found.join(", ")}`
    );
  }
}

/* -------------------------------------------------------
   RUNNER
------------------------------------------------------- */

export async function runAutomatedQATests(
  startUrl: string
) {
  const executions =
    createTests();

  const pageResults: PageScan[] =
    [];

  let browser:
    | Browser
    | null = null;

  try {
    /*
     * SITE LEVEL TESTS
     */

    await testHTTPS(
      executions,
      startUrl
    );

    /*
     * START BROWSER
     */

    browser =
      await launchBrowser();

    const page =
      await browser.newPage({
        viewport: {
          width: 1440,
          height: 900,
        },
      });

    /*
     * FIRST PAGE
     */

    const firstLoaded =
      await loadPage(
        page,
        executions,
        startUrl,
        pageResults
      );

    if (!firstLoaded) {
      const finalTests = finalizeTests(executions);

      return {
        tests: finalTests,
        summary: summarizeTests(finalTests),
        pages: pageResults,
      };
    }

    /*
     * DISCOVER INTERNAL PAGES
     */

    const pages =
      await discoverPages(
        page,
        startUrl
      );

    /*
     * TEST EVERY PAGE
     */

    for (const pageUrl of pages) {
      try {
        await page.setViewportSize({
          width: 1440,
          height: 900,
        });

        await page.goto(
          pageUrl,
          {
            waitUntil:
              "domcontentloaded",
            timeout: 15000,
          }
        );

        /*
         * BASIC PAGE TESTS
         */

        await testTitle(
          page,
          executions,
          pageUrl
        );

        await testMetaDescription(
          page,
          executions,
          pageUrl
        );

        await testViewportMeta(
          page,
          executions,
          pageUrl
        );

        await testButtons(
          page,
          executions,
          pageUrl
        );

        await testForms(
          page,
          executions,
          pageUrl
        );

        await testImages(
          page,
          executions,
          pageUrl
        );

        await testOverflow(
          page,
          executions,
          pageUrl
        );

        await testLinks(
          page,
          executions,
          pageUrl
        );

        await testNavigation(
          page,
          executions,
          pageUrl
        );

        /*
         * ACCESSIBILITY
         */

        await testAccessibilityBasics(
          page,
          executions,
          pageUrl
        );

        /*
         * LINKS
         */

        await testBrokenLinks(
          page,
          executions,
          pageUrl
        );

        /*
         * SECURITY
         */

        await testSensitiveUrl(
          page,
          executions,
          pageUrl
        );

        await testProductionLeaks(
          page,
          executions,
          pageUrl
        );

        /*
         * RESPONSIVE
         */

        await testResponsive(
          page,
          executions,
          pageUrl
        );

        /*
         * CONSOLE + NETWORK
         *
         * These run after the page has loaded.
         */

        await testConsoleErrors(
          page,
          executions,
          pageUrl
        );

        await testNetworkFailures(
          page,
          executions,
          pageUrl
        );

        /*
         * PERFORMANCE
         */

        const navigationResponse =
          await page
            .waitForLoadState(
              "load",
              {
                timeout: 10000,
              }
            )
            .then(
              () =>
                page
                  .locator(
                    "html"
                  )
                  .count()
            )
            .catch(
              () => 0
            );

        if (
          navigationResponse >= 0
        ) {
          // The actual load timing is measured
          // separately in loadPage.
        }
      } catch (error) {
        console.error(
          `Failed testing ${pageUrl}:`,
          error
        );

        addExecution(
          executions,
          "DASH-001",
          pageUrl,
          "failed",
          "TinyQA encountered an error while testing this page."
        );
      }
    }

    /*
     * SECURITY HEADERS
     */

    try {
      const response =
        await page.goto(
          startUrl,
          {
            waitUntil:
              "domcontentloaded",
            timeout: 30000,
          }
        );

      await testSecurityHeaders(
        response,
        executions,
        startUrl
      );
    } catch {
      // Ignore header test failure.
    }
  } catch (error) {
    console.error(
      "QA runner error:",
      error
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  /*
   * IMPORTANT:
   *
   * Keep tests that have not been executed
   * as skipped. Do not pretend they passed.
   */

  const finalTests = finalizeTests(executions);

  return {
    tests: finalTests,
    summary:
      summarizeTests(
        finalTests
      ),
    pages: pageResults,
  };
}

function finalizeTests(
  executions: TestExecution[]
): TestExecution[] {
  const priority: Record<QATest["status"], number> = {
    skipped: 0,
    passed: 1,
    warning: 2,
    failed: 3,
  };

  return QA_CHECKLIST.map((checklistTest) => {
    const matching = executions.filter(
      (test) => test.id === checklistTest.id
    );

    if (matching.length === 0) {
      return {
        ...checklistTest,
        status: "skipped",
        actual: "This check was not run by the public scanner.",
      };
    }

    const result = matching.reduce((best, current) =>
      priority[current.status] > priority[best.status]
        ? current
        : best
    );

    const actual = Array.from(
      new Set(
        matching
          .map((test) => test.actual)
          .filter((value): value is string => Boolean(value))
      )
    ).join(" ");

    return {
      ...result,
      actual: actual || result.actual,
    };
  });
}