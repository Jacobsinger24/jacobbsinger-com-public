// jacobbsinger.com contact form handler (Azure Functions v4 Node programming model)
// Receives JSON POST from the site, verifies Cloudflare Turnstile, sends an email via Resend.

const { app } = require("@azure/functions");

const TO_EMAIL = process.env.CONTACT_TO_EMAIL;
// onboarding@resend.dev works on Resend's free tier without domain verification,
// but only sends to the email used at signup. Verify a domain later to send from a custom address.
const FROM_EMAIL = "jacobbsinger.com <onboarding@resend.dev>";
const ALLOWED_REASONS = new Set(["Business Inquiry", "Networking", "Speaking Engagement", "Other"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const countWords = (s) => (String(s || "").trim().match(/\S+/g) || []).length;

const jsonResp = (status, body) => ({
  status,
  jsonBody: body,
});

app.http("contact", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

      let body = {};
      try {
        body = await request.json();
      } catch {
        return jsonResp(400, { error: "Invalid JSON body." });
      }

      const { name, email, phone, reason, message, website, turnstileToken } = body || {};

      // Honeypot
      if (typeof website === "string" && website.length > 0) {
        context.log("Contact form honeypot tripped");
        return jsonResp(200, { ok: true });
      }

      // Turnstile
      if (!TURNSTILE_SECRET) {
        context.error("TURNSTILE_SECRET_KEY app setting is missing");
        return jsonResp(500, { error: "Security check not configured." });
      }
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return jsonResp(400, { error: "Security check required." });
      }
      try {
        const headers = request.headers;
        const xff = headers.get("x-forwarded-for") || headers.get("x-azure-clientip") || "";
        const tsForm = new URLSearchParams();
        tsForm.append("secret", TURNSTILE_SECRET);
        tsForm.append("response", turnstileToken);
        if (xff) tsForm.append("remoteip", xff.split(",")[0].trim());
        const tsResp = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: tsForm.toString(),
          }
        );
        const tsData = await tsResp.json();
        if (!tsData.success) {
          context.warn("Turnstile verification failed", tsData["error-codes"]);
          return jsonResp(400, {
            error: "Security check failed. Please reload and try again.",
          });
        }
      } catch (tsErr) {
        context.error("Turnstile verify call errored", tsErr);
        return jsonResp(502, { error: "Security check unavailable. Please try again." });
      }

      // Validation
      const errors = [];
      if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
        errors.push("name");
      }
      if (!email || typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 200) {
        errors.push("email");
      }
      if (phone && (typeof phone !== "string" || phone.length > 40)) {
        errors.push("phone");
      }
      if (!reason || typeof reason !== "string" || !ALLOWED_REASONS.has(reason)) {
        errors.push("reason");
      }
      if (!message || typeof message !== "string" || message.length > 1500) {
        errors.push("message");
      } else if (countWords(message) < 10) {
        errors.push("message-too-short");
      } else if (countWords(message) > 150) {
        errors.push("message-length");
      }
      if (errors.length) {
        return jsonResp(400, { error: `Invalid: ${errors.join(", ")}` });
      }

      if (!RESEND_API_KEY) {
        context.error("RESEND_API_KEY app setting is missing");
        return jsonResp(500, { error: "Email service not configured." });
      }

      const cleanName = name.trim();
      const cleanEmail = email.trim();
      const cleanPhone = phone ? phone.trim() : "";
      const cleanMessage = message.trim();
      const subject = `${reason} - ${cleanName} (${cleanEmail})`;

      const html = `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.55;">
  <h2 style="margin: 0 0 12px; font-weight: 600;">New contact form submission</h2>
  <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 14px;">
    <tr><td style="color:#78716c;">Reason</td><td><strong>${escapeHtml(reason)}</strong></td></tr>
    <tr><td style="color:#78716c;">Name</td><td>${escapeHtml(cleanName)}</td></tr>
    <tr><td style="color:#78716c;">Email</td><td><a href="mailto:${escapeHtml(cleanEmail)}">${escapeHtml(cleanEmail)}</a></td></tr>
    <tr><td style="color:#78716c;">Phone</td><td>${cleanPhone ? escapeHtml(cleanPhone) : "<em>not provided</em>"}</td></tr>
  </table>
  <h3 style="margin: 20px 0 6px; font-weight: 600;">Message</h3>
  <p style="white-space: pre-wrap; background: #f8f4ec; padding: 14px 16px; border-radius: 8px; border: 1px solid #e7e1d5;">${escapeHtml(cleanMessage)}</p>
  <hr style="margin: 24px 0; border: none; border-top: 1px solid #e7e1d5;">
  <p style="color:#a8a29e; font-size:12px;">Sent from the contact form on <a href="https://www.jacobbsinger.com" style="color:#c2410c;">jacobbsinger.com</a>.<br>Reply to this email to respond directly to ${escapeHtml(cleanName)}.</p>
</body></html>`;

      const text = `New contact form submission

Reason: ${reason}
Name:   ${cleanName}
Email:  ${cleanEmail}
Phone:  ${cleanPhone || "(not provided)"}

Message:
${cleanMessage}

---
Sent from the contact form on jacobbsinger.com
Reply to this email to respond directly to ${cleanName}.`;

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [TO_EMAIL],
          reply_to: cleanEmail,
          subject,
          html,
          text,
        }),
      });

      if (!resendResp.ok) {
        const errText = await resendResp.text().catch(() => "");
        context.error("Resend API error", resendResp.status, errText);
        return jsonResp(502, { error: "Failed to send email." });
      }

      return jsonResp(200, { ok: true });
    } catch (err) {
      context.error("Contact function error", err);
      return jsonResp(500, { error: "Internal error." });
    }
  },
});
