import Tenant from "../../entities/tenant/tenant.model.js";

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

export { GRAPH_API_VERSION, getTenantWhatsAppConfig };

