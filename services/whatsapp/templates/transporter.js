import { formatCurrencyINR } from "../../../utils/format-utils.js";
import { fDate } from "../../../utils/time-utils.js";
import { sendTemplateMessage } from "../api.js";

async function sendTransporterPaymentNotification({ tenantId, transporter, receipt, tenantName }) {
  if (!transporter) return { ok: false, skipped: true, reason: "no_transporter" };
  const to = transporter.cellNo;
  if (!to) return { ok: false, skipped: true, reason: "no_transporter_phone" };

  const name = transporter.ownerName || transporter.transportName || "Transporter";
  const company = tenantName || "Company";
  const paymentId = receipt?.paymentId || "";
  const issueDate = fDate(receipt?.issueDate);
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
    templateName: "transporter_payment_generated_v1",
    components,
  });
}

export { sendTransporterPaymentNotification };

