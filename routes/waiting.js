const express = require("express");
const router = express.Router();
const {
  addWaiting,
  deleteWaiting,
  fetchWaitings,
} = require("../controllers/waiting");
const { private } = require("../middlewares/Auth");

router.post("/", private, addWaiting);
router.get("/", private, fetchWaitings);
router.delete("/:id", private, deleteWaiting);

module.exports = router;
