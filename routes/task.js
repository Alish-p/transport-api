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
  addSubtask,
  toggleSubtaskComplete,
  deleteSubtask,
} = require("../controllers/task");
const { private } = require("../middlewares/Auth");

// Task routes
router.get("/", private, fetchAllTasks);
router.post("/", private, createTask);
router.put("/:taskId", private, updateTask);
router.get("/:taskId", private, getTask);
router.delete("/:taskId", private, deleteTask);
router.post("/:taskId/activity", private, addActivityToTask);
router.get("/grouped/status", private, fetchTasksByStatus);

// Subtask routes
router.post("/:taskId/subtasks", private, addSubtask);
router.patch("/:taskId/subtasks/:subtaskId", private, toggleSubtaskComplete);
router.delete("/:taskId/subtasks/:subtaskId", private, deleteSubtask);

module.exports = router;
