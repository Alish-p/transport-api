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
import { authenticate } from "../../middlewares/auth.js";

const router = express.Router();

router.use(authenticate);

router.route("/bulk").post(createBulkTyres);

router.route("/").post(createTyre).get(pagination, getTyres);


router.route("/:id").get(getTyreById).put(updateTyre);

router.route("/:id/thread").post(updateThreadDepth);

router.route("/:id/mount").post(mountTyre);

router.route("/:id/unmount").post(unmountTyre);

router.route("/:id/history").get(getTyreHistory);

router.route("/:id/history/:historyId").put(updateTyreHistory);

router.route("/:id/scrap").post(scrapTyre);
router.route("/:id/remold").post(remoldTyre);

export default router;
