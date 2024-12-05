import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

// Create a new connection to a specific MongoDB database
const infraDBConnection = mongoose.createConnection(process.env.INFRA_MONGO_URI!);

infraDBConnection.on('connected', () => {
  console.log('Connected to infra Database');
});

export default infraDBConnection;
