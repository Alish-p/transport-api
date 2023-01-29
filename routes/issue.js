const express = require("express");
const router = express.Router();
const {
  createIssue,
  deleteIssues,
  fetchIssues,
} = require("../controllers/issue");
const { private } = require("../middlewares/Auth");

router.post("/", private, createIssue);
router.get("/", private, fetchIssues);
router.delete("/:id", private, deleteIssues);

module.exports = router;
