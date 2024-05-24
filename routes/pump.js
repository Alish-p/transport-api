const { Router } = require("express");
const {
  createPump,
  fetchPumps,
  deletePump,
  updatePump,
} = require("../controllers/pump");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createPump);
router.get("/", fetchPumps);
router.delete("/:id", deletePump);
router.put("/:id", updatePump);

module.exports = router;
