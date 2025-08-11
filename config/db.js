const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
    });
    console.log("Database Connected !");
  } catch (error) {
    console.log(error);
    console.log("Error Connecting to database");
    process.exit(1);
  }
};

module.exports = connectDB;
