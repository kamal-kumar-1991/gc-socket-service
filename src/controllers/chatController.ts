// src/controllers/chatController.ts
import chatbotDBConnection from '../utils/chatRoomConnection';
import { createChatScriptModel } from '../models/chatScript';

interface IUser {
  user_id: string;    // Unique user identifier
  name: string;       // User's display name
  role: string;       // User's role, e.g., "viewer", "sender", etc.
  photo?: string;     // Optional user photo URL
}
// Create ChatScript model using the specific connection
const ChatScript = createChatScriptModel(chatbotDBConnection);

// Example function to save a chat message
export const saveChatMessage = async (data: any) => {
  const newChatScript = new ChatScript(data);

  await newChatScript.save();
  console.log('ChatScript saved:', newChatScript);
};

export const updateMessageReactions = async (msg_id: string, emoji: string, user: IUser) => {
  const message = await ChatScript.findOne({ msg_id: msg_id });

  if (!message) {
    throw new Error("Message not found");
  }

  // Find the reaction by emoji
  const reactionIndex = message.reactions.findIndex((reaction) => reaction.emoji === emoji);
  console.log(reactionIndex);
  if (reactionIndex > -1) {
    // If reaction with emoji exists, toggle the user in the users array

    if (message.reactions[reactionIndex].user.user_id = user.user_id) {
      // If user already reacted with this emoji, remove them (toggle off)
      if (message.reactions[reactionIndex].emoji == emoji) {
        message.reactions.splice(reactionIndex, 1);
      }
      else {
        message.reactions[reactionIndex].emoji = emoji;
      }
    } else {
      message.reactions.push({ emoji, user: user });
    }
  } else {
    // If reaction with this emoji doesn't exist, create it with the user
    message.reactions.push({ emoji, user: user });
  }

  // Save and return the updated message with the new reactions
  await message.save();
  return message;
};