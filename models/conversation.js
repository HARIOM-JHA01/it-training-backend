import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Conversation = sequelize.define("Conversation", {
  userMessage: { type: DataTypes.TEXT, allowNull: false },
  aiResponse: { type: DataTypes.TEXT, allowNull: false },
});

sequelize.sync();

export const saveConversation = async (userMessage, aiResponse) => {
  await Conversation.create({ userMessage, aiResponse });
};

export default Conversation;
