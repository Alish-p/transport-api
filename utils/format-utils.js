// Generic formatting helpers used across services

// Keep only digits from a string
const trimToDigits = (val = "") => String(val).replace(/\D/g, "");

// Format a phone to a digits-only international string (no +),
// defaulting to country code when a 10-digit local number is provided.
const formatPhoneE164ish = (
  phone,
  defaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE || "91"
) => {
  if (!phone) return null;
  let digits = trimToDigits(phone);
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  return digits;
};

// Format numbers for Indian currency grouping without symbol
const formatCurrencyINR = (amount) => {
  try {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
      Number(amount || 0)
    );
  } catch (_) {
    return String(amount || 0);
  }
};

// Format date as DD Mon YYYY (e.g., 08 Oct 2025)
const formatDateDDMonYYYY = (date) => {
  try {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (_) {
    return "";
  }
};

export { trimToDigits, formatPhoneE164ish, formatCurrencyINR, formatDateDDMonYYYY };

