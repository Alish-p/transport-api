const DEFAULT_URL = process.env.CHELLAN_API_URL || process.env.CHALLAN_API_URL || 'https://api.webcorevision.com:3000/api/eChallan';

function parseDateTime(input) {
  if (!input) return null;
  // Expected: DD-MM-YYYY HH:mm:ss
  const m = String(input).trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS)));
  return d;
}

function toNumberSafe(v) {
  if (v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function normalizeItem(it) {
  if (!it) return null;
  return {
    challanNo: it.challan_no || undefined,
    challanDateTime: parseDateTime(it.challan_date_time),
    place: it.challan_place || undefined,
    status: it.challan_status || undefined,
    sentToRegCourt: it.sent_to_reg_court || undefined,
    remark: it.remark || undefined,
    fineImposed: toNumberSafe(it.fine_imposed),
    dlNo: it.dl_no || undefined,
    driverName: it.driver_name || undefined,
    ownerName: it.owner_name || undefined,
    violatorName: it.name_of_violator || undefined,
    receiptNo: it.receipt_no || undefined,
    receivedAmount: toNumberSafe(it.received_amount),
    department: it.department || undefined,
    stateCode: it.state_code || undefined,
    documentImpounded: it.document_impounded || undefined,
    offenceDetails: Array.isArray(it.offence_details)
      ? it.offence_details.map((o) => ({ act: o.act || undefined, name: o.name || undefined }))
      : [],
    amountOfFineImposed: toNumberSafe(it.amount_of_fine_imposed),
    courtAddress: it.court_address || undefined,
    courtName: it.court_name || undefined,
    dateOfProceeding: it.date_of_proceeding ? new Date(it.date_of_proceeding) : undefined,
    sentToCourtOn: it.sent_to_court_on ? new Date(it.sent_to_court_on) : undefined,
    sentToVirtualCourt: it.sent_to_virtual_court || undefined,
    rtoDistrictName: it.rto_distric_name || undefined,
  };
}

function normalizeProviderResponse(json) {
  const data = json?.response?.data || {};
  const pending = Array.isArray(data.Pending_data) ? data.Pending_data.map(normalizeItem).filter(Boolean) : [];
  const disposed = Array.isArray(data.Disposed_data) ? data.Disposed_data.map(normalizeItem).filter(Boolean) : [];
  return { pending, disposed };
}

async function fetchChallansForVehicle(vehicleNo) {
  const url = DEFAULT_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehiclenumber: vehicleNo }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Challan API failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

export {
  fetchChallansForVehicle,
  normalizeProviderResponse,
  parseDateTime,
};

