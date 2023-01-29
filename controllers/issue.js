const asyncHandler = require("express-async-handler");
const IssueModel = require("../model/Issues");

const createIssue = asyncHandler(async (req, res) => {
  const issue = new IssueModel({ ...req.body });
  const { _id, title, description, priority, createdAt } = await issue.save();

  res.status(201).json({
    _id,
    title,
    description,
    priority,
    createdAt,
  });
});

const fetchIssues = asyncHandler(async (req, res) => {
  const issues = await IssueModel.find();

  res.status(200).json(issues);
});

const deleteIssues = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const issue = await IssueModel.findByIdAndDelete(id);

  res.status(200).json(issue);
});

module.exports = {
  createIssue,
  fetchIssues,
  deleteIssues,
};
