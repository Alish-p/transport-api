const { CONFIG } = require("../constants/CONFIG");

const calculateTransporterPayment = (subtrip) => {
  if (!subtrip) return null;

  const rate = subtrip.rate || 0;
  const commissionRate = subtrip.commissionRate || 0;
  const effectiveFreightRate = rate - commissionRate;
  const loadingWeight = subtrip.loadingWeight || 0;

  // 🚛 Total Freight
  const totalFreightAmount = effectiveFreightRate * loadingWeight;

  // ⛽ Total Expenses
  const totalExpense =
    Array.isArray(subtrip.expenses) && subtrip.expenses.length > 0
      ? subtrip.expenses.reduce((acc, exp) => acc + (exp.amount || 0), 0)
      : 0;

  // 📉 Shortage Deduction
  const totalShortageAmount = subtrip.shortageAmount || 0;

  // 💰 Final Payment to Transporter
  const totalTransporterPayment =
    totalFreightAmount - totalExpense - totalShortageAmount;

  return {
    effectiveFreightRate,
    totalFreightAmount,
    totalExpense,
    totalShortageAmount,
    totalTransporterPayment,
  };
};

// 🛠 Calculate tax breakup based on transporter state
const calculateTaxBreakup = (transporter, totalAmountBeforeTax) => {
  const taxRate = CONFIG.transporterInvoiceTax || 6; // default GST rate
  const tdsRate = transporter?.tdsPercentage || 0;
  const tdsAmount = (totalAmountBeforeTax * tdsRate) / 100;

  if (!transporter?.state) {
    throw new Error("Transporter state is required to calculate tax breakup.");
  }

  // 🚫 GST not applicable — return only TDS
  if (!transporter?.gstEnabled) {
    return {
      cgst: { rate: 0, amount: 0 },
      sgst: { rate: 0, amount: 0 },
      igst: { rate: 0, amount: 0 },
      tds: { rate: tdsRate, amount: tdsAmount },
      totalTax: tdsAmount,
    };
  }

  const isIntraState = transporter.state.toLowerCase() === "karnataka";

  if (isIntraState) {
    const taxAmount = (totalAmountBeforeTax * taxRate) / 100;
    return {
      cgst: { rate: taxRate, amount: taxAmount },
      sgst: { rate: taxRate, amount: taxAmount },
      igst: { rate: 0, amount: 0 },
      tds: { rate: tdsRate, amount: tdsAmount },
      totalTax: 2 * taxAmount + tdsAmount,
    };
  } else {
    const igstRate = 2 * taxRate;
    const igstAmount = (totalAmountBeforeTax * igstRate) / 100;
    return {
      cgst: { rate: 0, amount: 0 },
      sgst: { rate: 0, amount: 0 },
      igst: { rate: igstRate, amount: igstAmount },
      tds: { rate: tdsRate, amount: tdsAmount },
      totalTax: igstAmount + tdsAmount,
    };
  }
};

const calculateTransporterPaymentSummary = (
  input,
  transporter,
  additionalCharges
) => {
  const subtrips = input?.associatedSubtrips || [];
  if (!Array.isArray(subtrips) || subtrips.length === 0) {
    return {
      totalTripWiseIncome: 0,
      totalFreightAmount: 0,
      totalExpense: 0,
      totalShortageAmount: 0,
      totalTax: 0,
      totalAfterTax: 0,
      netIncome: 0,
      taxBreakup: {
        cgst: { rate: 0, amount: 0 },
        sgst: { rate: 0, amount: 0 },
        igst: { rate: 0, amount: 0 },
        tds: { rate: 0, amount: 0 },
        totalTax: 0,
      },
    };
  }

  let totalFreightAmount = 0;
  let totalExpense = 0;
  let totalShortageAmount = 0;

  for (const subtrip of subtrips) {
    const {
      totalFreightAmount: freight,
      totalExpense: expense,
      totalShortageAmount: shortage,
    } = calculateTransporterPayment(subtrip);

    totalFreightAmount += freight;
    totalExpense += expense;
    totalShortageAmount += shortage;
  }

  const preTaxIncome = totalFreightAmount - totalExpense - totalShortageAmount;
  const taxBreakup = calculateTaxBreakup(transporter, totalFreightAmount);
  const totalTax = taxBreakup.totalTax || 0;

  const totalAdditionalCharges = additionalCharges.reduce(
    (acc, ch) => acc + ch.amount,
    0
  );

  const netIncome = preTaxIncome - totalTax - totalAdditionalCharges;

  return {
    totalTripWiseIncome:
      totalFreightAmount - totalExpense - totalShortageAmount,
    totalFreightAmount,
    totalExpense,
    totalShortageAmount,
    totalAdditionalCharges,
    totalTax,
    netIncome,
    taxBreakup,
  };
};

module.exports = {
  calculateTransporterPayment,
  calculateTaxBreakup,
  calculateTransporterPaymentSummary,
};
