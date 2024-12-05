// src/utils/dbConnection.ts
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();
// Create a new connection to a specific MongoDB database
const chatRoomDBConnection = mongoose.createConnection(process.env.CHATROOM_MONGO_URI!);

chatRoomDBConnection.on('connected', () => {
  console.log('Connected to Chatbot Database');
});

export default chatRoomDBConnection;
