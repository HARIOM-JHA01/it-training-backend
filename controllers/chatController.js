import { queryOllama } from "../config/ollama.js";
import { saveConversation } from "../models/conversation.js";
import { greetingPrompt, conversationPrompt, evaluationPrompt } from "../utils/prompt.js";
import { getPromptByType } from "../models/prompt.js";

export const startChat = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    
    // Get client name from request or use default
    const { clientName = "Client" } = req.body;
    
    const personalities = [
      "detail-oriented and analytical",
      "results-focused and direct",
      "collaborative and friendly",
      "cautious and thorough",
      "innovative and forward-thinking"
    ];
    const clientPersonality = personalities[Math.floor(Math.random() * personalities.length)];
    
    // Check if there's an active custom greeting prompt
    const customPrompt = await getPromptByType('greeting');
    let prompt;
    
    if (customPrompt) {
      // Replace placeholders with actual values
      prompt = customPrompt.content
        .replace(/\$\{name\}/g, name)
        .replace(/\$\{clientName\}/g, clientName)
        .replace(/\$\{clientPersonality\}/g, clientPersonality);
    } else {
      prompt = greetingPrompt(name, clientName, clientPersonality);
    }
    
    const aiResponse = await queryOllama(prompt);
    await saveConversation("System: Start Chat", aiResponse);
    res.json({ aiResponse, prompt, promptInfo: { clientName, clientPersonality } });
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
    
    // Extract client name from conversation history or use a default
    let clientName = "Client";
    if (conversationHistory && conversationHistory.length > 0) {
      // Try to find the client name from the first message
      const firstMessage = conversationHistory[0];
      if (firstMessage && firstMessage.role === "ai") {
        const greeting = firstMessage.content;
        // Extract name from greeting patterns like "Hi [name]" or "Hello [name]"
        const nameMatch = greeting.match(/(?:Hi|Hello|Hey)\s+([A-Za-z]+)/);
        if (nameMatch && nameMatch[1]) {
          clientName = nameMatch[1];
        }
      }
    }
    
    // Check if there's an active custom conversation prompt
    const customPrompt = await getPromptByType('conversation');
    let prompt;
    
    if (customPrompt) {
      // Replace placeholders with actual values
      const conversationHistoryText = conversationHistory.map(m => 
        `${m.role === "ai" ? `${clientName}` : "PM"}: ${m.content}`
      ).join("\n");
      
      prompt = customPrompt.content
        .replace(/\$\{conversationHistory\}/g, conversationHistoryText)
        .replace(/\$\{userInput\}/g, userMessage)
        .replace(/\$\{clientName\}/g, clientName);
    } else {
      prompt = conversationPrompt(conversationHistory, userMessage, clientName);
    }
    
    const aiResponse = await queryOllama(prompt);
    await saveConversation(userMessage, aiResponse);

    res.json({ aiResponse, prompt, promptInfo: { clientName } });
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
  const requiredEvaluationFields = ['clarify', 'legitimize', 'addPerspective', 'visualizeOptions', 'establishAgreements'];
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
        evaluation.evaluation[field].score > 10) {
      throw new Error(`Invalid score for ${field}: must be a number between 0 and 10`);
    }
    if (!Array.isArray(evaluation.evaluation[field].feedback) || 
        evaluation.evaluation[field].feedback.length === 0) {
      throw new Error(`Invalid feedback for ${field}: must be a non-empty array`);
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
        // Check if there's an active custom evaluation prompt
        const customPrompt = await getPromptByType('evaluation');
        let prompt;
        
        if (customPrompt) {
          // Replace placeholders with actual values
          const conversationHistoryText = conversationHistory.map(m => 
            `${m.role === "ai" ? "Internal Client" : "PM"}: ${m.content}`
          ).join("\n");
          
          prompt = customPrompt.content.replace(/\$\{conversationHistory\}/g, conversationHistoryText);
        } else {
          prompt = evaluationPrompt(conversationHistory);
        }
        
        // Get evaluation from Ollama
        const evaluationResponse = await queryOllama(prompt);
        
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

    // Normalize and adjust scores to make them more realistic and logical
    // First, collect all scores
    const scores = Object.keys(evaluation.evaluation).map(key => evaluation.evaluation[key].score);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    // If average score is too high (> 8), apply a scaling factor to bring scores down
    if (avgScore > 8) {
      const scalingFactor = 8 / avgScore; // This will scale the average down to 8
      
      Object.keys(evaluation.evaluation).forEach(key => {
        // Apply scaling and ensure scores remain between 0-10
        let adjustedScore = Math.round(evaluation.evaluation[key].score * scalingFactor * 10) / 10;
        // Ensure we don't have perfect 10s unless truly exceptional
        if (adjustedScore > 9.5) adjustedScore = 9.5;
        // Update the score
        evaluation.evaluation[key].score = adjustedScore;
        // Calculate percentage for the circle visualization
        evaluation.evaluation[key].percentage = (adjustedScore / 10) * 100;
      });
    } else {
      // If scores are already reasonable, just calculate percentages
      Object.keys(evaluation.evaluation).forEach(key => {
        evaluation.evaluation[key].percentage = (evaluation.evaluation[key].score / 10) * 100;
      });
    }

    res.json(evaluation);

  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ 
      error: "Server error during evaluation",
      details: error.message
    });
  }
};
