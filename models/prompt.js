import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Prompt = sequelize.define("Prompt", {
  type: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      isIn: [['greeting', 'conversation', 'evaluation']]
    }
  },
  content: { 
    type: DataTypes.TEXT, 
    allowNull: false 
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

sequelize.sync();

export const savePrompt = async (type, content) => {
  return await Prompt.create({ type, content });
};

export const getPromptByType = async (type) => {
  return await Prompt.findOne({ 
    where: { type, isActive: true },
    order: [['createdAt', 'DESC']]
  });
};

export const getAllPromptsByType = async (type) => {
  return await Prompt.findAll({ 
    where: { type },
    order: [['createdAt', 'DESC']]
  });
};

export const activatePrompt = async (id) => {
  // First, deactivate all prompts of the same type
  const prompt = await Prompt.findByPk(id);
  if (!prompt) {
    throw new Error('Prompt not found');
  }
  
  await Prompt.update(
    { isActive: false },
    { where: { type: prompt.type } }
  );
  
  // Then activate the selected prompt
  return await Prompt.update(
    { isActive: true },
    { where: { id } }
  );
};

export default Prompt;