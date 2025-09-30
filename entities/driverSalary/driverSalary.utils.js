/**
 * Calculate driver income for a single subtrip based on 'driver-salary' type expenses.
 * @param {Object} subtrip - Subtrip document containing an 'expenses' array.
 * @returns {number} Total driver salary amount from the subtrip.
 */

function calculateDriverSalary(subtrip) {
  if (!subtrip?.expenses || !Array.isArray(subtrip.expenses)) {
    return 0;
  }

  // Filter only the expenses of type 'driver-salary'
  const driverSalaryExpenses = subtrip.expenses.filter(
    (expense) => expense.expenseType === "Driver Salary"
  );

  // Sum up the amounts of those expenses
  return driverSalaryExpenses.reduce(
    (acc, expense) => acc + (expense.amount || 0),
    0
  );
}

/**
 * Summarize driver salary across multiple subtrips,
 * incorporating additional payments and deductions.
 *
 * @param {Object} params
 * @param {Array<Object>} params.associatedSubtrips - Array of subtrip documents.
 * @param {Object} driver - Driver document (reserved for future use).
 * @param {Array<{label: string, amount: number}>} additionalPayments
 * @param {Array<{label: string, amount: number}>} additionalDeductions
 * @returns {Object} Summary containing totals and net income.
 */
function calculateDriverSalarySummary(
  { associatedSubtrips },
  driver,
  additionalPayments = [],
  additionalDeductions = []
) {
  // Total income across all subtrips
  const totalTripWiseIncome = Array.isArray(associatedSubtrips)
    ? associatedSubtrips.reduce(
      (sum, subtrip) => sum + calculateDriverSalary(subtrip),
      0
    )
    : 0;

  // Sum of all additional payments
  const totalAdditionalPayments = Array.isArray(additionalPayments)
    ? additionalPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    : 0;

  // Sum of all deductions
  const totalDeductions = Array.isArray(additionalDeductions)
    ? additionalDeductions.reduce((sum, d) => sum + (d.amount || 0), 0)
    : 0;

  // Net income calculation
  const netIncome =
    totalTripWiseIncome + totalAdditionalPayments - totalDeductions;

  return {
    totalTripWiseIncome,
    totalAdditionalPayments,
    totalDeductions,
    netIncome,
  };
}

export {
  calculateDriverSalary,
  calculateDriverSalarySummary,
};
