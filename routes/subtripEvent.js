const { Router } = require("express");
const { fetchSubtripEvents } = require("../controllers/subtripEvent");
const { private } = require("../middlewares/Auth");

const router = Router();

router.get("/:subtripId", private, fetchSubtripEvents);

module.exports = router;
