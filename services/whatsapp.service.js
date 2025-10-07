// services/whatsapp.service.js
// Lightweight WhatsApp sender via Meta Cloud API (no extra deps)
// Configure via env:
// - WHATSAPP_ENABLED=true
// - WHATSAPP_TOKEN=EAAG... (permanent token or app token)
// - WHATSAPP_PHONE_NUMBER_ID=123456789012345
// - WHATSAPP_DEFAULT_COUNTRY=91 (optional, used if numbers lack country code)

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const DEFAULT_CC = process.env.WHATSAPP_DEFAULT_COUNTRY || '91';

function normalizeMsisdn(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // If already starts with country code (10+ digits), keep; else prefix default
  if (digits.length >= 11) return digits; // assume includes CC
  return `${DEFAULT_CC}${digits}`;
}

async function sendWhatsAppText(toMsisdn, body) {
  if (!WHATSAPP_ENABLED) return { skipped: true, reason: 'disabled' };
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { skipped: true, reason: 'missing_config' };
  }
  const to = normalizeMsisdn(toMsisdn);
  if (!to) return { skipped: true, reason: 'invalid_msisdn' };

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`WhatsApp API ${res.status}: ${txt}`);
    }
    return { ok: true };
  } catch (err) {
    // Do not throw — keep notifications best-effort
    console.error('WhatsApp send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

function buildPaymentGeneratedMessage({ transporter, receipt }) {
  const amt = receipt?.summary?.netIncome ?? 0;
  const paymentId = receipt?.paymentId || receipt?._id;
  const date = receipt?.issueDate ? new Date(receipt.issueDate) : new Date();
  const dateStr = date.toLocaleDateString('en-IN');
  const name = transporter?.transportName || 'Transporter';
  const lines = [
    `Hello ${name},`,
    `Your payment has been generated.`,
    `Payment ID: ${paymentId}`,
    `Amount: ₹${Number(amt).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
    `Date: ${dateStr}`,
  ];

  if (Array.isArray(receipt?.subtripSnapshot) && receipt.subtripSnapshot.length) {
    const trips = receipt.subtripSnapshot.slice(0, 3)
      .map(s => `• ${s.subtripNo || s.vehicleNo || ''} ${s.loadingPoint || ''} → ${s.unloadingPoint || ''}`.trim());
    lines.push('Trips:');
    lines.push(...trips);
    if (receipt.subtripSnapshot.length > 3) {
      lines.push(`(+${receipt.subtripSnapshot.length - 3} more)`);
    }
  }

  lines.push('\nThank you.');
  return lines.join('\n');
}

async function notifyTransporterPaymentGenerated(transporter, receipt) {
  const to = transporter?.cellNo;
  const body = buildPaymentGeneratedMessage({ transporter, receipt });
  return sendWhatsAppText(to, body);
}

export default {
  notifyTransporterPaymentGenerated,
};

