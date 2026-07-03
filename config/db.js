import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
    });
    console.log("Database Connected !");
  } catch (error) {
    console.log(error);
    console.log("Error Connecting to database");
    process.exit(1);
  }
};

export default connectDB;
