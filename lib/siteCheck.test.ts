import { describe, expect, it } from "vitest";
import {
  analyzePage,
  classifyLinkStatus,
  isPrivateAddress,
  normalizeUrl,
  SiteCheckError,
  type CheckResult,
} from "./siteCheck";

function analyze(html: string, options: { url?: string; headers?: Record<string, string>; ms?: number; bytes?: number } = {}) {
  return analyzePage({
    html,
    finalUrl: new URL(options.url ?? "https://example.com/"),
    headers: new Headers(options.headers ?? {}),
    responseTimeMs: options.ms ?? 100,
    htmlBytes: options.bytes ?? html.length,
  });
}

function check(html: string, id: string, options?: Parameters<typeof analyze>[1]): CheckResult {
  const result = analyze(html, options).checks.find((c) => c.id === id);
  if (!result) throw new Error(`check ${id} missing`);
  return result;
}

const GOOD_PAGE = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Acme Widgets | Handmade widgets</title>
<meta name="description" content="Acme makes handmade widgets in small batches, shipped worldwide with free returns.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.png"></head>
<body><h1>Handmade widgets</h1><img src="/w.png" alt="A widget">
<label for="email">Email</label><input id="email" type="email"></body></html>`;

const SECURE_HEADERS = {
  "strict-transport-security": "max-age=63072000",
  "content-security-policy": "default-src 'self'",
  "x-content-type-options": "nosniff",
};

describe("normalizeUrl", () => {
  it("adds https:// to bare domains and drops the hash", () => {
    expect(normalizeUrl("  example.com/a#b ").href).toBe("https://example.com/a");
  });
  it("keeps an explicit http:// scheme", () => {
    expect(normalizeUrl("http://example.com").protocol).toBe("http:");
  });
  it.each([
    ["", "Enter a website address"],
    ["ftp://example.com", "Only http"],
    ["https://user:pw@example.com", "credentials"],
    ["localhost:3000", "full domain"],
    ["http://exa mple.com", "valid website address"],
  ])("rejects %j", (input, message) => {
    expect(() => normalizeUrl(input)).toThrow(SiteCheckError);
    expect(() => normalizeUrl(input)).toThrow(message);
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("classifyLinkStatus", () => {
  it.each([
    [200, "ok"],
    [204, "ok"],
    [301, "ok"],
    [404, "broken"],
    [410, "broken"],
    [500, "broken"],
    [403, "blocked"],
    [429, "blocked"],
    [999, "blocked"],
  ])("%i is %s", (status, kind) => expect(classifyLinkStatus(status)).toBe(kind));
});

describe("analyzePage", () => {
  it("passes every check on a well-built page", () => {
    const { checks } = analyze(GOOD_PAGE, { headers: SECURE_HEADERS });
    expect(checks.filter((c) => c.status !== "pass")).toEqual([]);
  });

  it("https: fails over plain HTTP and skips the mixed-content check", () => {
    const { checks } = analyze(GOOD_PAGE, { url: "http://example.com/" });
    expect(checks.find((c) => c.id === "https")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "mixed")).toBeUndefined();
  });

  it.each([
    [300, "pass"],
    [800, "pass"],
    [801, "warn"],
    [2500, "warn"],
    [2501, "fail"],
  ])("speed: %i ms is %s", (ms, status) => {
    expect(check(GOOD_PAGE, "speed", { ms }).status).toBe(status);
  });

  it.each([
    [100 * 1024, "pass"],
    [600 * 1024, "warn"],
    [2 * 1024 * 1024, "fail"],
  ])("size: %i bytes is %s", (bytes, status) => {
    expect(check(GOOD_PAGE, "size", { bytes }).status).toBe(status);
  });

  describe("title", () => {
    it("fails when missing", () => expect(check("<html><body></body></html>", "title").status).toBe("fail"));
    it("warns when too short", () => expect(check("<title>Hi</title>", "title").status).toBe("warn"));
    it("warns when too long", () => expect(check(`<title>${"a".repeat(71)}</title>`, "title").status).toBe("warn"));
    it("collapses whitespace", () =>
      expect(check("<title>\n  Acme   Widgets\n  Shop </title>", "title").detail).toBe('"Acme Widgets Shop"'));
    it("ignores <title> inside inline SVG", () =>
      expect(check("<body><svg><title>Icon</title></svg></body>", "title").status).toBe("fail"));
  });

  describe("meta description", () => {
    it("warns when missing", () => expect(check("<title>x</title>", "description").status).toBe("warn"));
    it("warns when too short", () =>
      expect(check('<meta name="description" content="Short.">', "description").status).toBe("warn"));
    it("matches the name case-insensitively", () =>
      expect(check(`<meta name="Description" content="${"a".repeat(80)}">`, "description").status).toBe("pass"));
  });

  describe("viewport", () => {
    it("fails when missing", () => expect(check("<title>x</title>", "viewport").status).toBe("fail"));
    it("fails for a fixed width", () =>
      expect(check('<meta name="viewport" content="width=1024">', "viewport").status).toBe("fail"));
    it("passes with width=device-width", () =>
      expect(check('<meta name="viewport" content="initial-scale=1,width = device-width">', "viewport").status).toBe("pass"));
  });

  describe("lang", () => {
    it("warns when missing", () => expect(check("<html><body></body></html>", "lang").status).toBe("warn"));
    it("warns when empty", () => expect(check('<html lang=" "><body></body></html>', "lang").status).toBe("warn"));
    it("passes when set", () => expect(check('<html lang="fr-CA"></html>', "lang").detail).toContain("fr-CA"));
  });

  describe("main heading", () => {
    it("warns with no h1", () => expect(check("<p>x</p>", "h1").status).toBe("warn"));
    it("warns with several h1s", () => expect(check("<h1>a</h1><h1>b</h1>", "h1").detail).toContain("2 <h1>"));
    it("uses the logo alt text when the h1 is an image", () =>
      expect(check('<h1><img src="l.png" alt="Acme"></h1>', "h1").detail).toBe('"Acme"'));
  });

  describe("image descriptions", () => {
    it("passes with no images", () => expect(check("<p>x</p>", "alt").status).toBe("pass"));
    it("treats alt=\"\" as a valid (decorative) description", () =>
      expect(check('<img src="a.png" alt="">', "alt").status).toBe("pass"));
    it("ignores images hidden from assistive tech", () =>
      expect(check('<img src="a.png" aria-hidden="true"><img src="b.png" role="presentation">', "alt").status).toBe("pass"));
    it("accepts aria-label", () => expect(check('<img src="a.png" aria-label="Logo">', "alt").status).toBe("pass"));
    it("warns when a few images lack alt", () => {
      const html = '<img src="a" alt="a"><img src="b" alt="b"><img src="c" alt="c"><img src="d" alt="d"><img src="e">';
      const result = check(html, "alt");
      expect(result.status).toBe("warn");
      expect(result.detail).toBe("1 of 5 images has no alt attribute.");
    });
    it("fails when many images lack alt", () => expect(check('<img src="a"><img src="b" alt="b">', "alt").status).toBe("fail"));
  });

  describe("form field labels", () => {
    it("accepts label[for], wrapping labels, aria-label and aria-labelledby", () => {
      const html = `<label for="a">A</label><input id="a"><label>B <input></label>
        <input aria-label="C"><span id="d">D</span><select aria-labelledby="d"></select>`;
      expect(check(html, "labels").status).toBe("pass");
    });
    it("ignores hidden inputs and buttons", () =>
      expect(check('<input type="hidden"><input type="submit"><input hidden>', "labels").status).toBe("pass"));
    it("flags placeholder-only fields", () => {
      const result = check('<input placeholder="Search"><textarea></textarea>', "labels");
      expect(result.status).toBe("warn");
      expect(result.detail).toContain("2 form fields have");
    });
  });

  describe("favicon", () => {
    it("detects rel=icon, rel=\"shortcut icon\" and apple-touch-icon", () => {
      for (const rel of ["icon", "shortcut icon", "SHORTCUT ICON", "apple-touch-icon"]) {
        expect(analyze(`<link rel="${rel}" href="/i.png">`).declaresIcon).toBe(true);
      }
    });
    it("does not count unrelated link tags", () => {
      expect(analyze('<link rel="stylesheet" href="/s.css"><link rel="iconography" href="/x">').declaresIcon).toBe(false);
    });
  });

  describe("mixed content", () => {
    it("flags http:// scripts, images, srcset entries and stylesheets", () => {
      const html = `<script src="http://cdn.example/a.js"></script><img src="HTTP://x/a.png">
        <img src="/ok.png" srcset="/ok.png 1x, http://x/b.png 2x"><link rel="stylesheet" href="http://x/s.css">`;
      expect(check(html, "mixed").detail).toContain("4 resources are loaded over HTTP");
    });
    it("ignores links to http pages and relative or https resources", () => {
      const html = '<a href="http://other.example">x</a><img src="/a.png"><script src="https://cdn/a.js"></script><link rel="canonical" href="http://x">';
      expect(check(html, "mixed").status).toBe("pass");
    });
  });

  describe("security headers", () => {
    it("lists the missing headers", () => {
      expect(check(GOOD_PAGE, "headers").detail).toBe(
        "Missing: Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options.",
      );
    });
    it("does not require HSTS over plain HTTP", () => {
      expect(check(GOOD_PAGE, "headers", { url: "http://example.com/" }).detail).not.toContain("Strict-Transport");
    });
    it("accepts a CSP set with <meta http-equiv>", () => {
      const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`;
      const headers = { "strict-transport-security": "max-age=1", "x-content-type-options": "nosniff" };
      expect(check(html, "headers", { headers }).status).toBe("pass");
    });
  });

  describe("link extraction", () => {
    it("resolves, de-duplicates and filters links, own site first", () => {
      const html = `<a href="https://other.example/x">o</a><a href="/about">a</a><a href="/about#team">a2</a>
        <a href="#top">t</a><a href="mailto:a@b.c">m</a><a href="javascript:void(0)">j</a><a href="tel:123">p</a>
        <a href="/">self</a><a href="https://example.com/#x">self2</a><a href="contact">c</a><a href="">e</a>`;
      const links = analyze(html, { url: "https://example.com/" }).links.map((l) => l.href);
      expect(links).toEqual(["https://example.com/about", "https://example.com/contact", "https://other.example/x"]);
    });
    it("honours <base href>", () => {
      const html = '<base href="https://cdn.example.com/docs/"><a href="page">p</a>';
      expect(analyze(html).links.map((l) => l.href)).toEqual(["https://cdn.example.com/docs/page"]);
    });
  });
});
