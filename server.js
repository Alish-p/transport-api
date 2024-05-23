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
const bankRouter = require("./routes/bank");
const pumpRouter = require("./routes/pump");
const routeRouter = require("./routes/route");

connectDB();

app.use(express.json());
app.use(cors());

// Routers
app.use("/api/vehicles", vehicleRouter);
app.use("/api/transporters", transporterRouter);
app.use("/api/drivers", driverRouter);
app.use("/api/banks", bankRouter);
app.use("/api/pumps", pumpRouter);
app.use("/api/routes", routeRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
