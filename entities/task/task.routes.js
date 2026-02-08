import { Router } from 'express';
import {
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
  reorderTasks,
} from './task.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

// Task routes
router.get("/", authenticate, fetchAllTasks);
router.post("/", authenticate, createTask);
router.put("/:taskId", authenticate, updateTask);
router.get("/:taskId", authenticate, getTask);
router.delete("/:taskId", authenticate, deleteTask);
router.post("/:taskId/activity", authenticate, addActivityToTask);
router.get("/grouped/status", authenticate, fetchTasksByStatus);
router.post("/reorder", authenticate, reorderTasks);

// Subtask routes
router.post("/:taskId/subtasks", authenticate, addSubtask);
router.patch("/:taskId/subtasks/:subtaskId", authenticate, toggleSubtaskComplete);
router.delete("/:taskId/subtasks/:subtaskId", authenticate, deleteSubtask);

export default router;
