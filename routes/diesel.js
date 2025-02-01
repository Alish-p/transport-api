const { Router } = require("express");
const {
  createDieselPrice,
  fetchDieselPrices,
  deleteDieselPrice,
  updateDieselPrice,
  fetchDieselPrice,
} = require("../controllers/diesel");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createDieselPrice);
router.get("/", fetchDieselPrices);
router.get("/:id", fetchDieselPrice);
router.delete("/:id", deleteDieselPrice);
router.put("/:id", updateDieselPrice);

module.exports = router;
