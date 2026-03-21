import Driver from "../../../entities/driver/driver.model.js";
import Tenant from "../../../entities/tenant/tenant.model.js";
import { fDate } from "../../../utils/time-utils.js";
import { sendTemplateMessage } from "../api.js";

/**
 * Send WhatsApp notification to driver when a job is assigned.
 * Template: driver_job_assigned
 * Body params: driverName, vehicleNo, lrNumber, fromCity, toCity, material, ewayExpiry, destinationMapLink
 * Button (URL): EPOD link
 */
async function sendDriverJobAssignedNotification({ tenantId, driverId, vehicle, subtrip }) {
  if (!driverId) return { ok: false, skipped: true, reason: "no_driverId" };

  // Fetch driver to get phone number
  let driver;
  try {
    driver = await Driver.findById(driverId);
  } catch (_) {
    return { ok: false, skipped: true, reason: "driver_lookup_failed" };
  }
  if (!driver) return { ok: false, skipped: true, reason: "driver_not_found" };

  const to = driver.driverCellNo;
  if (!to) return { ok: false, skipped: true, reason: "no_driver_phone" };

  // Resolve tenant name for context
  let tenantName;
  try {
    const t = tenantId ? await Tenant.findById(tenantId).select("name") : null;
    tenantName = t?.name;
  } catch (_) {
    // ignore
  }

  const driverName = driver.driverName || "Driver";
  const vehicleNo = vehicle?.vehicleNo || "";
  const lrNumber = subtrip?.subtripNo || "";
  const fromCity = subtrip?.loadingPoint || "";
  const toCity = subtrip?.unloadingPoint || "";
  const material = subtrip?.materialType || "";
  const ewayExpiry = subtrip?.ewayExpiryDate ? fDate(subtrip.ewayExpiryDate) : "-";

  // Google Maps link for destination (unloading point as search query)
  const destinationMapLink = toCity
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(toCity)}`
    : "";

  const components = [
    {
      type: "body",
      parameters: [
        driverName,
        vehicleNo,
        lrNumber,
        fromCity,
        toCity,
        material,
        ewayExpiry,
        destinationMapLink,
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
    templateName: "driver_job_assigned",
    components,
  });
}

export { sendDriverJobAssignedNotification };
