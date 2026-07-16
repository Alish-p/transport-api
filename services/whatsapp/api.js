import { formatPhoneE164ish } from "../../utils/format-utils.js";
import { GRAPH_API_VERSION, getTenantWhatsAppConfig } from "./config.js";

async function sendTemplateMessage({ tenantId, to, templateName, languageCode, components = [], forceGlobalFallback = false }) {
  // When forceGlobalFallback is true (e.g. login OTP), skip tenant lookup and use global credentials directly
  let cfg;
  if (forceGlobalFallback) {
    cfg = {
      enabled: true,
      accessToken: process.env.WA_ACCESS_TOKEN,
      phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
      languageCode: process.env.WA_LANG || "en",
    };
  } else {
    cfg = await getTenantWhatsAppConfig(tenantId);
  }

  if (!cfg.enabled) {
    return { ok: false, skipped: true, reason: "whatsapp_disabled" };
  }
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    console.error("WhatsApp config incomplete: missing token or phone number id");
    return { ok: false, skipped: true, reason: "config_incomplete" };
  }

  const recipient = formatPhoneE164ish(to);
  if (!recipient) {
    return { ok: false, skipped: true, reason: "invalid_recipient" };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode || cfg.languageCode || "en" },
      components,
    },
  };

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.phoneNumberId}/messages`;
  try {
    const res = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("WhatsApp send failed", { status: res.status, data });
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("WhatsApp send error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

export { sendTemplateMessage };

