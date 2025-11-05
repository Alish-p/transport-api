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

// Canonical normalization for GST business details (single fixed structure)
function normalizeGstCanonical(provider) {
  const r = provider?.response || {};
  const addr = r?.principalPlaceOfBusinessFields?.principalPlaceOfBusinessAddress || {};
  return {
    gstin: r?.gstIdentificationNumber || provider?.gstin || provider?.gstIn || null,
    pan: extractPANFromGSTIN(r?.gstIdentificationNumber || provider?.gstin || provider?.gstIn || ''),
    tradeName: r?.tradeName || null,
    legalName: r?.legalNameOfBusiness || null,
    status: r?.gstnStatus || null,
    constitution: r?.constitutionOfBusiness || null,
    dateOfRegistration: r?.dateOfRegistration || null,
    address: {
      line1: toAddressLine(addr) || null,
      buildingNumber: addr?.buildingNumber || null,
      streetName: addr?.streetName || null,
      location: addr?.location || null,
      district: addr?.districtName || null,
      state: addr?.stateName || null,
      city: addr?.city || null,
      pincode: addr?.pincode || null,
      latitude: addr?.lattitude || null,
      longitude: addr?.longitude || null,
    },
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

export { fetchGstDetails, normalizeGstCanonical };
