// src/models/chatScript.ts
import { Connection, Schema, Document } from 'mongoose';

interface IUser {
  user_id: string;    // Unique user identifier
  name: string;       // User's display name
  role: string;       // User's role, e.g., "viewer", "sender", etc.
  photo?: string;     // Optional user photo URL
}

// Interface for ChatScript Document
interface IChatScript extends Document {
  msg_id : string,
  account_id: string;
  chatbot_id: string;
  chatroom_id: string;
  sender: IUser;
  msg: Record<string, any>;
  reactions: {
    emoji: string;
    user: IUser; // List of full user objects
  }[];
  reaction_cnt : {};
  posted: Date;
}

// ChatScript Schema Definition
const chatScriptSchema: Schema = new Schema({
  msg_id : { type: String, required: false },
  account_id: { type: String, required: false }, // Reference to Account
  chatbot_id: { type: Schema.Types.ObjectId, ref: 'Chatbot', required: false, index: true }, // Reference to Chatbot
  chatroom_id: { type: String, required: false, index: true }, // Reference to Chatroom
  sender: {
    user_id: { type: String, required: false },
    name: { type: String, required: false },
    role: { type: String, required: false },
    photo: { type: String }
  },
  msg: { type: Schema.Types.Mixed, required: false }, // Message content object (varied structure)
  reactions: [
    {  
      emoji: { type: String, required: true },
      user: 
        {
          user_id: { type: String, required: false },
          name: { type: String, required: false },
          role: { type: String, required: false },
          photo: { type: String }
        }
      
    }
  ],
  reaction_cnt : {type : Object, required: false},
  posted: { type: Date, default: Date.now, required: false } // Date when the message was posted
},{ versionKey: false });

// Indexing for faster querying
chatScriptSchema.index({ account_id: 1, chatbot_id: 1, chatroom_id: 1, 'sender.user_ref': 1 });

// Function to create the model with a specified connection
export const createChatScriptModel = (connection: Connection) => {
  return connection.model<IChatScript>('ChatScript', chatScriptSchema, 'col_chatscripts') ;
};
