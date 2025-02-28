const { Router } = require("express");
const { loginUser, getUser } = require("../controllers/auth");

const { private } = require("../middlewares/Auth");
const router = Router();

router.get("/my-account", private, getUser);
router.post("/login", loginUser);

module.exports = router;
