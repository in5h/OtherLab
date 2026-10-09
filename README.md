# OtherLab

OtherLab is a friendly website checker. Enter a URL and it opens the page on the server, then reports what passed, what needs attention and what failed, in plain language.

## What it checks

- **Page loads**: final HTTP status, following redirects
- **Secure connection**: HTTPS, mixed content, and key security headers (HSTS, CSP, X-Content-Type-Options)
- **Speed**: server response time and HTML size
- **SEO basics**: title, meta description, a single main `<h1>`
- **Accessibility basics**: `lang` attribute, image alt text, form field labels, mobile viewport
- **Favicon**
- **Links**: up to 20 links on the page (the site's own pages first) are requested to find broken ones

The checks run in `lib/siteCheck.ts` and are served from `POST /api/check` with a body of `{ "url": "https://example.com" }`.

For safety, the checker refuses localhost, private network and link-local addresses, including addresses reached through redirects. For local development against a site on your own machine, start the server with `OTHERLAB_ALLOW_PRIVATE_HOSTS=1`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Other scripts: `npm run lint`, `npm run build`, `npm start`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

