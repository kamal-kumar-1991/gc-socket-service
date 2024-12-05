// src/socketServer.ts
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { publishToQueue, consumeFromQueue } from "./utils/rabbitMQ";
import jwt from "jsonwebtoken";
import { createTokenModel } from "./models/chatRoomToken"; // Token model
import { createChatRoomModel } from "./models/chatRoom"; // Chat Room model
import infraDBConnection from "./utils/infraDBConnection";
import { createChatbotModel } from "./models/chatbot"; // Chat Room model
import chatRoomDBConnection from "./utils/chatRoomConnection";
import { saveChatMessage, updateMessageReactions } from "./controllers/chatController";
import { publishMessage } from "./publish";
import dotenv from 'dotenv';
dotenv.config();

const Token = createTokenModel(chatRoomDBConnection);
const ChatBot = createChatbotModel(infraDBConnection);
const ChatRoom = createChatRoomModel(infraDBConnection);

const io = new Server(parseInt(process.env.PORT!), {
  cors: {
    origin: "*", // Allow CORS for all origins
  },
});

interface IUser {
  user_id: string;    // Unique user identifier
  name: string;       // User's display name
  role: string;       // User's role, e.g., "viewer", "sender", etc.
  photo?: string;     // Optional user photo URL
}
const MESSAGE_QUEUE = "chatroom_messages"; // RabbitMQ queue name

// Maintain chat history and connected users
const chatHistory: { [key: string]: any[] } = {};
const connectedUsers: { [key: string]: Map<string, IUser> } = {}; // Map of chatroom_id -> (socket.id -> user_ref)

// Handle WebSocket connection events
io.on("connection", (socket) => {
  socket.on("user_joining", async (token: string) => {
    try {
      // Decode and validate token
      const decodedToken: any = jwt.verify(token, process.env.JWT_SECRET!);
      const chatroom_id = decodedToken.chatroom_id;
      const user_ref = decodedToken.user.user_ref;
      const user_role = decodedToken.user.role || 'viewer';
      const chatToken = await Token.findOne({ token_id: decodedToken.token_id });
      const user: IUser = {
        user_id: decodedToken.user.user_ref,
        name: decodedToken.user.name,
        role: decodedToken.user.role,
        photo: decodedToken.user.photo
      };
      if (!chatToken) {
        // If the token is invalid or doesn't exist, emit error and disconnect
        socket.emit("error", "Invalid or expired token");
        console.log("Invalid token. Disconnecting socket:", socket.id);
        socket.disconnect();
        return;
      }
      // await Token.findOneAndDelete({ token_id: decodedToken.token_id });

      // Fetch the chatroom from the DB
      const chatRoom = await ChatRoom.findById(chatroom_id);
      if (!chatRoom) {
        socket.emit("error", "Chatroom not found");
        return;
      }

      const chatbot = await ChatBot.findById(chatRoom.chatbot_id);

      if (user_role == 'viewer') {
        if (chatRoom.in_session.viewers >= chatRoom.capacity.viewers) {
          socket.emit("error", "Chatroom is full");
          return;
        }
      }
      if (user_role == 'agent') {
        if (chatRoom.in_session.agents >= chatRoom.capacity.agents) {
          socket.emit("error", "Chatroom is full");
          return;
        }
      }
      // Check if the chatroom has capacity for new users
      if (user_role == 'user') {
        if (chatRoom.in_session.users >= chatRoom.capacity.users) {
          socket.emit("error", "Chatroom is full");
          return;
        }
      }
      if (user_role == 'bot') {
        if (chatRoom.in_session.bots >= chatRoom.capacity.bots) {
          socket.emit("error", "Chatroom is full");
          return;
        }
      }

      if(chatRoom.capacity.bots > 0 && chatRoom.in_session.bots == 0)
      {
          // publish event for RMQ to join AI bots
          await publishMessage(JSON.stringify({
            room_id:chatroom_id,
            processor:chatbot?.preferences.bot.name
          }))
      }

      socket.emit("whoami", user);

      // Initialize the map for connected users if it doesn't exist
      if (!connectedUsers[chatroom_id]) {
        connectedUsers[chatroom_id] = new Map<string, IUser>();
      }

      // Store the socket.id -> user_ref mapping
      connectedUsers[chatroom_id].set(socket.id, user);

      switch (user_role) {
        case 'viewer':
          chatRoom.in_session.viewers = Number(chatRoom.in_session.viewers) + 1;
          break;
        case 'bot':
          chatRoom.in_session.bots = Number(chatRoom.in_session.bots) + 1;
          break;
        case 'agent':
          chatRoom.in_session.agents = Number(chatRoom.in_session.agents) + 1;
          break;
        case 'user':
          chatRoom.in_session.users = Number(chatRoom.in_session.users) + 1;
          break;
        default:
          chatRoom.in_session.viewers = Number(chatRoom.in_session.viewers) + 1;
          break;
      }
      // chatRoom.in_session.users = Number(chatRoom.in_session.users) + 1;
      await chatRoom.save();
      // Send the chat history and connected users list to the user
      socket.emit("show_latest_chat", chatHistory[chatroom_id] || []);
      socket.emit("show_topics", chatbot?.topics || []);
      socket.emit("show_connected_users", Array.from(connectedUsers[chatroom_id].values()) || []);
      socket.emit("room_info", { id: chatroom_id, name: chatRoom.chatroom_name, chatbot_id:chatRoom.chatbot_id})
      // Notify the chatroom that a new user has joined
      socket.to(chatroom_id).emit("user_joined", user);
     
      socket.join(chatroom_id);
    } catch (err) {
      socket.emit("error", "Invalid or expired token");
    }
  });

  socket.on("message", async (args) => {
    try {

      // Decode the token to get user details
      const decodedToken: any = jwt.verify(args.token, process.env.JWT_SECRET!);
      const chatroom_id = decodedToken.chatroom_id;

      const user: IUser = {
        user_id: decodedToken.user.user_ref,
        name: decodedToken.user.name,
        role: decodedToken.user.role,
        photo: decodedToken.user.photo
      };

      let historyData = {
        msg_id: args.msg_id, // Unique message ID
        sender: user,
        msg: args.msg,
        posted:new Date()
      }

      if (args.msg.type == 'reaction') {
        const msg_id = args.msg_id;
        const emoji = args.msg.reaction.emoji;

        // Update reaction on an existing message
        const updatedMessage = await updateMessageReactions(msg_id, emoji, user);

        // Update reaction in chatHistory
        const messageIndex = chatHistory[chatroom_id]?.findIndex((msg) => msg.msg_id === msg_id);
        console.log(messageIndex);
        if (messageIndex > -1) {
          chatHistory[chatroom_id][messageIndex] = { msg_id: updatedMessage.msg_id, sender: updatedMessage.sender, msg: updatedMessage.msg, reaction: updatedMessage.reactions, posted:updatedMessage.posted };
        }
        io.to(chatroom_id).emit("message", {
          msg_id: updatedMessage.msg_id, reaction: updatedMessage.reactions,  posted : updatedMessage.posted
        });
        // Broadcast updated message with reactions to other users
        socket.to(chatroom_id).emit("message", {
          msg_id: updatedMessage.msg_id, reaction: updatedMessage.reactions,  posted : updatedMessage.posted
        });
        // socket.emit("show_latest_chat", chatHistory[chatroom_id] || []);
      }
      else {
        let newMessage = {
          msg_id: args.msg_id, // Unique message ID
          sender: user,
          msg: args.msg,
          posted: new Date(), // Timestamp of the message
          account_id: decodedToken.account_num, // Account ID from the token
          chatbot_id: decodedToken.chatbot_num, // Chatbot ID from the token
          chatroom_id: chatroom_id, // Chatroom ID
        };
        historyData.posted = newMessage.posted;
        // Add the message to the chat history (last 20 messages)
        if (!chatHistory[chatroom_id]) {
          chatHistory[chatroom_id] = [];
        }
        chatHistory[chatroom_id].push(historyData);
        if (chatHistory[chatroom_id].length > parseInt(process.env.CHAT_HISTORY!)) {
          chatHistory[chatroom_id].shift(); // Keep only the last 20 messages
        }
        // await publishToQueue(MESSAGE_QUEUE, newMessage);
        // Broadcast the message to other users in the same chatroom
        socket.to(chatroom_id).emit("message", {
          msg_id: args.msg_id, // Unique message ID
          sender: user,
          msg: args.msg,
          posted : newMessage.posted
        });
        await saveChatMessage(newMessage);
        //socket.emit("show_latest_chat", chatHistory[chatroom_id] || []);
      }

    } catch (err) {
      socket.emit("error", "Message sending failed");
    }
  });

  socket.on("reconnect", async () => {
    console.log("User reconnected:", socket.id);

    const chatroom_id = Object.keys(connectedUsers).find(room =>
      connectedUsers[room].has(socket.id)
    );

    if (chatroom_id) {
      // Re-emit the events after reconnection
      socket.join(chatroom_id);
      const user = connectedUsers[chatroom_id].get(socket.id);
      socket.emit("whoami", user);
      socket.emit("show_latest_chat", chatHistory[chatroom_id] || []);
      socket.emit("show_connected_users", Array.from(connectedUsers[chatroom_id].values()) || []);
      io.to(chatroom_id).emit("user_rejoined", user);
      socket.to(chatroom_id).emit("user_rejoined", user);
    }
  });

  // Handle user disconnecting
  socket.on("disconnect", async () => {
    console.log("socket_id", socket.id);
    console.log("connected users", JSON.stringify(connectedUsers))
    const chatroom_id = Object.keys(connectedUsers).find(room =>
      connectedUsers[room].has(socket.id)
    );

    if (chatroom_id) {      
      const users = Array.from(connectedUsers[chatroom_id].values());
      console.log("disconnected user", users)
      // Remove the user from connectedUsers using socket.id
      connectedUsers[chatroom_id].delete(socket.id);

      // Update the user count in the chatroom
      const chatRoom = await ChatRoom.findById(chatroom_id);
      if (chatRoom) {
        switch (users[0].role) {
          case 'viewer':
            chatRoom.in_session.viewers = Number(chatRoom.in_session.viewers) - 1;
            break;
          case 'bot':
            chatRoom.in_session.bots = Number(chatRoom.in_session.bots) - 1;
            break;
          case 'agent':
            chatRoom.in_session.agents = Number(chatRoom.in_session.agents) - 1;
            break;
          case 'user':
            chatRoom.in_session.users = Number(chatRoom.in_session.users) - 1;
            break;
          default:
            chatRoom.in_session.viewers = Number(chatRoom.in_session.viewers) - 1;
            break;
        }
        console.log("chatroom defination", chatRoom);
        // chatRoom.in_session.users -= 1;
        await chatRoom.save();
      }
      // Notify the chatroom that a user has left
      socket.to(chatroom_id).emit("user_left", users[0]);
    }

    console.log("A user disconnected");
  });
});

console.log("Socket.io server is running on port", process.env.PORT!);

export const messageEmit = (chatroom_id: any, message: any) => {
  io.to(chatroom_id).emit("message", message);
};

const processMessage = async (msg: any) => {
  if (msg) {
    console.log(msg.content);
    const messageContent = JSON.parse(msg.content.toString());

    // Save message to the database
    await saveChatMessage(messageContent);

    // Broadcast the message to the chatroom
    messageEmit(messageContent.chatroom_id, messageContent);
    console.log("Message processed and broadcasted:", messageContent);
  }
};

// Start consuming messages from RabbitMQ
consumeFromQueue(MESSAGE_QUEUE, processMessage);
