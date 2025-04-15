import { queryOllama } from "../config/ollama.js";
import { saveConversation } from "../models/conversation.js";
import { greetingPrompt, conversationPrompt, evaluationPrompt } from "../utils/prompt.js";
import { getPromptByType } from "../models/prompt.js";

// Maximum number of interaction steps in the conversation
const MAX_INTERACTIONS = 6;

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
    await saveConversation("System: Start Chat", aiResponse, 1); // Interaction step 1
    
    res.json({ 
      aiResponse, 
      prompt, 
      promptInfo: { 
        clientName, 
        clientPersonality,
        interactionStep: 1,
        totalInteractions: MAX_INTERACTIONS,
        userName: name
      } 
    });
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
    
    // Extract user name from conversation history or use a default
    let userName = "Project Manager";
    let clientName = "Client";
    
    // Look for prompt info in the request if available
    if (req.body.promptInfo && req.body.promptInfo.userName) {
      userName = req.body.promptInfo.userName;
    } else if (req.body.userName) {
      userName = req.body.userName;
    } else {
      // Try to extract from conversation context if not directly provided
      if (conversationHistory && conversationHistory.length > 0) {
        // Attempt to find name patterns in the first few messages
        for (const msg of conversationHistory.slice(0, 3)) {
          const nameMatches = msg.content.match(/Hi ([A-Z][a-z]+)|Hello ([A-Z][a-z]+)|Hey ([A-Z][a-z]+)/);
          if (nameMatches) {
            // Use the first captured group that isn't undefined
            userName = nameMatches[1] || nameMatches[2] || nameMatches[3];
            break;
          }
        }
      }
    }
    
    // Extract client name from AI messages if available
    if (conversationHistory && conversationHistory.length > 0) {
      // Try to find the client name from the first message
      const firstMessage = conversationHistory.find(m => m.role === "ai");
      if (firstMessage) {
        const greeting = firstMessage.content;
        
        // Try to extract a name intro pattern like "I'm [Name]" or "name is [Name]"
        const nameIntroMatch = greeting.match(/I('|')?m ([A-Z][a-z]+)|name('|')s ([A-Z][a-z]+)|name is ([A-Z][a-z]+)/i);
        if (nameIntroMatch) {
          // Use the first captured name group that isn't undefined
          for (let i = 2; i <= 5; i++) {
            if (nameIntroMatch[i]) {
              clientName = nameIntroMatch[i];
              break;
            }
          }
        }
      }
    }
    
    // Calculate the current interaction step based on message count
    // Each interaction has 2 messages (user and AI), plus the initial greeting
    const interactionStep = Math.min(
      Math.floor((conversationHistory.length + 1) / 2) + 1,
      MAX_INTERACTIONS
    );
    
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
        .replace(/\$\{clientName\}/g, clientName)
        .replace(/\$\{interactionStep\}/g, interactionStep)
        .replace(/\$\{name\}/g, userName);
    } else {
      prompt = conversationPrompt(conversationHistory, userMessage, clientName, interactionStep);
    }
    
    const aiResponse = await queryOllama(prompt);
    await saveConversation(userMessage, aiResponse, interactionStep);

    // Determine if this is the final interaction
    const isFinalInteraction = interactionStep >= MAX_INTERACTIONS;

    res.json({ 
      aiResponse, 
      prompt, 
      promptInfo: { 
        clientName,
        interactionStep,
        totalInteractions: MAX_INTERACTIONS,
        isFinalInteraction,
        userName
      } 
    });
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
      // Final attempt: try to find JSON using regex pattern matching
      try {
        const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
        const matches = response.match(jsonRegex);
        if (matches && matches.length > 0) {
          // Take the longest match which is most likely the complete JSON
          const longestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
          return JSON.parse(longestMatch);
        }
      } catch (regexError) {
        // If all attempts fail, throw the original error
      }
      throw new Error('Failed to parse evaluation response as JSON');
    }
  }
};

// If validation fails but we have enough structure to work with,
// attempt to reconstruct a valid evaluation object
const reconstructEvaluation = (partialEvaluation) => {
  const defaultEvaluation = {
    evaluation: {
      clarify: { score: 5, percentage: 50, feedback: ["The PM asked some clarifying questions."], modelAnswer: "Could you tell me more about your requirements? I'd like to understand the specific data fields you need access to and how you're planning to use this integration in your workflow." },
      legitimize: { score: 5, percentage: 50, feedback: ["The PM showed some empathy for the client's needs."], modelAnswer: "I understand the importance of this integration for your reporting needs. It makes perfect sense that you need this data to improve your analysis capabilities." },
      addPerspective: { score: 5, percentage: 50, feedback: ["The PM shared some technical considerations."], modelAnswer: "I should point out that integrating with external systems often requires additional security reviews and data mapping. This might impact our timeline, but I'll work to minimize any delays." },
      visualizeOptions: { score: 5, percentage: 50, feedback: ["The PM offered some alternative approaches."], modelAnswer: "We could approach this in a couple of ways: implement a full integration which would take longer but be more robust, or create a simpler data export feature first to meet your immediate needs while we work on the complete solution." },
      establishAgreements: { score: 5, percentage: 50, feedback: ["The PM discussed some next steps."], modelAnswer: "Let's plan for the following next steps: I'll create a detailed requirements document by Friday, schedule a meeting with the technical team next Tuesday, and provide you with a timeline estimate by the end of next week." }
    },
    overallFeedback: {
      strengths: ["The PM maintained a professional tone", "The PM was responsive to the client's needs", "The PM showed technical knowledge"],
      areasForImprovement: ["The PM could ask more probing questions", "The PM could be more specific about timelines", "The PM could offer more alternative solutions"]
    },
    modelAnswers: []
  };

  // Generate default model answers
  for (let i = 1; i <= 6; i++) {
    defaultEvaluation.modelAnswers.push({
      interactionStep: i,
      example: `Example of how a PM should respond to the client in interaction step ${i}.`
    });
  }

  // Create a new object with defaults
  const reconstructed = { ...defaultEvaluation };

  // If we have partial evaluation data, try to preserve it
  if (partialEvaluation) {
    // Copy over any existing evaluation categories
    if (partialEvaluation.evaluation) {
      reconstructed.evaluation = { ...reconstructed.evaluation };
      Object.keys(partialEvaluation.evaluation).forEach(key => {
        if (reconstructed.evaluation[key]) {
          reconstructed.evaluation[key] = {
            ...reconstructed.evaluation[key],
            ...partialEvaluation.evaluation[key]
          };
          
          // Always ensure percentage is set
          if (reconstructed.evaluation[key].score) {
            reconstructed.evaluation[key].percentage = (reconstructed.evaluation[key].score / 10) * 100;
          }
          
          // Ensure feedback is an array
          if (reconstructed.evaluation[key].feedback && !Array.isArray(reconstructed.evaluation[key].feedback)) {
            reconstructed.evaluation[key].feedback = [reconstructed.evaluation[key].feedback];
          }
        }
      });
    }
    
    // Copy over overall feedback if available
    if (partialEvaluation.overallFeedback) {
      reconstructed.overallFeedback = { ...reconstructed.overallFeedback };
      
      if (partialEvaluation.overallFeedback.strengths) {
        reconstructed.overallFeedback.strengths = Array.isArray(partialEvaluation.overallFeedback.strengths) 
          ? partialEvaluation.overallFeedback.strengths 
          : [partialEvaluation.overallFeedback.strengths];
      }
      
      if (partialEvaluation.overallFeedback.areasForImprovement) {
        reconstructed.overallFeedback.areasForImprovement = Array.isArray(partialEvaluation.overallFeedback.areasForImprovement)
          ? partialEvaluation.overallFeedback.areasForImprovement
          : [partialEvaluation.overallFeedback.areasForImprovement];
      }
    }
    
    // Copy over model answers if available
    if (partialEvaluation.modelAnswers && Array.isArray(partialEvaluation.modelAnswers)) {
      reconstructed.modelAnswers = partialEvaluation.modelAnswers;
    }
  }
  
  return reconstructed;
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

// Generate a model answer for a specific interaction step
const generateModelAnswer = async (interactionStep) => {
  // Define prompts for each interaction step
  const modelAnswerPrompts = {
    1: `You are a skilled project manager responding to an internal client's first message. The client has just greeted you and mentioned they need help with a project. Write a professional, friendly first response that introduces yourself as the PM and asks how you can help with their project needs. Keep your response concise (3-5 sentences) and make it sound natural.`,
    
    2: `You are a skilled project manager responding to an internal client who has just explained they need a CRM integration to improve their reporting capabilities. Write a professional response that 1) acknowledges their request, 2) asks clarifying questions about the specific data they need, and 3) inquires about their workflow and how they plan to use this integration. Keep your response concise (4-6 sentences) and make it sound natural.`,
    
    3: `You are a skilled project manager in an ongoing conversation with an internal client about a CRM integration project. The client has just provided details about needing customer interaction timestamps and campaign source data for their conversion analysis. Write a professional response that 1) acknowledges the specific data points they mentioned, 2) mentions that you'll need to check with the development team about API endpoints, and 3) asks for an example of the reports they hope to generate. Keep your response concise (4-6 sentences) and make it sound natural.`,
    
    4: `You are a skilled project manager responding to an internal client who has expressed concern about the timeline for implementing a CRM integration before their quarterly planning deadline. Write a professional response that 1) acknowledges their timeline concern, 2) provides a rough estimate of 2-3 weeks for implementation and testing, and 3) mentions you'll work to prioritize this and possibly expedite certain components. Keep your response concise (4-6 sentences) and make it sound natural.`,
    
    5: `You are a skilled project manager responding to an internal client about a CRM integration project. The client has just shown flexibility regarding the implementation approach. Write a professional response that 1) appreciates their flexibility, 2) proposes a phased approach with core functionality first and additional features later, and 3) mentions you'll speak with the development team about allocating additional resources to meet their deadline. Keep your response concise (4-6 sentences) and make it sound natural.`,
    
    6: `You are a skilled project manager wrapping up a conversation with an internal client about a CRM integration project. The client has just thanked you for your help. Write a professional closing response that 1) acknowledges their thanks, 2) summarizes the agreed approach (phased implementation), 3) mentions you'll document the plan and send it to them by tomorrow, and 4) proposes a check-in meeting next week. Keep your response concise (4-6 sentences) and make it sound natural.`
  };

  try {
    if (!modelAnswerPrompts[interactionStep]) {
      return `Example response for interaction step ${interactionStep}.`;
    }
    
    const systemPrompt = "You are an experienced project manager providing a model example of professional communication.";
    const modelAnswer = await queryOllama(modelAnswerPrompts[interactionStep], systemPrompt);
    
    // Clean up the response - remove quotes if present
    return modelAnswer.replace(/^["']|["']$/g, '').trim();
  } catch (error) {
    console.error(`Error generating model answer for step ${interactionStep}:`, error);
    return `Example response for interaction step ${interactionStep}.`;
  }
};

export const evaluateConversation = async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "Valid conversation history is required" });
    }

    let evaluation;
    let retryCount = 0;
    const maxRetries = 1; // Increased from 3 to 4 retries
    let partialEvaluation = null; // Store any partial evaluation data we might get

    // Enhanced prompt with stronger formatting instructions
    const enhancedPromptSuffix = `\n\nIMPORTANT: Your response MUST be valid JSON. Format it exactly according to the structure specified, with no additional text or markdown formatting. Every field shown in the example must be included.`;

    while (retryCount < maxRetries) {
      try {
        // Check if there's an active custom evaluation prompt
        const customPrompt = await getPromptByType('evaluation');
        let prompt;
        
        if (customPrompt) {
          // Replace placeholders with actual values
          const conversationHistoryText = conversationHistory.map(m => 
            `${m.role === "ai" ? "Internal Client" : "PM"}: ${m.content}`
          ).join("\n\n");
          
          prompt = customPrompt.content.replace(/\$\{conversationHistory\}/g, conversationHistoryText);
          // Add the enhanced format instructions
          prompt += enhancedPromptSuffix;
        } else {
          prompt = evaluationPrompt(conversationHistory) + enhancedPromptSuffix;
        }
        
        // Use a system message to increase reliability of structured outputs
        const systemPrompt = "You are a structured data extractor that ONLY responds with valid, properly formatted JSON according to the given schema.";
        
        // Get evaluation from Ollama with enhanced reliability
        const evaluationResponse = await queryOllama(prompt, systemPrompt);
        
        // Parse and validate the response
        evaluation = parseEvaluationResponse(evaluationResponse);
        
        // Save any partial result we might get
        if (evaluation) {
          partialEvaluation = evaluation;
        }
        
        validateEvaluation(evaluation);
        
        // If we get here, the evaluation is valid
        break;
      } catch (error) {
        console.log(`Evaluation attempt ${retryCount + 1} failed: ${error.message}`);
        retryCount++;
        
        if (retryCount === maxRetries) {
          console.log("All evaluation attempts failed, reconstructing from partial data");
          // If we have partial data, try to reconstruct a valid evaluation
          if (partialEvaluation) {
            evaluation = reconstructEvaluation(partialEvaluation);
          } else {
            // If no partial data, create a default evaluation
            evaluation = reconstructEvaluation();
          }
          break;
        }
        
        // Wait with increasing time between retries
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
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

    // Generate high-quality model answers using Ollama for each interaction step
    const modelAnswers = [];
    for (let i = 1; i <= MAX_INTERACTIONS; i++) {
      const modelResponse = await generateModelAnswer(i);
      modelAnswers.push({
        interactionStep: i,
        example: modelResponse
      });
    }
    evaluation.modelAnswers = modelAnswers;

    // Include interaction metrics in the evaluation results
    evaluation.interactionMetrics = {
      totalInteractions: MAX_INTERACTIONS,
      completedInteractions: Math.min(Math.floor(conversationHistory.length / 2), MAX_INTERACTIONS)
    };

    res.json(evaluation);

  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ 
      error: "Server error during evaluation",
      details: error.message
    });
  }
};
