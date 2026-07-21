// helpers/ewaybill.js
// MastersIndia e-way bill client with simple in-memory token cache

const MI_BASE_URL = 'https://prod-api.mastersindia.co/api/v1';

// naive in-memory token cache keyed by username
const tokenCache = new Map(); // username -> { token, exp: number }

function decodeJwtExp(token) {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return Number(json.exp) || 0;
  } catch (_) {
    return 0;
  }
}

async function loginMastersIndia(username, password) {
  const url = `${MI_BASE_URL}/token-auth/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MastersIndia login failed ${res.status}: ${txt}`);
  }

  const data = await res.json();
  if (!data?.token) {
    throw new Error('MastersIndia login did not return token');
  }

  const exp = decodeJwtExp(data.token);
  tokenCache.set(username, { token: data.token, exp });
  return data.token;
}

function isTokenValid(entry) {
  if (!entry) return false;
  const now = Math.floor(Date.now() / 1000);
  // refresh 60s early to be safe
  return entry.exp && entry.exp - 60 > now;
}

async function getMastersIndiaToken(username, password) {
  const cached = tokenCache.get(username);
  if (isTokenValid(cached)) return cached.token;
  return loginMastersIndia(username, password);
}

export async function getMastersIndiaEwayBill(gstin, ewayBillNumber) {
  const username = process.env.MASTERSINDIA_USERNAME;
  const password = process.env.MASTERSINDIA_PASSWORD;
  if (!username || !password) {
    throw new Error('MastersIndia credentials not configured in environment');
  }
  if (!gstin) {
    throw new Error('GSTIN missing in tenant');
  }
  if (!ewayBillNumber) {
    throw new Error('eway bill number is required');
  }

  const token = await getMastersIndiaToken(username, password);

  const url = `${MI_BASE_URL}/getEwayBillData/?action=GetEwayBill&gstin=${encodeURIComponent(
    gstin,
  )}&eway_bill_number=${encodeURIComponent(ewayBillNumber)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `JWT ${token}` },
  });

  const bodyText = await res.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(
      `MastersIndia EWB fetch failed ${res.status}: ${bodyText || res.statusText}`,
    );
  }

  // Prefer returning the provider's message payload if present
  const message = data?.results?.message ?? null;
  return message || data;
}

export async function getMastersIndiaEwayBillsForTransporterByState(
  gstin,
  generatedDate,
  stateCode,
) {
  const username = process.env.MASTERSINDIA_USERNAME;
  const password = process.env.MASTERSINDIA_PASSWORD;
  if (!username || !password) {
    throw new Error('MastersIndia credentials not configured in environment');
  }
  if (!gstin) {
    throw new Error('GSTIN missing in tenant');
  }
  if (!generatedDate) {
    throw new Error('generated_date is required in DD/MM/YYYY');
  }
  if (!stateCode) {
    throw new Error('state_code is required');
  }

  const token = await getMastersIndiaToken(username, password);

  const url = `${MI_BASE_URL}/getEwayBillData/?action=GetEwayBillsForTransporterByState&gstin=${encodeURIComponent(
    gstin,
  )}&generated_date=${encodeURIComponent(generatedDate)}&state_code=${encodeURIComponent(
    stateCode,
  )}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `JWT ${token}` },
  });

  const bodyText = await res.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(
      `MastersIndia EWB list fetch failed ${res.status}: ${bodyText || res.statusText}`,
    );
  }

  const message = data?.results?.message ?? null;
  return message || data;
}

export async function authenticateWhitebooks(tenant, ipAddress) {
  const clientId = process.env.WHITEBOOKS_CLIENT_ID;
  const clientSecret = process.env.WHITEBOOKS_CLIENT_SECRET;
  const email = process.env.WHITEBOOKS_EMAIL;

  if (!clientId || !clientSecret || !email) {
    throw new Error('Whitebooks credentials or email not configured in environment');
  }

  const integration = tenant?.integrations?.ewayBill;
  if (!integration || !integration.enabled) {
    throw new Error('E-Way Bill integration is not enabled for this tenant');
  }

  const { username, password } = integration;
  const gstin = tenant?.legalInfo?.gstNumber;

  if (!username || !password || !gstin) {
    throw new Error('Whitebooks username, password, or GSTIN not configured for this tenant');
  }

  const url = `https://api.whitebooks.in/ewaybillapi/v1.03/authenticate?email=${encodeURIComponent(
    email
  )}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'client_id': clientId,
      'client_secret': clientSecret,
      'gstin': gstin,
      'ip_address': ipAddress || '127.0.0.1',
      'Accept': 'application/json',
    },
  });

  const bodyText = await res.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(
      `Whitebooks authentication failed ${res.status}: ${bodyText || res.statusText}`
    );
  }

  if (data && data.status_cd === '0') {
    let errMsg = 'Authentication failed';
    try {
      const parsed = typeof data.error?.message === 'string' ? JSON.parse(data.error.message) : data.error?.message;
      errMsg = parsed?.errorCodes || parsed?.errorDesc || data.error?.message || errMsg;
    } catch (_) {
      errMsg = data.error?.message || errMsg;
    }
    throw new Error(`Whitebooks authentication failed: ${errMsg}`);
  }

  return data;
}

async function callWhitebooksApi(tenant, url, ipAddress, isRetry = false) {
  const clientId = process.env.WHITEBOOKS_CLIENT_ID;
  const clientSecret = process.env.WHITEBOOKS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Whitebooks credentials not configured in environment');
  }

  const gstin = tenant?.legalInfo?.gstNumber;
  if (!gstin) {
    throw new Error('GSTIN missing in tenant');
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'client_id': clientId,
      'client_secret': clientSecret,
      'gstin': gstin,
      'ip_address': ipAddress || '127.0.0.1',
      'Accept': 'application/json',
    },
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Whitebooks API failed ${res.status}: ${bodyText || res.statusText}`);
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (_) {
    throw new Error(`Failed to parse Whitebooks API response: ${bodyText}`);
  }

  // Check for session expired / authentication required (error code 238)
  let isExpired = false;
  if (data && data.status_cd === '0' && data.error) {
    try {
      const errMsg = typeof data.error.message === 'string' ? JSON.parse(data.error.message) : data.error.message;
      const errCode = String(errMsg?.errorCodes || errMsg?.errorCode || '');
      if (errCode === '238') {
        isExpired = true;
      }
    } catch (_) {
      if (typeof data.error.message === 'string' && data.error.message.includes('238')) {
        isExpired = true;
      }
    }
  }

  if (isExpired && !isRetry) {
    console.log(`Whitebooks API returned session expired (238) for GSTIN ${gstin}. Attempting re-authentication...`);
    await authenticateWhitebooks(tenant, ipAddress);
    // Retry the request once
    return callWhitebooksApi(tenant, url, ipAddress, true);
  }

  return data;
}

export async function getWhitebooksEwayBillsForTransporter(tenant, generatedDate, ipAddress) {
  const email = process.env.WHITEBOOKS_EMAIL;

  if (!email) {
    throw new Error('Whitebooks email not configured in environment');
  }
  if (!generatedDate) {
    throw new Error('generatedDate is required in DD/MM/YYYY');
  }

  const url = `https://api.whitebooks.in/ewaybillapi/v1.03/ewayapi/getewaybillsfortransporter?email=${encodeURIComponent(
    email
  )}&date=${encodeURIComponent(generatedDate)}`;

  return callWhitebooksApi(tenant, url, ipAddress);
}

export async function getWhitebooksEwayBillsForTransporterByState(
  tenant,
  generatedDate,
  stateCode,
  ipAddress,
) {
  const email = process.env.WHITEBOOKS_EMAIL;

  if (!email) {
    throw new Error('Whitebooks email not configured in environment');
  }
  if (!generatedDate) {
    throw new Error('generatedDate is required in DD/MM/YYYY');
  }
  if (!stateCode) {
    throw new Error('stateCode is required');
  }

  const url = `https://api.whitebooks.in/ewaybillapi/v1.03/ewayapi/getewaybillsfortransporterbystate?email=${encodeURIComponent(
    email,
  )}&stateCode=${encodeURIComponent(stateCode)}&date=${encodeURIComponent(generatedDate)}`;

  return callWhitebooksApi(tenant, url, ipAddress);
}

export async function getWhitebooksEwayBill(tenant, ewayBillNumber, ipAddress) {
  const email = process.env.WHITEBOOKS_EMAIL;

  if (!email) {
    throw new Error('Whitebooks email not configured in environment');
  }
  if (!ewayBillNumber) {
    throw new Error('eway bill number is required');
  }

  const url = `https://api.whitebooks.in/ewaybillapi/v1.03/ewayapi/getewaybill?email=${encodeURIComponent(
    email
  )}&ewbNo=${encodeURIComponent(ewayBillNumber)}`;

  return callWhitebooksApi(tenant, url, ipAddress);
}


