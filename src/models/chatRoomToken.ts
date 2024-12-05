// src/models/chatRoomToken.ts
import mongoose, {Connection,  Schema, Document } from 'mongoose';

// Interface for Token Document
interface IToken extends Document {
  chatbot_id: mongoose.Types.ObjectId;
  chatroom_id: mongoose.Types.ObjectId;
  user_ref: string;
  name: string;
  role: string;
  issued: Date;
  expiry: Date;
}

// Token Schema Definition
const tokenSchema: Schema = new Schema({
  chatbot_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  user_ref: { type: String, required: true },      // User reference
  name: { type: String, required: true },          // User's name
  role: { type: String, required: true },          // User's role (e.g., viewer, sender, etc.)
  issued: { type: Date, default: Date.now },       // Issued time (default to now)
  expiry: { type: Date, required: true },          // Expiry time of the token
},{ versionKey: false });

// // Token model
// const Token = mongoose.model<IToken>("Token", tokenSchema,'col_chatroom_tokens');

// export default Token;

export const createTokenModel = (connection: Connection) => {
  return connection.model<IToken>("Token", tokenSchema,'col_chatroom_tokens');
};
