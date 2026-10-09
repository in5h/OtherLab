import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLinks, checkSite } from "./siteCheck";

// A local server that imitates real-world server quirks. Private hosts are allowed only for these tests.
let server: http.Server;
let base: string;

const PAGE = (body: string, head = "") =>
  `<!doctype html><html lang="en"><head><title>Integration test page</title>${head}</head><body>${body}</body></html>`;

beforeAll(async () => {
  process.env.OTHERLAB_ALLOW_PRIVATE_HOSTS = "1";
  server = http.createServer((req, res) => {
    const html = (body: string, status = 200, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    switch (req.url) {
      case "/":
        res.writeHead(301, { location: "/home" });
        return res.end();
      case "/home":
        return html(
          PAGE(`<h1>Home</h1>
            <a href="/ok">ok</a><a href="/missing">missing</a><a href="/head-405">405</a>
            <a href="/head-404">head404</a><a href="/linkedin">li</a><a href="/redirect-to-ok">r</a>
            <a href="/server-error">500</a>`),
        );
      case "/ok":
        return html("ok");
      case "/redirect-to-ok":
        res.writeHead(302, { location: "/ok" });
        return res.end();
      case "/head-405":
        return req.method === "HEAD" ? html("", 405) : html("ok");
      case "/head-404":
        // Some servers/CDNs answer HEAD wrongly; a real GET works.
        return req.method === "HEAD" ? html("", 404) : html("ok");
      case "/linkedin":
        return html("", 999);
      case "/server-error":
        return html("oops", 500);
      case "/has-favicon-file":
        return html(PAGE("<h1>x</h1>"));
      case "/favicon.ico":
        res.writeHead(200, { "content-type": "image/x-icon" });
        return res.end("ico");
      case "/latin1": {
        res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
        return res.end(Buffer.from("<html><head><title>Caf\xe9 de la Gare, Paris</title></head></html>", "latin1"));
      }
      case "/json":
        res.writeHead(200, { "content-type": "application/json" });
        return res.end("{}");
      case "/gone":
        return html("not here", 404);
      case "/blocked":
        return html("denied", 403);
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        return res.end();
      default:
        return html("not found", 404);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  delete process.env.OTHERLAB_ALLOW_PRIVATE_HOSTS;
  server.close();
});

const find = (report: Awaited<ReturnType<typeof checkSite>>, id: string) => report.checks.find((c) => c.id === id)!;

describe("checkSite against a live server", () => {
  it("follows redirects and reports the final page", async () => {
    const report = await checkSite(`${base}/`);
    expect(report.finalUrl).toBe(`${base}/home`);
    expect(find(report, "status").detail).toContain("after 1 redirect");
    expect(report.summary.pass + report.summary.warn + report.summary.fail).toBe(report.checks.length);
  });

  it("classifies links like a visitor would", async () => {
    const links = find(await checkSite(`${base}/home`), "links");
    expect(links.status).toBe("fail");
    // Truly broken:
    expect(links.detail).toContain(`${base}/missing (404)`);
    expect(links.detail).toContain(`${base}/server-error (500)`);
    expect(links.detail).toContain("2 broken");
    // Not broken: HEAD quirks are retried with GET, redirects are followed, 999 is a bot block.
    expect(links.detail).not.toContain("head-405");
    expect(links.detail).not.toContain("head-404");
    expect(links.detail).not.toContain("redirect-to-ok");
    expect(links.detail).toContain("1 site blocks automated checks");
  });

  it("finds /favicon.ico when no icon is declared", async () => {
    const favicon = find(await checkSite(`${base}/has-favicon-file`), "favicon");
    expect(favicon.status).toBe("pass");
    expect(favicon.detail).toContain("/favicon.ico");
  });

  it("decodes pages using their declared charset", async () => {
    expect(find(await checkSite(`${base}/latin1`), "title").detail).toBe('"Café de la Gare, Paris"');
  });

  it("falls back to http:// when https is not available for an address typed without a scheme", async () => {
    const report = await checkSite(`${base.replace("http://", "")}/home`);
    expect(report.finalUrl).toBe(`${base}/home`);
    expect(find(report, "https").status).toBe("fail");
  });

  it.each([
    ["/json", "returns application/json, not a web page"],
    ["/gone", "does not exist (HTTP 404)"],
    ["/blocked", "block automated checks"],
    ["/loop", "redirected too many times"],
  ])("explains why %s cannot be checked", async (path, message) => {
    await expect(checkSite(`${base}${path}`)).rejects.toThrow(message);
  });

  it("reports unreachable internal pages as failures and external ones as warnings", async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    const deadLink = new URL(`http://127.0.0.1:${deadPort}/`);
    const asExternal = await checkLinks([deadLink], "example.com");
    expect(asExternal.status).toBe("warn");
    expect(asExternal.detail).toContain("could not be reached right now");

    const asInternal = await checkLinks([deadLink], deadLink.host);
    expect(asInternal.status).toBe("fail");
  });
});

describe("checkSite safety", () => {
  it("refuses private addresses unless explicitly allowed", async () => {
    delete process.env.OTHERLAB_ALLOW_PRIVATE_HOSTS;
    try {
      await expect(checkSite(`${base}/home`)).rejects.toThrow("Local and private addresses cannot be checked.");
      await expect(checkSite("http://[::ffff:127.0.0.1]/")).rejects.toThrow("Local and private");
      await expect(checkSite("http://169.254.169.254/latest/meta-data")).rejects.toThrow("Local and private");
    } finally {
      process.env.OTHERLAB_ALLOW_PRIVATE_HOSTS = "1";
    }
  });
});
