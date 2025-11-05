const DEFAULT_URL = process.env.VEHICLE_API_URL || 'https://api.webcorevision.com:3000/api/vehicle';

// Robust-ish date parsing for provider formats like '07-Nov-2024', '31-10-2025', '10/2024'
function parseDateSafe(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // MM/YYYY
  if (/^\d{1,2}[\/\-]\d{4}$/.test(s)) {
    const [mm, yyyy] = s.split(/[\/\-]/).map((x) => parseInt(x, 10));
    if (!Number.isNaN(mm) && !Number.isNaN(yyyy)) {
      const d = new Date(Date.UTC(yyyy, mm - 1, 1));
      return d;
    }
  }
  // DD-MMM-YYYY or DD-MM-YYYY
  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m1 = s.match(/^(\d{1,2})[-\/](\w{3})[-\/]?(\d{4})$/i);
  if (m1) {
    const dd = parseInt(m1[1], 10);
    const mon = monthMap[m1[2].toLowerCase()];
    const yyyy = parseInt(m1[3], 10);
    if (!Number.isNaN(dd) && mon >= 0 && !Number.isNaN(yyyy)) {
      return new Date(Date.UTC(yyyy, mon, dd));
    }
  }
  const m2 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/]?(\d{4})$/);
  if (m2) {
    const dd = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10) - 1;
    const yyyy = parseInt(m2[3], 10);
    if (!Number.isNaN(dd) && mm >= 0 && !Number.isNaN(yyyy)) {
      return new Date(Date.UTC(yyyy, mm, dd));
    }
  }
  // YYYY or other fallbacks
  const y = s.match(/(19|20)\d{2}/);
  if (y) return new Date(Date.UTC(parseInt(y[0], 10), 0, 1));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numFromArray(a) {
  if (!Array.isArray(a) || a.length === 0) return null;
  const n = Number(String(a[0]).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function strFromArray(a) {
  if (!Array.isArray(a) || a.length === 0) return null;
  const s = String(a[0]).trim();
  return s || null;
}

function axlesToTyres(axles) {
  const n = Number(axles);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return 4; // fallback
  if (n === 2) return 6;
  if (n === 3) return 10;
  if (n === 4) return 14;
  if (n >= 5) return 18;
  return null;
}

function mapEngineType(normsDesc) {
  const s = String(normsDesc || '').toUpperCase();
  if (s.includes('VI') || s.includes('BS VI') || s.includes('BS6')) return 'BS-6';
  if (s.includes('V') || s.includes('BS V') || s.includes('BS5')) return 'BS-5';
  if (s.includes('IV') || s.includes('BS IV') || s.includes('BS4')) return 'BS-4';
  if (s.includes('III') || s.includes('BS III') || s.includes('BS3')) return 'BS-3';
  return undefined;
}

function mapVehicleCompany(makerDesc) {
  const s = String(makerDesc || '').toUpperCase();
  if (s.includes('TATA')) return 'Tata';
  if (s.includes('ASHOK')) return 'Ashok Leyland';
  if (s.includes('BENZ')) return 'Bharat Benz';
  if (s.includes('ACE')) return 'Ace';
  return makerDesc || undefined;
}

function toDateOrNull(arr) {
  const s = strFromArray(arr);
  const d = parseDateSafe(s);
  return d || null;
}

function normalizeVehicleDetails(provider) {
  const v = provider?.VehicleDetails || {};
  const regNo = strFromArray(v.rc_regn_no);
  const vhClass = strFromArray(v.rc_vch_catg) || strFromArray(v.rc_vh_class_desc) || undefined;
  const makerModel = strFromArray(v.rc_maker_model) || undefined;
  const maker = strFromArray(v.rc_maker_desc) || undefined;
  const chasis = strFromArray(v.rc_chasi_no) || undefined;
  const engine = strFromArray(v.rc_eng_no) || undefined;
  const manuMy = strFromArray(v.rc_manu_month_yr) || undefined;
  const yearFromManu = manuMy && /(19|20)\d{2}/.test(manuMy) ? parseInt(manuMy.match(/(19|20)\d{2}/)[0], 10) : undefined;
  const gvw = numFromArray(v.rc_gvw) || 0; // kg
  const unld = numFromArray(v.rc_unld_wt) || 0; // kg
  const payloadKg = gvw && unld ? Math.max(gvw - unld, 0) : undefined;
  // Convert to tons with 2 decimal precision
  const loadingCapacity = typeof payloadKg === 'number' ? parseFloat((payloadKg / 1000).toFixed(2)) : undefined;
  const axles = numFromArray(v.rc_no_of_axle);
  const tyres = axlesToTyres(axles);
  const norms = strFromArray(v.rc_norms_desc) || undefined;

  return {
    vehicleNo: regNo,
    vehicleType: vhClass || undefined,
    modelType: makerModel,
    vehicleCompany: mapVehicleCompany(maker),
    noOfTyres: tyres || undefined,
    chasisNo: chasis,
    engineNo: engine,
    manufacturingYear: yearFromManu || undefined,
    loadingCapacity: loadingCapacity || undefined,
    engineType: mapEngineType(norms),
  };
}

function extractDocuments(provider) {
  const v = provider?.VehicleDetails || {};
  const docs = [];
  const today = new Date();
  // RC
  docs.push({
    docType: 'RC',
    docNumber: strFromArray(v.rc_regn_no) || null,
    issuer: strFromArray(v.rc_registered_at) || null,
    issueDate: toDateOrNull(v.rc_regn_dt) || today,
    expiryDate: toDateOrNull(v.rc_regn_upto),
  });
  // Insurance
  docs.push({
    docType: 'Insurance',
    docNumber: strFromArray(v.rc_insurance_policy_no) || null,
    issuer: strFromArray(v.rc_insurance_comp) || null,
    issueDate: null,
    expiryDate: toDateOrNull(v.rc_insurance_upto),
  });
  // PUC
  docs.push({
    docType: 'PUC',
    docNumber: strFromArray(v.rc_pucc_no) || null,
    issuer: 'State Transport Department',
    issueDate: null,
    expiryDate: toDateOrNull(v.rc_pucc_upto),
  });
  // Fitness
  docs.push({
    docType: 'Fitness',
    docNumber: null,
    issuer: null,
    issueDate: null,
    expiryDate: toDateOrNull(v.rc_fit_upto),
  });
  // Permit
  if (strFromArray(v.rc_permit_valid_upto) || strFromArray(v.rc_permit_no)) {
    docs.push({
      docType: 'Permit',
      docNumber: strFromArray(v.rc_permit_no) || null,
      issuer: strFromArray(v.rc_permit_issuing_authority) || null,
      issueDate: toDateOrNull(v.rc_permit_issue_dt) || toDateOrNull(v.rc_permit_valid_from) || null,
      expiryDate: toDateOrNull(v.rc_permit_valid_upto),
    });
  }
  // Road Tax
  docs.push({
    docType: 'Tax',
    docNumber: null,
    issuer: null,
    issueDate: null,
    expiryDate: toDateOrNull(v.rc_tax_upto),
  });

  // Default issueDate for any missing ones
  return docs.map((d) => ({ ...d, issueDate: d.issueDate || today }));
}

async function fetchVehicleByNumber(vehicleNo) {
  const url = DEFAULT_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehiclenumber: vehicleNo }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vehicle API failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

export {
  fetchVehicleByNumber,
  normalizeVehicleDetails,
  extractDocuments,
  axlesToTyres,
  mapEngineType,
  mapVehicleCompany,
};
