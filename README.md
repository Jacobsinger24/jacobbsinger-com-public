# jacobbsinger-com

Personal website for Jacob Singer at [jacobbsinger.com](https://www.jacobbsinger.com).

> Note: this is the **public mirror**. The full source lives in a private repo and a scrubbed snapshot is mirrored here on every push to `main`.

## Stack

- Vanilla HTML / CSS / JS frontend
- **Google Fonts**: Fraunces (display) + Inter (body)
- Light / dark mode with `localStorage` persistence
- Editorial-warm palette (cream + charcoal + burnt orange accent)
- **Azure Functions** (v4 Node programming model) backing the contact form
- **Cloudflare Turnstile** for bot protection
- **Resend** for transactional email
- **Azure Static Web Apps** hosting (auto-deploy on push to `main`)

## File map

| Path | Purpose |
|---|---|
| `index.html` | Landing page — hero, About, Musings, Contact |
| `styles.css` | All styles |
| `script.js` | Theme toggle, scroll-active nav blade, contact form handler |
| `assets/headshot.jpeg` | Author photo |
| `api/src/functions/contact.js` | Azure Function — validates, verifies Turnstile, sends via Resend |
| `api/host.json`, `api/package.json` | Functions runtime config |

## Required SWA app settings

| Name | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend transactional-email API key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret |
| `CONTACT_TO_EMAIL` | Where contact-form submissions are emailed |
