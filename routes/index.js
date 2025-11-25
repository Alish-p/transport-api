import express from 'express';

import customerRouter from '../entities/customer/customer.routes.js';
import dashboardRouter from '../entities/dashboard/dashboard.routes.js';
import driverRouter from '../entities/driver/driver.routes.js';
import driverSalaryRouter from '../entities/driverSalary/driverSalary.routes.js';
import expenseRouter from '../entities/expense/expense.routes.js';
import gpsRouter from '../entities/gps/gps.routes.js';
import invoiceRouter from '../entities/invoice/invoice.routes.js';
import loanRouter from '../entities/loan/loan.routes.js';
import pumpRouter from '../entities/pump/pump.routes.js';
import subtripRouter from '../entities/subtrip/subtrip.routes.js';
import subtripEventRouter from '../entities/subtripEvent/subtripEvent.routes.js';
import taskRouter from '../entities/task/task.routes.js';
import tenantRouter from '../entities/tenant/tenant.routes.js';
import transporterRouter from '../entities/transporter/transporter.routes.js';
import transporterPaymentRouter from '../entities/transporterPayment/transporterPayment.routes.js';
import tripRouter from '../entities/trip/trip.routes.js';
import userRouter from '../entities/user/user.routes.js';
import authRouter from '../entities/user/auth.routes.js';
import vehicleRouter from '../entities/vehicle/vehicle.routes.js';
import vehicleDocumentRouter from '../entities/vehicleDocument/vehicleDocument.routes.js';
import ewayBillRouter from '../entities/ewaybill/ewaybill.routes.js';
import publicRouter from './public.routes.js';
import lookupRouter from '../entities/lookup/gst.routes.js';
import challanRouter from '../entities/challan/challan.routes.js';
import superuserRouter from '../entities/superuser/superuser.routes.js';
import partRouter from '../entities/part/part.routes.js';
import partLocationRouter from '../entities/part/partLocation.routes.js';
import purchaseOrderRouter from '../entities/purchaseOrder/purchaseOrder.routes.js';
import vendorRouter from '../entities/vendor/vendor.routes.js';

const router = express.Router();

router.use('/dashboard', dashboardRouter);

router.use('/vehicles', vehicleRouter);
router.use('/documents', vehicleDocumentRouter);
router.use('/transporters', transporterRouter);
router.use('/drivers', driverRouter);
router.use('/customers', customerRouter);
router.use('/pumps', pumpRouter);
router.use('/trips', tripRouter);
router.use('/subtrips', subtripRouter);
router.use('/expenses', expenseRouter);
router.use('/invoices', invoiceRouter);
router.use('/driverPayroll', driverSalaryRouter);
router.use('/loans', loanRouter);
router.use('/transporter-payments', transporterPaymentRouter);
router.use('/subtrip-events', subtripEventRouter);
router.use('/tenants', tenantRouter);
router.use('/users', userRouter);
router.use('/tasks', taskRouter);
router.use('/gps', gpsRouter);
router.use('/ewaybill', ewayBillRouter);
router.use('/challans', challanRouter);
router.use('/public', publicRouter);
router.use('/lookup', lookupRouter);

//Vehicle Maintenance 
router.use('/parts', partRouter);
router.use('/part-locations', partLocationRouter);
router.use('/vendors', vendorRouter);
router.use('/purchase-orders', purchaseOrderRouter);

// Superuser-only endpoints
router.use('/super', superuserRouter);

// authentication
router.use('/account', authRouter);

export default router;
