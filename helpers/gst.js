const DEFAULT_URL = process.env.GST_API_URL || 'https://api.webcorevision.com:3000/api/MeitYGST';

function toAddressLine(addr = {}) {
  const parts = [
    addr.buildingNumber,
    addr.streetName,
    addr.location,
    addr.districtName,
  ]
    .map((x) => (x ? String(x).trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

function extractPANFromGSTIN(gstin) {
  const s = String(gstin || '').trim();
  if (s.length >= 12) return s.substring(2, 12); // 2-digit state code + 10-char PAN
  return undefined;
}

// Normalize provider response to Customer model fields
function normalizeGstToCustomer(provider) {
  const r = provider?.response || {};
  const addr = r?.principalPlaceOfBusinessFields?.principalPlaceOfBusinessAddress || {};
  const gstin = r?.gstIdentificationNumber || provider?.gstin || provider?.gstIn || null;

  return {
    customerName: r?.tradeName || r?.legalNameOfBusiness || undefined,
    GSTNo: gstin || undefined,
    gstEnabled: true,
    PANNo: extractPANFromGSTIN(gstin),
    address: toAddressLine(addr) || undefined,
    state: addr?.stateName || undefined,
    pinCode: addr?.pincode || undefined,
  };
}

async function fetchGstDetails(gstin) {
  const url = DEFAULT_URL;
  // const apiKey = process.env.GST_API_KEY || process.env.WEBCOREVISION_API_KEY;
  // if (!apiKey) throw new Error('GST_API_KEY is not configured');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'X-API-Key': apiKey,
    },
    body: JSON.stringify({ gstin }),
  });

  console.log({ res })

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GST API failed: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = await res.json();
  if (data?.responseStatus && String(data.responseStatus).toUpperCase() !== 'SUCCESS') {
    throw new Error(`GST API responded with status: ${data?.responseStatus || 'UNKNOWN'}`);
  }
  return data;
}

export { fetchGstDetails, normalizeGstToCustomer };

