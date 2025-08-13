const { Router } = require("express");
const {
  createUser,
  fetchUsers,
  fetchUsersLastSeen,
  deleteUser,
  updateUser,
  fetchUser,
} = require("../controllers/user");

const { private, checkPermission } = require("../middlewares/Auth");

const router = Router();

router.post("/", private, checkPermission("user", "create"), createUser);
router.get("/", private, fetchUsers);
router.get("/last-seen", private, fetchUsersLastSeen);
router.delete("/:id", private, checkPermission("user", "delete"), deleteUser);
router.put("/:id", private, checkPermission("user", "update"), updateUser);
router.get("/:id", private, fetchUser);
module.exports = router;
