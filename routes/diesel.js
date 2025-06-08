const { Router } = require("express");
const {
  createDieselPrice,
  fetchDieselPrices,
  deleteDieselPrice,
  updateDieselPrice,
  fetchDieselPrice,
  fetchDieselPriceOnDate,
} = require("../controllers/diesel");

const { private, admin, checkPermission } = require("../middlewares/Auth");
const router = Router();

router.post("/", private, checkPermission("diesel", "create"), createDieselPrice);
router.get("/", private, fetchDieselPrices);
router.get("/:pump/:date", private, fetchDieselPriceOnDate);
router.get("/:id", private, fetchDieselPrice);
router.delete("/:id", private, checkPermission("diesel", "delete"), deleteDieselPrice);
router.put("/:id", private, checkPermission("diesel", "update"), updateDieselPrice);

module.exports = router;
