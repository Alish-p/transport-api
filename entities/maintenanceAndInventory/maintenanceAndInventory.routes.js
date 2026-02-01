import express from 'express';
import Tenant from '../tenant/tenant.model.js';
import partRouter from './part/part.routes.js';
import partLocationRouter from './partLocation/partLocation.routes.js';
import partStockRouter from './partStock/partStock.routes.js';
import purchaseOrderRouter from './purchaseOrder/purchaseOrder.routes.js';
import vendorRouter from './vendor/vendor.routes.js';
import workOrderRouter from './workOrder/workOrder.routes.js';

const router = express.Router();

// Middleware to check integration
const checkMaintenanceIntegration = async (req, res, next) => {
    try {
        // req.tenant is an ObjectId from the auth middleware
        const tenantId = req.tenant;
        if (!tenantId) {
            // If tenant is not present, it might be a superuser or public route, 
            // but this module is strictly for tenants.
            // However, the auth middleware should have handled this.
            return res.status(401).json({ message: "Tenant ID not found" });
        }

        const tenant = await Tenant.findById(tenantId);
        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        if (tenant.integrations && tenant.integrations.maintenanceAndInventory && tenant.integrations.maintenanceAndInventory.enabled) {
            next();
        } else {
            return res.status(403).json({ message: "Maintenance & Inventory integration is not enabled for this tenant." });
        }
    } catch (error) {
        next(error);
    }
};

// Apply middleware to all routes in this module
router.use(checkMaintenanceIntegration);

router.use('/parts', partRouter);
router.use('/part-locations', partLocationRouter);
router.use('/purchase-orders', purchaseOrderRouter);
router.use('/vendors', vendorRouter);
router.use('/work-orders', workOrderRouter);
router.use('/part-stock', partStockRouter);

export default router;
