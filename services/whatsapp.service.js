// This file is now a thin facade over the modular WhatsApp service.
// Keeping the same import path for backward compatibility.

export {
  GRAPH_API_VERSION,
  getTenantWhatsAppConfig,
  sendTemplateMessage,
  sendTransporterPaymentNotification,
  sendLRGenerationNotification,
} from "./whatsapp/index.js";
