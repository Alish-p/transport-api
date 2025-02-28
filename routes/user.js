const { Router } = require("express");
const {
  createUser,
  fetchUsers,
  deleteUser,
  updateUser,
  fetchUser,
} = require("../controllers/user");

const { private } = require("../middlewares/Auth");
const router = Router();

router.post("/", createUser);
router.get("/", fetchUsers);
router.delete("/:id", deleteUser);
router.put("/:id", updateUser);
router.get("/:id", fetchUser);
module.exports = router;
