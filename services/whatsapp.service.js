import Tenant from "../entities/tenant/tenant.model.js";
import { formatPhoneE164ish, formatCurrencyINR, formatDateDDMonYYYY } from "../utils/format-utils.js";

const GRAPH_API_VERSION = process.env.WA_GRAPH_API_VERSION || "v22.0";

async function getTenantWhatsAppConfig(tenantId) {
  try {
    const tenant = await Tenant.findById(tenantId).select("integrations.whatsapp");
    const wa = tenant?.integrations?.whatsapp || {};
    const enabled = !!wa?.enabled;
    const cfg = wa?.config || {};
    const accessToken = cfg.accessToken || process.env.WA_ACCESS_TOKEN;
    const phoneNumberId = cfg.phoneNumberId || process.env.WA_PHONE_NUMBER_ID;
    const languageCode = cfg.languageCode || process.env.WA_LANG || "en";

    return { enabled, accessToken, phoneNumberId, languageCode };
  } catch (err) {
    console.error("Failed to load tenant WhatsApp config:", err?.message || err);
    return { enabled: false };
  }
}

async function sendTemplateMessage({
  tenantId,
  to,
  templateName,
  languageCode,
  components = [],
}) {
  const cfg = await getTenantWhatsAppConfig(tenantId);
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

async function sendTransporterPaymentNotification({ tenantId, transporter, receipt, tenantName }) {
  if (!transporter) return { ok: false, skipped: true, reason: "no_transporter" };
  const to = transporter.cellNo;
  if (!to) return { ok: false, skipped: true, reason: "no_transporter_phone" };

  const name = transporter.ownerName || transporter.transportName || "Transporter";
  const company = tenantName || "Company";
  const paymentId = receipt?.paymentId || "";
  const issueDate = formatDateDDMonYYYY(receipt?.issueDate);
  const amount = formatCurrencyINR(receipt?.summary?.netIncome || 0);

  const components = [
    {
      type: "body",
      parameters: [name, company, paymentId, issueDate, amount].map((t) => ({
        type: "text",
        text: String(t ?? ""),
      })),
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: String(receipt?._id || ""),
        },
      ],
    },
  ];

  return sendTemplateMessage({
    tenantId,
    to,
    templateName: "transporter_payment_generated",
    components,
  });
}

export {
  sendTemplateMessage,
  sendTransporterPaymentNotification,
};
