const express = require("express");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/ErrorHandler");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();

const cors = require("cors");

const studentRouter = require("./routes/student");
const userRouter = require("./routes/user");
const waitingRouter = require("./routes/waiting");

connectDB();

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:3000", "https://urban-api-7x8e.onrender.com"],
  })
);

app.use("/api/students", studentRouter);
app.use("/api/users", userRouter);
app.use("/api/waitings", waitingRouter);

if (process.env.NODE_ENV === "production") {
  // app.use(express.static(path.join(__dirname, "../frontend/build")));

  app.get("/", (req, res) => {
    res.send("API is running....");
  });
} else {
  app.get("/", (req, res) => {
    res.send("API is running....");
  });
}

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
