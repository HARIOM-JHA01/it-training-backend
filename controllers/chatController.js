import { queryOllama } from "../config/ollama.js";
import { saveConversation } from "../models/conversation.js";
import { greetingPrompt, conversationPrompt, evaluationPrompt } from "../utils/prompt.js";

export const startChat = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    
    const prompt = greetingPrompt(name);
    const aiResponse = await queryOllama(prompt);
    await saveConversation("System: Start Chat", aiResponse);
    res.json({ aiResponse });
  } catch (error) {
    console.error("Start Chat Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const respondChat = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const { conversationHistory, userMessage } = req.body;
    
    if (!userMessage) {
      return res.status(400).json({ error: "User message is required." });
    }
    
    const prompt = conversationPrompt(conversationHistory, userMessage);
    const aiResponse = await queryOllama(prompt);
    await saveConversation(userMessage, aiResponse);

    res.json({ aiResponse });
  } catch (error) {
    console.error("Respond Chat Error:", error);
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON in request body" });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }
};

const parseEvaluationResponse = (response) => {
  try {
    // Try to parse the response directly
    return JSON.parse(response);
  } catch (error) {
    // If direct parsing fails, try to extract JSON from the response
    try {
      // Find the first '{' and last '}'
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error('No JSON object found in response');
      }
      
      const jsonStr = response.slice(jsonStart, jsonEnd);
      return JSON.parse(jsonStr);
    } catch (extractError) {
      throw new Error('Failed to parse evaluation response as JSON');
    }
  }
};

const validateEvaluation = (evaluation) => {
  const requiredFields = ['evaluation', 'overallFeedback'];
  const requiredEvaluationFields = ['clarity', 'professionalism', 'problemSolving', 'communication'];
  const requiredFeedbackFields = ['strengths', 'areasForImprovement'];

  // Check top-level structure
  for (const field of requiredFields) {
    if (!evaluation[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Check evaluation fields
  for (const field of requiredEvaluationFields) {
    if (!evaluation.evaluation[field]) {
      throw new Error(`Missing required evaluation field: ${field}`);
    }
    if (!evaluation.evaluation[field].score || !evaluation.evaluation[field].feedback) {
      throw new Error(`Invalid structure for evaluation field: ${field}`);
    }
    if (typeof evaluation.evaluation[field].score !== 'number' || 
        evaluation.evaluation[field].score < 0 || 
        evaluation.evaluation[field].score > 5) {
      throw new Error(`Invalid score for ${field}: must be a number between 0 and 5`);
    }
  }

  // Check feedback fields
  for (const field of requiredFeedbackFields) {
    if (!Array.isArray(evaluation.overallFeedback[field]) || 
        evaluation.overallFeedback[field].length === 0) {
      throw new Error(`Invalid ${field}: must be a non-empty array`);
    }
  }

  return true;
};

export const evaluateConversation = async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "Valid conversation history is required" });
    }

    let evaluation;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        // Get evaluation from Ollama
        const evaluationResponse = await queryOllama(evaluationPrompt(conversationHistory));
        
        // Parse and validate the response
        evaluation = parseEvaluationResponse(evaluationResponse);
        validateEvaluation(evaluation);
        
        // If we get here, the evaluation is valid
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw new Error(`Failed to get valid evaluation after ${maxRetries} attempts: ${error.message}`);
        }
        // Wait for a short time before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Calculate percentages
    Object.keys(evaluation.evaluation).forEach(key => {
      evaluation.evaluation[key].percentage = (evaluation.evaluation[key].score / 5) * 100;
    });

    res.json(evaluation);

  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ 
      error: "Server error during evaluation",
      details: error.message
    });
  }
};
