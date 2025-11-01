import Tenant from "../../../entities/tenant/tenant.model.js";
import { fDateTime } from "../../../utils/time-utils.js";
import { sendTemplateMessage } from "../api.js";

// LR generation notification to Transporter (Market vehicles)
async function sendLRGenerationNotification({ tenantId, transporter, vehicle, subtrip, createdBy }) {
  if (!transporter) return { ok: false, skipped: true, reason: "no_transporter" };
  const to = transporter.cellNo;
  if (!to) return { ok: false, skipped: true, reason: "no_transporter_phone" };

  // Use tenant name as creatorName; fallback to user/team
  let tenantName;
  try {
    const t = tenantId ? await Tenant.findById(tenantId).select("name") : null;
    tenantName = t?.name;
  } catch (_) {
    // ignore lookup errors; will fallback below
  }
  const creatorName = tenantName || createdBy?.name || createdBy?.fullName || "Team";
  const vehicleNo = vehicle?.vehicleNo || "";
  const transporterName = transporter?.transportName || "Transporter";
  const shipmentRef = subtrip?.subtripNo || "";
  const fromCity = subtrip?.loadingPoint || "";
  const toCity = subtrip?.unloadingPoint || "";
  const material = subtrip?.materialType || "";
  const when = fDateTime(subtrip?.startDate);

  const components = [
    {
      type: "body",
      parameters: [
        transporterName,
        vehicleNo,
        creatorName,
        shipmentRef,
        fromCity,
        toCity,
        material,
        when,
      ].map((t) => ({ type: "text", text: String(t ?? "") })),
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: String(subtrip?._id || ""),
        },
      ],
    },
  ];

  return sendTemplateMessage({
    tenantId,
    to,
    templateName: "lr_generation_template",
    components,
  });
}

export { sendLRGenerationNotification };

