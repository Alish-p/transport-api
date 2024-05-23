const { Router } = require("express");
const {
  createRoute,
  fetchRoutes,
  deleteRoute,
  updateRoute,
} = require("../controllers/route");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createRoute);
router.get("/", fetchRoutes);
router.delete("/:id", deleteRoute);
router.put("/:id", updateRoute);

module.exports = router;
