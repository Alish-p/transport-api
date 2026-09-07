import Tenant from "../../entities/tenant/tenant.model.js";

const GRAPH_API_VERSION = process.env.WA_GRAPH_API_VERSION || "v22.0";

function getGlobalWhatsAppConfig() {
  const accessToken = process.env.WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const languageCode = process.env.WA_LANG || "en";
  const enabled = Boolean(accessToken && phoneNumberId);

  return { enabled, accessToken, phoneNumberId, languageCode };
}

async function getTenantWhatsAppConfig(tenantId) {
  const globalCfg = getGlobalWhatsAppConfig();
  if (!globalCfg.enabled) {
    return { enabled: false, ...globalCfg };
  }

  if (!tenantId) {
    return globalCfg;
  }

  try {
    const tenant = await Tenant.findById(tenantId).select("integrations.whatsapp");
    const isTenantEnabled = Boolean(tenant?.integrations?.whatsapp?.enabled);
    return { ...globalCfg, enabled: isTenantEnabled };
  } catch (err) {
    console.error("Failed to load tenant WhatsApp config:", err?.message || err);
    return { ...globalCfg, enabled: false };
  }
}

export { GRAPH_API_VERSION, getGlobalWhatsAppConfig, getTenantWhatsAppConfig };

