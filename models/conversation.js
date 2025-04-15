import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Conversation = sequelize.define("Conversation", {
  userMessage: { type: DataTypes.TEXT, allowNull: false },
  aiResponse: { type: DataTypes.TEXT, allowNull: false },
  interactionStep: { type: DataTypes.INTEGER, defaultValue: 1 },
});

sequelize.sync();

export const saveConversation = async (userMessage, aiResponse, interactionStep = 1) => {
  await Conversation.create({ userMessage, aiResponse, interactionStep });
};

export default Conversation;
