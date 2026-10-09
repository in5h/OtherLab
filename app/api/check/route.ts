import { checkSite, SiteCheckError } from "@/lib/siteCheck";

export const maxDuration = 30;

export async function POST(request: Request) {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "Send a JSON body like { \"url\": \"https://example.com\" }." }, { status: 400 });
  }
  if (typeof url !== "string") {
    return Response.json({ error: "Enter a website address to check." }, { status: 400 });
  }

  try {
    const report = await checkSite(url);
    return Response.json(report);
  } catch (error) {
    if (error instanceof SiteCheckError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    console.error("Unexpected site check failure", error);
    return Response.json({ error: "Something went wrong while checking the website." }, { status: 500 });
  }
}
