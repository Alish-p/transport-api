import { Router } from 'express';
import { getDashboardHighlights,
  getCustomerMonthlyFreight,
  getExpiringSubtrips,
  getTotalCounts,
  getSubtripMonthlyData,
  getMonthlySubtripExpenseSummary,
  getMonthlyMaterialWeightSummary,
  getMonthlyVehicleSubtripSummary,
  getMonthlyDriverSummary,
  getMonthlyTransporterSummary,
  getSubtripStatusSummary,
  getLoanSchedule,
  getVehicleUtilization,
  getFinancialMonthlyData,
  getInvoiceStatusSummary,
  getTopRoutes,
  getTransporterPaymentTotals,
  getInvoiceAmountSummary, } from './dashboard.controller.js';

import { authenticate } from '../../middlewares/Auth.js';

const router = Router();

router.get("/counts", authenticate, getTotalCounts);
router.get("/loan-schedule", authenticate, getLoanSchedule);
router.get("/highlights", authenticate, getDashboardHighlights);
router.get("/subtrips-expiry", authenticate, getExpiringSubtrips);
router.get("/vehicle-utilization", authenticate, getVehicleUtilization);
router.get("/subtrip-monthly-data", authenticate, getSubtripMonthlyData);
router.get("/subtrip-status-summary", authenticate, getSubtripStatusSummary);
router.get("/invoice-status-summary", authenticate, getInvoiceStatusSummary);
router.get("/financial-monthly-data", authenticate, getFinancialMonthlyData);
router.get("/customer-monthly-freight", authenticate, getCustomerMonthlyFreight);
router.get("/top-routes", authenticate, getTopRoutes);
router.get(
  "/grouped/monthly-expense",
  authenticate,
  getMonthlySubtripExpenseSummary
);
router.get(
  "/grouped/monthly-material-weight",
  authenticate,
  getMonthlyMaterialWeightSummary
);
router.get(
  "/grouped/monthly-vehicle-subtrips",
  authenticate,
  getMonthlyVehicleSubtripSummary
);
router.get(
  "/grouped/monthly-driver-subtrips",
  authenticate,
  getMonthlyDriverSummary
);
router.get(
  "/grouped/monthly-transporter-subtrips",
  authenticate,
  getMonthlyTransporterSummary
);
router.get("/invoice-amount-summary", authenticate, getInvoiceAmountSummary);
router.get(
  "/transporter-payment-summary",
  authenticate,
  getTransporterPaymentTotals
);

export default router;
