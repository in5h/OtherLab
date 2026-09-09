import serverlessChromium from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright";

export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    return chromium.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true,
    });
  }

  return chromium.launch({
    headless: true,
  });
}