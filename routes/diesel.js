const { Router } = require("express");
const {
  createDieselPrice,
  fetchDieselPrices,
  deleteDieselPrice,
  updateDieselPrice,
  fetchDieselPrice,
  fetchDieselPriceOnDate,
} = require("../controllers/diesel");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createDieselPrice);
router.get("/", fetchDieselPrices);
router.get("/:pump/:date", fetchDieselPriceOnDate);
router.get("/:id", fetchDieselPrice);
router.delete("/:id", deleteDieselPrice);
router.put("/:id", updateDieselPrice);

module.exports = router;
