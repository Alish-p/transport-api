const Task = require("../model/Task");
const asyncHandler = require("express-async-handler");

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
exports.createTask = asyncHandler(async (req, res) => {
  const task = await Task.create({
    ...req.body,
    reporter: req.user._id,
  });

  // Add initial activity
  task.activities.push({
    user: req.user._id,
    action: "created",
    message: "Task created",
  });

  await task.save();

  res.status(201).json(task);
});

// @desc    Update a task
// @route   PUT /api/tasks/:taskId
// @access  Private
exports.updateTask = asyncHandler(async (req, res) => {
  const { status, assignees } = req.body;

  let task = await Task.findById(req.params.taskId);

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  // Handle assignees array - extract _ids
  if (assignees) {
    req.body.assignees = assignees.map((user) => user._id);
  }

  // Add activity for status change if status is being updated
  if (status && status !== task.status) {
    console.log({ status, taskStatus: task.status });

    task.activities.push({
      user: req.user._id,
      action: "status_changed",
      message: `Status changed from ${task.status} to ${status}`,
      timestamp: new Date(),
    });

    task.status = status; // Ensure the status is updated in memory
  }

  // Update other fields if present in req.body
  Object.keys(req.body).forEach((key) => {
    if (key !== "status") {
      task[key] = req.body[key];
    }
  });

  // Save the updated task, which includes the new activity log
  await task.save();

  res.json(task);
});

// @desc    Get a single task
// @route   GET /api/tasks/:taskId
// @access  Private
exports.getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId)
    .populate("reporter", "name email")
    .populate("assignees", "name email")
    .populate("activities.user", "name email");

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  res.json({
    success: true,
    data: task,
  });
});

// @desc    Delete a task
// @route   DELETE /api/tasks/:taskId
// @access  Private
exports.deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  await task.remove();

  res.json({
    success: true,
    data: {},
  });
});

// @desc    Add activity to task
// @route   POST /api/tasks/:taskId/activity
// @access  Private
exports.addActivityToTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  const activity = {
    user: req.user._id,
    action: req.body.action,
    message: req.body.message,
  };

  task.activities.push(activity);
  await task.save();

  res.json({
    success: true,
    data: task,
  });
});

// @desc    Fetch tasks grouped by status
// @route   GET /api/tasks/grouped/status
// @access  Private
exports.fetchTasksByStatus = asyncHandler(async (req, res) => {
  const tasks = await Task.aggregate([
    {
      $match: {}, // You can add conditions here if needed
    },
    {
      $group: {
        _id: "$status",
        tasks: { $push: "$$ROOT" },
      },
    },
    {
      $project: {
        status: "$_id",
        tasks: 1,
        _id: 0,
      },
    },
  ]);

  // Convert to more friendly format
  const formattedTasks = tasks.reduce((acc, curr) => {
    acc[curr.status] = curr.tasks;
    return acc;
  }, {});

  res.json({
    success: true,
    data: formattedTasks,
  });
});

// @desc    Fetch all tasks with filters
// @route   GET /api/tasks
// @access  Private
exports.fetchAllTasks = asyncHandler(async (req, res) => {
  const { status, priority, department, assignees } = req.query;

  // Build query
  const query = {};

  // Add filters if they exist
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (department) query.department = department;
  if (assignees) query.assignees = assignees;

  const tasks = await Task.find(query)
    .populate("reporter", "name email")
    .populate("assignees", "name email")
    .populate("activities.user", "name email")
    .populate("vehicle", "vehicleNumber")
    .populate("driver", "name phoneNumber")
    .sort({ updatedAt: -1 });

  // Group tasks by status
  const groupedTasks = {
    todo: tasks.filter((task) => task.status.toLowerCase() === "todo"),
    "in-progress": tasks.filter(
      (task) => task.status.toLowerCase() === "in-progress"
    ),
    done: tasks.filter((task) => task.status.toLowerCase() === "done"),
  };

  res.json(groupedTasks);
});
