const { Router } = require("express");
const {
  createRoute,
  fetchRoutes,
  deleteRoute,
  updateRoute,
  fetchSingleRoute,
} = require("../controllers/route");

const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

router.post("/", private, checkPermission("route", "create"), createRoute);
router.get("/", private, pagination, fetchRoutes);
router.get("/:id", private, fetchSingleRoute);
router.delete("/:id", private, checkPermission("route", "delete"), deleteRoute);
router.put("/:id", private, checkPermission("route", "update"), updateRoute);

module.exports = router;
