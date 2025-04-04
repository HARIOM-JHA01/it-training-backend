import { savePrompt, getPromptByType, getAllPromptsByType, activatePrompt } from "../models/prompt.js";
import { greetingPrompt, conversationPrompt, evaluationPrompt } from "../utils/prompt.js";

// Get all prompts of a specific type
export const getPrompts = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!type || !['greeting', 'conversation', 'evaluation'].includes(type)) {
      return res.status(400).json({ error: "Valid prompt type is required (greeting, conversation, or evaluation)" });
    }
    
    const prompts = await getAllPromptsByType(type);
    res.json(prompts);
  } catch (error) {
    console.error("Get Prompts Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// Create a new prompt
export const createPrompt = async (req, res) => {
  try {
    const { type, content } = req.body;
    
    if (!type || !['greeting', 'conversation', 'evaluation'].includes(type)) {
      return res.status(400).json({ error: "Valid prompt type is required (greeting, conversation, or evaluation)" });
    }
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: "Prompt content is required" });
    }
    
    const prompt = await savePrompt(type, content);
    res.status(201).json(prompt);
  } catch (error) {
    console.error("Create Prompt Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// Activate a specific prompt
export const setActivePrompt = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "Prompt ID is required" });
    }
    
    await activatePrompt(id);
    res.json({ message: "Prompt activated successfully" });
  } catch (error) {
    console.error("Activate Prompt Error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get the currently active prompt of a specific type
export const getActivePrompt = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!type || !['greeting', 'conversation', 'evaluation'].includes(type)) {
      return res.status(400).json({ error: "Valid prompt type is required (greeting, conversation, or evaluation)" });
    }
    
    const prompt = await getPromptByType(type);
    
    if (!prompt) {
      // If no custom prompt is active, return the default prompt
      let defaultPrompt;
      switch (type) {
        case 'greeting':
          defaultPrompt = greetingPrompt('${name}');
          break;
        case 'conversation':
          defaultPrompt = conversationPrompt([], '${userInput}');
          break;
        case 'evaluation':
          defaultPrompt = evaluationPrompt([]);
          break;
      }
      
      return res.json({ 
        isDefault: true, 
        content: defaultPrompt,
        type
      });
    }
    
    res.json({
      ...prompt.dataValues,
      isDefault: false
    });
  } catch (error) {
    console.error("Get Active Prompt Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};