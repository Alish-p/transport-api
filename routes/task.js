const express = require("express");
const router = express.Router();
const {
  createTask,
  updateTask,
  getTask,
  deleteTask,
  addActivityToTask,
  fetchTasksByStatus,
  fetchAllTasks,
} = require("../controllers/task");
const { private } = require("../middlewares/Auth");

// Task routes
router.get("/", fetchAllTasks);
router.post("/", private, createTask);
router.put("/:taskId", private, updateTask);
router.get("/:taskId", private, getTask);
router.delete("/:taskId", private, deleteTask);
router.post("/:taskId/activity", private, addActivityToTask);
router.get("/grouped/status", private, fetchTasksByStatus);

module.exports = router;
