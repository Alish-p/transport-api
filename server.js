const express = require("express");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/ErrorHandler");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 5001;
const app = express();

const cors = require("cors");

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
const transporterPaymentRouter = require("./routes/transporterPayment");

const lrRouter = require("./routes/lr");
const accountRouter = require("./routes/user");

connectDB();

app.use(express.json());
app.use(cors());

// Routers
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
app.use("/api/transporter-payments", transporterPaymentRouter);

// authentication
app.use("/api/account", accountRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
