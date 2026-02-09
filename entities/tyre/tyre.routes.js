import express from "express";
import {
    createTyre,
    createBulkTyres,
    getTyres,

    getTyreById,
    updateTyre,
    updateThreadDepth,
    mountTyre,
    unmountTyre,
    getTyreHistory,
    scrapTyre,
    updateTyreHistory,
    remoldTyre,
} from "./tyre.controller.js";
import pagination from "../../middlewares/pagination.js";
import { authenticate, checkPermission } from "../../middlewares/auth.js";
import Tenant from "../tenant/tenant.model.js";

const router = express.Router();

router.use(authenticate);

const checkTyreIntegration = async (req, res, next) => {
    try {
        const tenantId = req.tenant;
        if (!tenantId) {
            return res.status(401).json({ message: "Tenant ID not found" });
        }

        const tenant = await Tenant.findById(tenantId);
        if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
        }

        if (tenant.integrations && tenant.integrations.tyre && tenant.integrations.tyre.enabled) {
            next();
        } else {
            return res.status(403).json({ message: "Tyre management integration is not enabled for this tenant." });
        }
    } catch (error) {
        next(error);
    }
};

router.use(checkTyreIntegration);

router.route("/bulk").post(checkPermission("tyre", "create"), createBulkTyres);

router.route("/").post(checkPermission("tyre", "create"), createTyre).get(checkPermission("tyre", "view"), pagination, getTyres);


router.route("/:id").get(checkPermission("tyre", "view"), getTyreById).put(checkPermission("tyre", "update"), updateTyre);

router.route("/:id/thread").post(checkPermission("tyre", "update"), updateThreadDepth);

router.route("/:id/mount").post(checkPermission("tyre", "update"), mountTyre);

router.route("/:id/unmount").post(checkPermission("tyre", "update"), unmountTyre);

router.route("/:id/history").get(checkPermission("tyre", "view"), getTyreHistory);

router.route("/:id/history/:historyId").put(checkPermission("tyre", "update"), updateTyreHistory);

router.route("/:id/scrap").post(checkPermission("tyre", "update"), scrapTyre);
router.route("/:id/remold").post(checkPermission("tyre", "update"), remoldTyre);

export default router;
