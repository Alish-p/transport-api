import { CONFIG } from '../../constants/CONFIG.js';

// 🛠 Calculate totals for a single subtrip
const calculateInvoicePerSubtrip = (subtrip) => {
  const freightAmount = (subtrip.rate || 0) * (subtrip.loadingWeight || 0);
  const shortageAmount = subtrip.shortageAmount || 0;
  const totalAmount = freightAmount; // shortage we are not deduting just showing it separately

  return {
    freightAmount,
    shortageAmount,
    totalAmount,
  };
};

// 🛠 Calculate tax breakup based on tenant and customer state
const calculateTaxBreakup = (customer, totalAmountBeforeTax, tenantState) => {
  const taxRate = CONFIG.customerInvoiceTax || 6; // default to 6%

  // 🚫 GST not applicable — return only TDS
  if (!customer?.gstEnabled) {
    return {
      cgst: { rate: 0, amount: 0 },
      sgst: { rate: 0, amount: 0 },
      igst: { rate: 0, amount: 0 },
      totalTax: 0,
    };
  }

  if (!customer?.state) {
    throw new Error("Customer state is required to calculate tax breakup.");
  }

  if (!tenantState) {
    throw new Error("Tenant state is required to calculate tax breakup.");
  }

  const isIntraState =
    customer.state.trim().toLowerCase() === tenantState.trim().toLowerCase();

  if (isIntraState) {
    return {
      cgst: {
        rate: taxRate,
        amount: (totalAmountBeforeTax * taxRate) / 100,
      },
      sgst: {
        rate: taxRate,
        amount: (totalAmountBeforeTax * taxRate) / 100,
      },
      igst: {
        rate: 0,
        amount: 0,
      },
    };
  } else {
    return {
      cgst: {
        rate: 0,
        amount: 0,
      },
      sgst: {
        rate: 0,
        amount: 0,
      },
      igst: {
        rate: 2 * taxRate, // igst is double
        amount: (totalAmountBeforeTax * 2 * taxRate) / 100,
      },
    };
  }
};

// 🛠 Calculate full invoice summary (including tax breakup and final total)
const calculateInvoiceSummary = (invoice, customer, tenantState) => {
  if (!invoice?.invoicedSubTrips || !Array.isArray(invoice.invoicedSubTrips)) {
    return {
      totalAmountBeforeTax: 0,
      totalFreightAmount: 0,
      totalShortageAmount: 0,
      totalFreightWt: 0,
      totalShortageWt: 0,
      totalTax: 0,
      totalAfterTax: 0,
      taxBreakup: {
        cgst: { rate: 0, amount: 0 },
        sgst: { rate: 0, amount: 0 },
        igst: { rate: 0, amount: 0 },
      },
      totalAdditionalCharges: 0,
      netTotal: 0,
    };
  }

  const subtripTotals = invoice.invoicedSubTrips.map((subtrip) => {
    const { freightAmount, shortageAmount, totalAmount } =
      calculateInvoicePerSubtrip(subtrip);
    const shortageWeight = subtrip.shortageWeight || 0;

    return {
      freightAmount,
      shortageAmount,
      totalAmount,
      freightWeight: subtrip.loadingWeight || 0,
      shortageWeight,
    };
  });

  // Totals
  const totalAmountBeforeTax = subtripTotals.reduce(
    (sum, st) => sum + st.totalAmount,
    0
  );
  const totalFreightAmount = subtripTotals.reduce(
    (sum, st) => sum + st.freightAmount,
    0
  );
  const totalShortageAmount = subtripTotals.reduce(
    (sum, st) => sum + st.shortageAmount,
    0
  );
  const totalFreightWt = subtripTotals.reduce(
    (sum, st) => sum + st.freightWeight,
    0
  );
  const totalShortageWt = subtripTotals.reduce(
    (sum, st) => sum + st.shortageWeight,
    0
  );

  // 👇 Calculate tax breakup dynamically
  const taxBreakup = calculateTaxBreakup(
    customer,
    totalAmountBeforeTax,
    tenantState
  );

  // 👇 Total tax amount
  const totalTax =
    (taxBreakup.cgst?.amount || 0) +
    (taxBreakup.sgst?.amount || 0) +
    (taxBreakup.igst?.amount || 0);

  // 👇 Total amount after tax
  const totalAfterTax = totalAmountBeforeTax + totalTax;

  const totalAdditionalCharges = Array.isArray(invoice.additionalCharges)
    ? invoice.additionalCharges.reduce((sum, ch) => sum + (ch.amount || 0), 0)
    : 0;

  const netTotal = totalAfterTax + totalAdditionalCharges;

  return {
    totalAmountBeforeTax,
    totalFreightAmount,
    totalShortageAmount,
    totalFreightWt,
    totalShortageWt,
    totalTax,
    totalAfterTax,
    totalAdditionalCharges,
    netTotal,
    taxBreakup,
  };
};

export { calculateInvoiceSummary,
  calculateTaxBreakup, };
