// src/controllers/chatRoomController.ts
import { Request, Response } from 'express';
import {createChatRoomModel} from '../models/chatRoom'; // ChatRoom model
import infraDBConnection from '../utils/infraDBConnection';
import chatRoomDBConnection from '../utils/chatRoomConnection';
import { createChatbotModel } from '../models/chatbot';   // Chatbot model
import {createUserModel} from '../models/user';
import {createUserLogModel} from '../models/userLog'; // UserLog model
import {createTokenModel} from '../models/chatRoomToken'; // Token model
import jwt from 'jsonwebtoken'; // JWT for generating tokens
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();
const User = createUserModel(chatRoomDBConnection);
const UserLog = createUserLogModel(chatRoomDBConnection);
const Chatbot = createChatbotModel(infraDBConnection);
const ChatRoom = createChatRoomModel(infraDBConnection);
const Token = createTokenModel(chatRoomDBConnection);

// Create a new chat room under a chatbot
export const createChatRoom = async (req: Request, res: Response) => {
  const { chatbot_num } = req.params;
  const { chatroom_name, intent } = req.body;

  try {
    // Find the chatbot by chatbot_num
    const chatbot = await Chatbot.findOne({ chatbot_num });

    if (!chatbot) {
      return res.status(404).json({
        result: 404,
        msg: 'Chatbot not found',
        data: { chatbot_num }
      });
    }

    // Create the new chat room with idle status and no host/domain
    const newChatRoom = new ChatRoom({
      cluster_id: chatbot.cluster_id,
      cluster_num: chatbot.cluster_num,
      account_id: chatbot.account_id,
      account_num: chatbot.account_num,
      account_name: chatbot.account_name,
      chatbot_id: chatbot._id,
      chatbot_num: chatbot.chatbot_num,
      chatbot_name: chatbot.chatbot_name,
      chatroom_name,
      intent: intent || {}, // Default to empty object if no intent provided
      status: 'idle',       // Idle status
      host: null,           // No host assigned at creation
      domain: chatbot.access.web.domains,         // No domain assigned at creation
      in_session: {
        users: 0,
        bots: 0,
        agents: 0,
        viewers: 0
      },
      capacity: {
        users: chatbot.preferences.users,
        bots: chatbot.preferences.bots,
        agents: chatbot.preferences.agents,
        viewers: chatbot.preferences.viewers
      },
      track: {
        created: new Date()
      }
    });

    // Save the new chat room in the database
    const savedChatRoom = await newChatRoom.save();

    // Return success response
    return res.status(200).json({
      result: 200,
      chatbot: {
        chatbot_id: chatbot._id,
        chatbot_num: chatbot.chatbot_num,
        chatbot_name: chatbot.chatbot_name
      },
      chatroom: {
        chatroom_id: savedChatRoom._id,
        chatroom_name: savedChatRoom.chatroom_name
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      result: 500,
      message: 'Error creating chat room',
      error: "Error creating chat room"
    });
  }
};



// Get all chat rooms for a specific chatbot with filters and pagination
export const getChatRooms = async (req: Request, res: Response) => {
  const { chatbot_num } = req.params;
  const { status, page_length = 20, page_num = 1 } = req.query;

  try {
    // Find the chatbot by chatbot_num to ensure it exists
    const chatbot = await Chatbot.findOne({ chatbot_num });

    if (!chatbot) {
      return res.status(404).json({
        result: 404,
        msg: 'Chatbot not found',
        data: { chatbot_num }
      });
    }

    // Build query to find chat rooms
    const query: any = { chatbot_num };

    // Apply status filter if provided
    if (status) {
      query.status = status;
    }

    // Pagination logic
    const limit = parseInt(page_length as string, 10) || 20;  // Default to 20
    const page = parseInt(page_num as string, 10) || 1;       // Default to page 1
    const skip = (page - 1) * limit;

    // Find the total count of chat rooms matching the query
    const total = await ChatRoom.countDocuments(query);

    // Find chat rooms with pagination
    const chatrooms = await ChatRoom.find(query)
      .skip(skip)
      .limit(limit);

    // Respond with paginated chat rooms
    return res.status(200).json({
      result: 200,
      page_length: limit,
      page_num: page,
      total,
      chatrooms: chatrooms.map(chatroom => ({
        chatroom_id: chatroom._id,
        cluster_id: chatroom.cluster_id,
        cluster_num: chatroom.cluster_num,
        account_id: chatroom.account_id,
        account_num: chatroom.account_num,
        account_name: chatroom.account_name,
        chatbot_id: chatroom.chatbot_id,
        chatbot_num: chatroom.chatbot_num,
        chatbot_name: chatroom.chatbot_name,
        chatroom_name: chatroom.chatroom_name,
        status: chatroom.status,
        intent: chatroom.intent,
        host: chatroom.host,
        domain: chatroom.domain,
        capacity: chatroom.capacity,
        in_session: chatroom.in_session,
        track: chatroom.track
      }))
    });
  } catch (error) {
    return res.status(500).json({
      result: 500,
      message: 'Error retrieving chat rooms',
      error: "error.message"
    });
  }
};

// Search chat rooms across accounts and chatbots with filters, sorting, and pagination
export const searchChatRooms = async (req: Request, res: Response) => {
  const { filter = {}, sort = {}, page = { length: 10, num: 1 } } = req.body;

  // Check for X-Action: search header
  if (req.headers['x-action'] !== 'search') {
    return res.status(400).json({ result: 400, message: 'Invalid action header' });
  }

  try {
    // Build the query object dynamically based on the filter provided
    const query: any = {};

    if (filter.cluster_id) query.cluster_id = filter.cluster_id;
    if (filter.account_num) query.account_num = filter.account_num;
    if (filter.account_id) query.account_id = filter.account_id;
    if (filter.chatbot_num) query.chatbot_num = filter.chatbot_num;
    if (filter.chatbot_id) query.chatbot_id = filter.chatbot_id;
    if (filter.chatroom_id) query._id = filter.chatroom_id; // _id field corresponds to chatroom_id
    if (filter.host) query.host = filter.host;
    if (filter.domain) query.domain = filter.domain;
    if (filter.status) query.status = filter.status;

    // Pagination logic
    const limit = page.length || 10;
    const pageNum = page.num || 1;
    const skip = (pageNum - 1) * limit;

    // Sorting logic
    const sortOptions: any = {};
    for (const [key, value] of Object.entries(sort)) {
      sortOptions[key] = value; // Sorting by specified fields
    }

    // Query the total number of chat rooms matching the filter
    const total = await ChatRoom.countDocuments(query);

    // Fetch the chat rooms based on the filter, sorting, and pagination
    const chatrooms = await ChatRoom.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    // Return the paginated chat rooms list
    return res.status(200).json({
      result: 200,
      page_length: limit,
      page_num: pageNum,
      total,
      chatrooms: chatrooms.map(chatroom => ({
        chatroom_id: chatroom._id,
        cluster_id: chatroom.cluster_id,
        cluster_num: chatroom.cluster_num,
        account_id: chatroom.account_id,
        account_num: chatroom.account_num,
        account_name: chatroom.account_name,
        chatbot_id: chatroom.chatbot_id,
        chatbot_num: chatroom.chatbot_num,
        chatbot_name: chatroom.chatbot_name,
        chatroom_name: chatroom.chatroom_name,
        status: chatroom.status,
        intent: chatroom.intent,
        host: chatroom.host,
        domain: chatroom.domain,
        capacity: chatroom.capacity,
        in_session: chatroom.in_session,
        track: chatroom.track
      }))
    });
  } catch (error) {
    return res.status(500).json({
      result: 500,
      message: 'Error searching chat rooms',
      error: "error.message"
    });
  }
};


// Get a single chat room by chatroom_id
export const getChatRoomById = async (req: Request, res: Response) => {
  const { chatroom_id } = req.params;

  try {
    // Find chat room by its _id
    const chatroom = await ChatRoom.findById(chatroom_id);

    // If chat room is not found
    if (!chatroom) {
      return res.status(404).json({
        result: 404,
        error: 1008,
        msg: 'Chatroom not found',
        desc: 'Specified Chatroom is invalid.',
        data: {
          chatroom_id
        }
      });
    }

    // Return chat room information
    return res.status(200).json({
      result: 200,
      chatroom: {
        chatroom_id: chatroom._id,
        cluster_id: chatroom.cluster_id,
        cluster_num: chatroom.cluster_num,
        account_id: chatroom.account_id,
        account_num: chatroom.account_num,
        account_name: chatroom.account_name,
        chatbot_id: chatroom.chatbot_id,
        chatbot_num: chatroom.chatbot_num,
        chatbot_name: chatroom.chatbot_name,
        chatroom_name: chatroom.chatroom_name,
        status: chatroom.status,
        intent: chatroom.intent,
        host: chatroom.host,
        domain: chatroom.domain,
        capacity: chatroom.capacity,
        in_session: chatroom.in_session,
        track: chatroom.track
      }
    });
  } catch (error) {
    return res.status(500).json({
      result: 500,
      message: 'Error retrieving chat room',
      error: "error.message"
    });
  }
};

// Get connected users of a chat room
export const getConnectedUsers = async (req: Request, res: Response) => {
  const { chatroom_id } = req.params;
  const { role, page_length = 20, page_num = 1 } = req.query;

  try {
    // Find the chat room by chatroom_id
    const chatroom = await ChatRoom.findById(chatroom_id);

    if (!chatroom) {
      return res.status(404).json({
        result: 404,
        error: 1008,
        msg: 'Chatroom not found',
        desc: 'Specified Chatroom is invalid.',
        data: {
          chatroom_id
        }
      });
    }

    // Build the query to find connected users
    const query: any = { chatroom_id };

    // If role is provided, filter by role
    if (role) {
      query.role = role;
    }

    // Pagination
    const limit = parseInt(page_length as string, 10) || 20;
    const page = parseInt(page_num as string, 10) || 1;
    const skip = (page - 1) * limit;

    // Find total number of users matching the query
    const total = await User.countDocuments(query);

    // Retrieve connected users based on filters and pagination
    const users = await User.find(query)
      .skip(skip)
      .limit(limit);

    // Respond with the paginated user data
    return res.status(200).json({
      result: 200,
      page_length: limit,
      page_num: page,
      total,
      users: users.map(user => ({
        user_id: user._id,
        status: user.status,
        user_ref: user.user_ref,
        name: user.name,
        ip: user.ip,
        user_agent: user.user_agent,
        photo: user.photo,
        role: user.role,
        qualified: user.qualified,
        intent: user.intent,
        referral: user.referral,
        track: user.track
      }))
    });
  } catch (error) {
    return res.status(500).json({
      result: 500,
      message: 'Error retrieving users',
      error: "error.message"
    });
  }
};




// Get user movements (entry/exit logs) in a chat room
export const getUserMovements = async (req: Request, res: Response) => {
  const { chatroom_id } = req.params;
  const { role, page_length = 20, page_num = 1 } = req.query;

  try {
    // Pagination
    const limit = parseInt(page_length as string, 10) || 20;
    const page = parseInt(page_num as string, 10) || 1;
    const skip = (page - 1) * limit;

    // Build query to fetch user movements
    const query: any = { chatroom_id };

    // If role is provided, filter by role
    if (role) {
      query.role = role;
    }

    // Count the total number of logs
    const total = await UserLog.countDocuments(query);

    // Fetch the logs with pagination
    const logs = await UserLog.find(query)
      .skip(skip)
      .limit(limit);

    // Respond with the logs
    return res.status(200).json({
      result: 200,
      page_length: limit,
      page_num: page,
      total,
      logs: logs.map(log => ({
        user_id: log.user_id,
        user_ref: log.user_ref,
        name: log.name,
        role: log.role,
        ip: log.ip,
        user_agent: log.user_agent,
        track: log.track
      }))
    });
  } catch (error) {
    return res.status(500).json({
      result: 500,
      message: 'Error retrieving user movements',
      error: "error.message"
    });
  }
};





// Function to find or create a chat room and generate a token
export const findRoom = async (req: Request, res: Response) => {
  const { chatbot_num } = req.params;
  const { user, intent } = req.body;

  try {
    let chatroom;
    if(intent && Object.keys(intent).length ===  0)
    {
       chatroom = await ChatRoom.findOne({
        "chatbot_num":chatbot_num,       
        $expr: {
          $gt: ["$capacity.users", "$in_session.users"] // Compare capacity.users and in_session.users
        }
      });
    }
    else{
       chatroom = await ChatRoom.findOne({
        "chatbot_num":chatbot_num,  
        'intent': { $eq: intent },        
        $expr: {
          $gt: ["$capacity.users", "$in_session.users"] // Compare capacity.users and in_session.users
        }
      });
    }
    // Step 1: Search for an existing chat room that matches the intent and has available seats
    

    // Step 2: If no matching room, create a new one
    if (!chatroom) {
      const chatbot = await Chatbot.findOne({ chatbot_num });

      if (!chatbot) {
        return res.status(404).json({
          result: 404,
          msg: 'Chatbot not found',
          data: { chatbot_num }
        });
      }

      // Create the new chat room with idle status and no host/domain
      chatroom = new ChatRoom({
        cluster_id: chatbot.cluster_id,
        cluster_num: chatbot.cluster_num,
        account_id: chatbot.account_id,
        account_num: chatbot.account_num,
        account_name: chatbot.account_name,
        chatbot_id: chatbot._id,
        chatbot_num: chatbot.chatbot_num,
        chatbot_name: chatbot.chatbot_name,
        chatroom_name: chatbot.chatbot_name,
        intent: intent || {}, // Default to empty object if no intent provided
        status: 'idle',       // Idle status
        host: null,           // No host assigned at creation
        domain: chatbot.access.web.domains,         // No domain assigned at creation
        in_session: {
          users: 0,
          bots: 0,
          agents: 0,
          viewers: 0
        },
        capacity: {
          users: chatbot.preferences.users,
          bots: chatbot.preferences.bots,
          agents: chatbot.preferences.agents,
          viewers: chatbot.preferences.viewers
        },
        track: {
          created: new Date()
        }
      });

      // Save the new chat room in the database
      await chatroom.save();
    }

    // Step 3: Generate a signed JWT token for the user to join the chat room
    const tokenData = {
      token_id: new mongoose.Types.ObjectId().toString(),
      chatbot_id : chatroom.chatbot_id,
      account_num: chatroom.account_num,
      chatbot_num: chatroom.chatbot_num,
      chatroom_id: chatroom._id.toString(),
      host: chatroom.host || 'default-host', // If no host is assigned, return a default
      domain: chatroom.domain || 'chat.example.com',   
      expiry: Math.floor(Date.now() / 1000) + (60 * 30), // Token expires in 30 minutes
      user: {
        user_ref: user.user_ref,
        name: user.name || 'viewer', // Use "Guest" if no name is provided
        role: user.role,
        ip: user.ip,
        user_agent: user.user_agent
      },
      intent
    };

    const token = jwt.sign(tokenData, process.env.JWT_SECRET!, {
      expiresIn: '30m' // Token valid for 30 minutes
    });

    // Step 4: Store the token in the token collection for validation later
    const newTokenEntry = new Token({
      token_id: tokenData.token_id,
      chatbot_id: chatroom.chatbot_id,
      chatroom_id: chatroom._id,
      host: chatroom.host || 'default-host', // If no host is assigned, return a default
      domain: chatroom.domain || 'chat.example.com',     
      user_ref: user.user_ref,
      name: user.name || 'viewer',
      role: user.role || 'viewer',
      issued: new Date(),
      expiry: new Date(Date.now() + 30 * 60000), // Expiry in 30 minutes
    });

    await newTokenEntry.save();

    // Step 5: Respond with the token and chat room details
    return res.status(200).json({
      result: 200,
      token,
      url: `https://${chatroom.domain}?token=${token}`, // URL to join the room
      data: {
        host: chatroom.host || 'default-host', // If no host is assigned, return a default
        domain: chatroom.domain || 'chat.example.com',
        chatroom_id: chatroom._id.toString(),
        role: user.role || 'viewer',
        name: user.name || 'viewer'
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      result: 500,
      message: 'Error finding or creating room',
      error: "error.message"
    });
  }
};




// Function to generate a token for accessing a known chat room
export const getRoomToken = async (req: Request, res: Response) => {
  const { chatroom_id } = req.params;
  const { user, intent } = req.body;

  try {
    // Step 1: Retrieve the chat room by chatroom_id
    const chatroom = await ChatRoom.findById(chatroom_id);

    if (!chatroom) {
      return res.status(404).json({
        result: 404,
        msg: 'Chatroom not found',
        data: {
          chatroom_id
        }
      });
    }

    // Step 2: Generate a signed JWT token for the user to join the chat room
    const tokenData = {
      token_id: new mongoose.Types.ObjectId().toString(),
      chatbot_id: chatroom.chatbot_id.toString(),
      chatroom_id: chatroom._id.toString(),
      account_num: chatroom.account_num,
      chatbot_num: chatroom.chatbot_num,
      host: chatroom.host || 'default-host', // If no host is assigned, return a default
      domain: chatroom.domain || 'chat.example.com',  
      expiry: Math.floor(Date.now() / 1000) + (60 * 30), // Token expires in 30 minutes
      user: {
        user_ref: user.user_ref,
        name: user.name || 'viewer', // Default to "Guest" for viewer role
        role: user.role || 'viewer ',
        ip: user.ip,
        user_agent: user.user_agent
      },
      intent
    };

    const token = jwt.sign(tokenData, process.env.JWT_SECRET!, {
      expiresIn: '30m' // Token valid for 30 minutes
    });

    // Step 3: Store the token in the token collection for validation later
    const newTokenEntry = new Token({
      token_id: tokenData.token_id,
      chatbot_id: chatroom.chatbot_id,
      chatroom_id: chatroom._id,
      host: chatroom.host || 'default-host', // If no host is assigned, return a default
      domain: chatroom.domain || 'chat.example.com',
      user_ref: user.user_ref,
      name: user.name || 'Guest',
      role: user.role,
      issued: new Date(),
      expiry: new Date(Date.now() + 30 * 60000), // Expiry in 30 minutes
    });

    await newTokenEntry.save();

    // Step 4: Respond with the token and chat room details
    return res.status(200).json({
      result: 200,
      token,
      url: `https://${chatroom.domain}?token=${token}`, // URL to join the room
      data: {
        host: chatroom.host || 'default-host', // If no host is assigned, return a default
        domain: chatroom.domain || 'chat.example.com',
        chatroom_id: chatroom._id.toString(),
        role: user.role || 'viewer',
        name: user.name || 'viewer'
      }
    });
  } catch (error) {
    return res.status(500).json({
      result: 500,
      message: 'Error generating room token',
      error: "error.message"
    });
  }
};

