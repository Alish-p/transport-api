import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import {
  getTask,
  createTask,
  updateTask,
  deleteTask,
  addSubtask,
  reorderTasks,
  fetchAllTasks,
  deleteSubtask,
  addActivityToTask,
  fetchTasksByStatus,
  toggleSubtaskComplete,
} from './task.controller.js';

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
