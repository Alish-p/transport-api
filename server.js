/* eslint-disable no-unused-vars */
import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';

import { errorHandler } from './middlewares/ErrorHandler.js';
import dashboardRouter from './routes/dashboard.js';
import vehicleRouter from './entities/vehicle/vehicle.routes.js';
import transporterRouter from './routes/transporter.js';
import driverRouter from './entities/driver/driver.routes.js';
import customerRouter from './entities/customer/customer.routes.js';
import bankRouter from './entities/bank/bank.routes.js';
import pumpRouter from './entities/pump/pump.routes.js';
import dieselPriceRouter from './entities/diesel/diesel.routes.js';
import routeRouter from './entities/route/route.routes.js';
import tripRouter from './routes/trip.js';
import expenseRouter from './entities/expense/expense.routes.js';
import invoiceRouter from './entities/invoice/invoice.routes.js';
import driverSalaryRouter from './entities/driverSalary/driverSalary.routes.js';
import loanRouter from './entities/loan/loan.routes.js';
import transporterPaymentRouter from './entities/transporterPayment/transporterPayment.routes.js';
import subtripEventRouter from './routes/subtripEvent.js';
import subtripRouter from './routes/subtrip.js';
import userRouter from './routes/user.js';
import tenantRouter from './routes/tenant.js';
import authRouter from './routes/auth.js';
import taskRouter from './routes/task.js';
import gpsRouter from './routes/gps.js';

dotenv.config();

const port = process.env.PORT || 5001;
const app = express();

// Add CORS options
const corsOptions = {
  origin: ["https://transport-rewrite.onrender.com", "http://localhost:3031"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.use(helmet());
app.set("query parser", "extended");

// app.use(compression());


connectDB();

app.use(express.json());

// ratelimits
const limiter = rateLimit({
  windowMs: 2 * 60 * 1000, //  100 reqs in 2 minutes only
  max: 200,
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
app.use("/api/subtrips", subtripRouter);
app.use("/api/expenses", expenseRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/driverPayroll", driverSalaryRouter);
app.use("/api/loans", loanRouter);
app.use("/api/transporter-payments", transporterPaymentRouter);
app.use("/api/subtrip-events", subtripEventRouter);
app.use("/api/tenants", tenantRouter);
app.use("/api/users", userRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/gps", gpsRouter);

// authentication
app.use("/api/account", authRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
