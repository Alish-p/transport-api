const { Router } = require("express");
const { loginUser, registerUser, getUser } = require("../controllers/user");

const { private } = require("../middlewares/Auth");
const router = Router();

router.post("/", registerUser);
router.get("/my-account", private, getUser);
router.post("/login", loginUser);

module.exports = router;
