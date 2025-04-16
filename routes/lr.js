const { Router } = require("express");
const {
  createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  fetchLoadedSubtrips,
  updateSubtrip,
  deleteSubtrip,
  addMaterialInfo,
  receiveLR,
  closeSubtrip,
  resolveLR,
  createEmptySubtrip,
  closeEmptySubtrip,
  fetchLoadedAndInQueueSubtrips,
} = require("../controllers/subtrip");

const { private } = require("../middlewares/Auth");
const router = Router();

router.post("/", private, createSubtrip);
router.get("/", private, fetchSubtrips);
router.get("/loaded", private, fetchLoadedSubtrips);
router.get("/loaded-in-queue", private, fetchLoadedAndInQueueSubtrips);
router.get("/:id", private, fetchSubtrip);

router.put("/:id", private, updateSubtrip);
router.delete("/:id", private, deleteSubtrip);

router.put("/:id/material-info", private, addMaterialInfo);
router.put("/:id/receive", private, receiveLR);
router.put("/:id/resolve", private, resolveLR);
router.put("/:id/close", private, closeSubtrip);

router.post("/empty", private, createEmptySubtrip);
router.put("/:id/close-empty", private, closeEmptySubtrip);

module.exports = router;
