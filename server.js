const express = require("express");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/ErrorHandler");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 5001;
const app = express();

const cors = require("cors");
const helmet = require("helmet");

// Add CORS options
const corsOptions = {
  origin: ["https://transport-rewrite.onrender.com", "http://localhost:3031"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.use(helmet());
// app.use(compression());

const dashboardRouter = require("./routes/dashboard");
const vehicleRouter = require("./routes/vehicle");
const transporterRouter = require("./routes/transporter");
const driverRouter = require("./routes/driver");
const customerRouter = require("./routes/customer");
const bankRouter = require("./routes/bank");
const pumpRouter = require("./routes/pump");
const dieselPriceRouter = require("./routes/diesel");
const routeRouter = require("./routes/route");
const tripRouter = require("./routes/trip");
const expenseRouter = require("./routes/expense");
const invoiceRouter = require("./routes/invoice");
const driverSalaryRouter = require("./routes/driverSalary");
const loanRouter = require("./routes/loan");
const transporterPaymentRouter = require("./routes/transporterPayment");
const lrRouter = require("./routes/lr");
const userRouter = require("./routes/user");
const authRouter = require("./routes/auth");
const taskRouter = require("./routes/task");

connectDB();

app.use(express.json());

// ratelimits
const limiter = rateLimit({
  windowMs: 2 * 60 * 1000, //  100 reqs in 2 minutes only
  max: 100,
  message: "Too many requests from this Devices, please try again later.",
  headers: true,
});

app.use(limiter);

// Routers
app.use("/api/dashboard", dashboardRouter);

app.use("/api/vehicles", vehicleRouter);
app.use("/api/transporters", transporterRouter);
app.use("/api/drivers", driverRouter);
app.use("/api/customers", customerRouter);
app.use("/api/banks", bankRouter);
app.use("/api/pumps", pumpRouter);
app.use("/api/diesel-prices", dieselPriceRouter);
app.use("/api/routes", routeRouter);
app.use("/api/trips", tripRouter);
app.use("/api/subtrips", lrRouter);
app.use("/api/expenses", expenseRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/driverPayroll", driverSalaryRouter);
app.use("/api/loans", loanRouter);
app.use("/api/transporter-payments", transporterPaymentRouter);
app.use("/api/users", userRouter);
app.use("/api/tasks", taskRouter);

// authentication
app.use("/api/account", authRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
