import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";
import { scanWebsite } from "@/lib/scanner";
import { runAutomatedQATests } from "@/lib/qa-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const url = body.url;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          error: "A valid URL is required.",
        },
        {
          status: 400,
        }
      );
    }

    let formattedUrl = url.trim();

    if (
      !formattedUrl.startsWith("http://") &&
      !formattedUrl.startsWith("https://")
    ) {
      formattedUrl = `https://${formattedUrl}`;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(formattedUrl);
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid URL. Please enter something like https://example.com",
        },
        {
          status: 400,
        }
      );
    }

    if (
      parsedUrl.protocol !== "http:" &&
      parsedUrl.protocol !== "https:"
    ) {
      return NextResponse.json(
        {
          error:
            "Only HTTP and HTTPS websites are supported.",
        },
        {
          status: 400,
        }
      );
    }

    if (!parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
      return NextResponse.json(
        { error: "Please provide a public website URL without credentials." },
        { status: 400 }
      );
    }

    if (await pointsToPrivateNetwork(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "Private, local, and internal network addresses cannot be scanned." },
        { status: 400 }
      );
    }

    const scanResult =
      await scanWebsite(formattedUrl);

    const qaResult =
      await runAutomatedQATests(
        formattedUrl
      );

    return NextResponse.json({
      ...scanResult,

      qa: {
        tests: qaResult.tests,
        summary: qaResult.summary,
        pages: qaResult.pages,
      },
    });
  } catch (error) {
    console.error(
      "OtherLab scan error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to scan website.",
      },
      {
        status: 500,
      }
    );
  }
}

async function pointsToPrivateNetwork(hostname: string) {
  const addresses = net.isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true }).catch(() => []))
        .map((entry) => entry.address);

  return addresses.some((address) => {
    if (net.isIPv4(address)) {
      const [first, second] = address.split(".").map(Number);
      return (
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        first === 127 ||
        (first === 169 && second === 254)
      );
    }

    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  });
}