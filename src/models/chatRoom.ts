// src/models/chatRoom.ts
import mongoose, { Schema, Document, Connection } from 'mongoose';

// Enum for Chat Room Status
const ChatRoomStatusEnum = ['active', 'idle', 'expired'] as const;

// Interface for ChatRoom Document
interface IChatRoom extends Document {
  cluster_id: mongoose.Types.ObjectId;
  cluster_num: string;
  account_id: mongoose.Types.ObjectId;
  account_num: string;
  account_name: string;
  chatbot_id: mongoose.Types.ObjectId;
  chatbot_num: string;
  chatbot_name: string;
  chatroom_name: string;
  status: typeof ChatRoomStatusEnum[number];
  intent: Record<string, any>;
  host: string;
  domain: string;
  capacity: {
    users: number;
    bots: number;
    agents: number;
    viewers: number;
  };
  in_session: {
    users: number;
    bots: number;
    agents: number;
    viewers: number;
  };
  track: {
    created: Date;
    started: Date;
    expired: Date;
  };
}

// ChatRoom Schema Definition
const chatRoomSchema: Schema = new Schema({
  cluster_id: { type: mongoose.Schema.Types.ObjectId, ref: 'cluster', required: true },
  cluster_num: { type: String, required: true },  
  account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  account_num: { type: String, required: true, index: true },
  account_name: { type: String, required: true, index: true },
  
  chatbot_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  chatbot_num: { type: String, required: true, index: true },
  chatbot_name: { type: String, required: true, index: true },
  
  chatroom_name: { type: String, required: true },
  status: { type: String, enum: ChatRoomStatusEnum, required: true, index: true },
  
  intent: { type: Schema.Types.Mixed, default: {} },  // Flexible intent object
  
  host: { type: String, required: false, index: true },
  domain: { type: String, required: true },
  
  capacity: {
    users: { type: Number, default: 50 },
    bots: { type: Number, default: 1 },
    agents: { type: Number, default: 2 },
    viewers: { type: Number, default: 50 }
  },
  
  in_session: {
    users: { type: Number, default: 0 },
    bots: { type: Number, default: 0 },
    agents: { type: Number, default: 0 },
    viewers: { type: Number, default: 0 }
  },
  
  track: {
    created: { type: Date, default: Date.now },
    started: { type: Date },
    expired: { type: Date, index: true }
  }
},{ versionKey: false });

// Create indexes on important fields
chatRoomSchema.index({ account_num: 1, chatbot_num: 1, host: 1, 'track.started': 1, 'track.expired': 1 });

// // ChatRoom model
// const ChatRoom = mongoose.

// export default ChatRoom;


export const createChatRoomModel = (connection: Connection) => {
  return connection.model<IChatRoom>("ChatRoom", chatRoomSchema, 'col_chatrooms' );
};
