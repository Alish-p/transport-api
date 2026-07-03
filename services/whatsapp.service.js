// This file is now a thin facade over the modular WhatsApp service.
// Keeping the same import path for backward compatibility.

export {
  GRAPH_API_VERSION,
  sendTemplateMessage,
  getTenantWhatsAppConfig,
  sendLRGenerationNotification,
  sendDriverJobAssignedNotification,
  sendTransporterPaymentNotification,
} from "./whatsapp/index.js";
