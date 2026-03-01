import mongoose from 'mongoose';
import Trip from './trip.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Expense from '../expense/expense.model.js';

export const recalculateTripFinancials = async (tripId, tenant) => {
    if (!tripId) return;

    // 1. Fetch all subtrips for this trip
    const subtrips = await Subtrip.find({ tripId, tenant }).lean();
    const subtripIds = subtrips.map(st => st._id);

    // 2. Fetch all expenses linked to this trip and its subtrips
    const expenses = await Expense.find({
        tenant,
        $or: [
            { tripId },
            { subtripId: { $in: subtripIds } },
        ]
    }).lean();

    // 3. Aggregate totals
    let totalIncome = 0;
    let totalExpense = 0;
    let totalDieselLtr = 0;

    subtrips.forEach((st) => {
        if (typeof st.freightAmount === "number") {
            totalIncome += st.freightAmount;
        } else if (st.rate && st.loadingWeight) {
            totalIncome += st.rate * st.loadingWeight;
        }
    });

    expenses.forEach(exp => {
        totalExpense += (exp.amount || 0);
        if (exp?.expenseType?.toLowerCase() === "diesel") {
            totalDieselLtr += (exp.dieselLtr || 0);
        }
    });

    // 4. Update the Trip directly with these aggregated cache fields 
    await Trip.findOneAndUpdate(
        { _id: tripId, tenant },
        {
            $set: {
                cachedTotalIncome: totalIncome,
                cachedTotalExpense: totalExpense,
                cachedTotalDieselLtr: totalDieselLtr,
            }
        },
        { new: true }
    );

    return { totalIncome, totalExpense, totalDieselLtr };
};
