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

