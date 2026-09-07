import { formatPhoneE164ish } from "../../utils/format-utils.js";
import { GRAPH_API_VERSION, getGlobalWhatsAppConfig, getTenantWhatsAppConfig } from "./config.js";
import WhatsAppMessage from "../../entities/whatsapp/whatsappMessage.model.js";

async function sendTemplateMessage({
  tenantId,
  to,
  templateName,
  languageCode,
  components = [],
  forceGlobalFallback = false,
}) {
  let cfg;
  if (forceGlobalFallback || !tenantId) {
    cfg = getGlobalWhatsAppConfig();
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

    // Record outbound template message asynchronously for thread tracking
    if (data?.messages?.[0]?.id) {
      try {
        WhatsAppMessage.create({
          tenant: tenantId || null,
          messageId: data.messages[0].id,
          direction: "outbound",
          from: cfg.phoneNumberId,
          to: recipient,
          contactPhone: recipient,
          messageType: "template",
          content: {
            templateName,
            templateComponents: components,
          },
          status: "sent",
          statusHistory: [{ status: "sent", timestamp: new Date() }],
          timestamp: new Date(),
          rawPayload: payload,
        }).catch((logErr) => {
          console.warn("Failed to log outbound WhatsApp message:", logErr?.message || logErr);
        });
      } catch (_) {}
    }

    return { ok: true, data };
  } catch (err) {
    console.error("WhatsApp send error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

async function sendTextMessage({ tenantId = null, to, text }) {
  const cfg = getGlobalWhatsAppConfig();
  if (!cfg.enabled || !cfg.accessToken || !cfg.phoneNumberId) {
    console.error("WhatsApp config incomplete for text message");
    return { ok: false, skipped: true, reason: "config_incomplete" };
  }
  const recipient = formatPhoneE164ish(to);
  if (!recipient) return { ok: false, skipped: true, reason: "invalid_recipient" };

  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { body: text },
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
      console.error("WhatsApp text send failed", { status: res.status, data });
      return { ok: false, status: res.status, data };
    }
    // Record outbound message
    if (data?.messages?.[0]?.id) {
      WhatsAppMessage.create({
        tenant: tenantId || null,
        messageId: data.messages[0].id,
        direction: "outbound",
        from: cfg.phoneNumberId,
        to: recipient,
        contactPhone: recipient,
        messageType: "text",
        content: { text },
        status: "sent",
        statusHistory: [{ status: "sent", timestamp: new Date() }],
        timestamp: new Date(),
        rawPayload: payload,
      }).catch((logErr) => {
        console.warn("Failed to log outbound WhatsApp text:", logErr?.message || logErr);
      });
    }
    return { ok: true, data };
  } catch (err) {
    console.error("WhatsApp text send error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

export { sendTemplateMessage, sendTextMessage };

