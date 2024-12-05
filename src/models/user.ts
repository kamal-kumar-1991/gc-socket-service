// src/models/user.ts
import mongoose, { Schema, Document, Connection } from 'mongoose';

// Interface for User Document
interface IUser extends Document {
  account_id: mongoose.Types.ObjectId;
  account_num: string;
  chatbot_id: mongoose.Types.ObjectId;
  chatbot_num: string;
  chatroom_id: mongoose.Types.ObjectId;
  status: string;
  user_ref: string;
  name: string;
  ip: string;
  user_agent: string;
  photo: string;
  role: 'viewer' | 'sender' | 'bot' | 'agent';
  qualified: {
    phone?: string;
    email?: string;
    tag?: string;
  };
  intent: Record<string, any>;
  referral: {
    gclid?: string;
    fbclid?: string;
    utm_campaign?: string;
    utm_source?: string;
    utm_medium?: string;
  };
  delivery: Array<{
    extn: string;
    action: string;
    status: string;
    track: {
      queued: Date;
      sent?: Date;
      failed?: Date;
      reason?: string;
    };
  }>;
  track: {
    assigned: Date;
    connected?: Date;
    disconnected?: Date;
  };
}

// User Schema Definition
const userSchema: Schema = new Schema({
  account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  account_num: { type: String, required: true, index: true },
  chatbot_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatbot', required: true },
  chatbot_num: { type: String, required: true, index: true },
  chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  
  status: { type: String, required: true, index: true },  // Chat Room User Status
  user_ref: { type: String, required: true },              // User authentication reference
  name: { type: String, required: true },                  // User's name
  ip: { type: String, required: true },                    // User's IP address
  user_agent: { type: String, required: true },            // User's user agent
  photo: { type: String },                                 // Profile picture URL
  role: { type: String, enum: ['viewer', 'sender', 'bot', 'agent'], required: true }, // User role
  
  qualified: {                                             // Qualified lead data
    phone: { type: String },
    email: { type: String },
    tag: { type: String }
  },
  
  intent: { type: Schema.Types.Mixed, default: {} },       // User's intent
  
  referral: {                                              // Referral tracking information
    gclid: { type: String },
    fbclid: { type: String },
    utm_campaign: { type: String },
    utm_source: { type: String },
    utm_medium: { type: String }
  },
  
  delivery: [{                                             // Delivery tracking for qualified leads
    extn: { type: String },
    action: { type: String },
    status: { type: String },
    track: {
      queued: { type: Date, required: true },
      sent: { type: Date },
      failed: { type: Date },
      reason: { type: String }
    }
  }],
  
  track: {                                                 // User connection tracking
    assigned: { type: Date, required: true },
    connected: { type: Date },
    disconnected: { type: Date }
  }
},{ versionKey: false });

// Create indexes on important fields
userSchema.index({ account_num: 1, chatbot_num: 1, chatroom_id: 1, status: 1 });

export const createUserModel = (connection: Connection) => {
  return connection.model<IUser>("User", userSchema, 'col_chatroom_users');
};
