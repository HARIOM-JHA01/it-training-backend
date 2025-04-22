import { queryOllama } from "../config/ollama.js";
import { saveConversation } from "../models/conversation.js";
import { greetingPrompt, conversationPrompt, evaluationPrompt } from "../utils/prompt.js";
import { getPromptByType } from "../models/prompt.js";

const MAX_INTERACTIONS = 6;

// Post-process AI response to remove unwanted phrases
function cleanAIResponse(text) {
  if (!text) return text;
  return text
    .replace(/Here\'s my response:?/gi, "")
    .replace(/My answer would be:?/gi, "")
    // Don't strip out greeting phrases as they're part of the natural conversation
    // .replace(/Hi [A-Z][a-z]+[.!]?/gi, "") - Removed
    // .replace(/Hi Client[.!]?/gi, "") - Removed
    // .replace(/Hello [A-Z][a-z]+[.!]?/gi, "") - Removed
    // .replace(/Hello Client[.!]?/gi, "") - Removed
    .replace(/^[,\s]+/, "") // Remove any leading commas or whitespace
    .replace(/^\s+|\s+$/g, "");
}

export const startChat = async (req, res) => {
  try {
    const { name, clientName = 'Client' } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Check if there's an active custom greeting prompt
    const customPrompt = await getPromptByType('greeting');
    let prompt;
    
    if (customPrompt) {
      // Replace placeholders with actual values
      prompt = customPrompt.content
        .replace(/\$\{name\}/g, name)
        .replace(/\$\{clientName\}/g, clientName);
    } else {
      prompt = greetingPrompt(name, clientName);
    }
    
    const aiResponse = cleanAIResponse(await queryOllama(prompt));
    await saveConversation("System: Start Chat", aiResponse, 1); // Interaction step 1
    
    res.json({ 
      aiResponse, 
      prompt, 
      promptInfo: { 
        clientName,
        interactionStep: 1,
        totalInteractions: MAX_INTERACTIONS,
        userName: name
      } 
    });
  } catch (error) {
    console.error("Start Chat Error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

export const respondChat = async (req, res) => {
  try {
    const { conversationHistory, userMessage, interactionStep = 2 } = req.body;
    
    if (!userMessage) {
      return res.status(400).json({ error: "User message is required." });
    }
    
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "Valid conversation history is required." });
    }

    // Calculate current interaction step if not provided
    let currentInteractionStep = interactionStep;
    if (typeof currentInteractionStep !== "number" || isNaN(currentInteractionStep)) {
      // If no valid step provided, calculate based on conversation history
      // Each interaction consists of a client message + PM response
      // First interaction was greeting, so start counting from 2
      currentInteractionStep = Math.floor(conversationHistory.length / 2) + 1;
      if (currentInteractionStep < 2) currentInteractionStep = 2;
    }

    // Ensure interaction step is within bounds
    currentInteractionStep = Math.min(currentInteractionStep, MAX_INTERACTIONS);
    
    // Use the correct function name (conversationPrompt instead of conversationPrompts)
    const promptResult = conversationPrompt(conversationHistory, userMessage, "Client", currentInteractionStep);
    
    const aiResponse = cleanAIResponse(await queryOllama(promptResult));

    // Save conversation with updated step
    await saveConversation(userMessage, aiResponse, currentInteractionStep);
    
    res.json({
      "aiResponse": aiResponse,
      "prompt": promptResult,
      "promptInfo": {
        "clientName": "Client",
        "interactionStep": currentInteractionStep + 1, // Increment for next interaction
        "totalInteractions": MAX_INTERACTIONS
      },
      "conversation-history": conversationHistory
    });
  }
  catch (error) {
    console.error("Respond Chat Error:", error);
    return res.status(500).json({ error: "Server error" });
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
  // Define arrays of varied feedback options to randomly select from
  const strengthOptions = [
    "The PM communicated clearly and concisely",
    "The PM demonstrated good listening skills",
    "The PM maintained a professional tone throughout",
    "The PM responded appropriately to the client's concerns",
    "The PM showed technical understanding of the project",
    "The PM was patient when handling unclear requests",
    "The PM established a good rapport with the client",
    "The PM effectively managed the client's expectations",
    "The PM demonstrated problem-solving abilities",
    "The PM was respectful and courteous in all responses",
    "The PM showed good judgment when prioritizing requests",
    "The PM asked relevant questions to clarify requirements",
    "The PM showed empathy toward the client's situation",
    "The PM kept the conversation focused on solutions"
  ];
  
  const improvementOptions = [
    "The PM could ask more probing questions to understand requirements",
    "The PM could provide more specific timeline estimates",
    "The PM could offer more alternative approaches to solving problems",
    "The PM could better explain technical constraints and their implications",
    "The PM could show more empathy when responding to concerns",
    "The PM should establish clearer next steps and action items",
    "The PM could be more proactive in identifying potential issues",
    "The PM should acknowledge client concerns more explicitly",
    "The PM could provide more detail in their explanations",
    "The PM should be more decisive when making recommendations",
    "The PM could communicate more efficiently with fewer words",
    "The PM should follow up on previously discussed points more consistently",
    "The PM could demonstrate deeper understanding of business impact",
    "The PM should balance technical details with business context better"
  ];
  
  // Randomly select 3 unique strengths and 3 unique improvement areas
  const getRandomItems = (array, count) => {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };
  
  const defaultStrengths = getRandomItems(strengthOptions, 3);
  const defaultImprovements = getRandomItems(improvementOptions, 3);
  
  const defaultEvaluation = {
    evaluation: {
      clarify: { score: 5, percentage: 50, feedback: ["The PM asked some clarifying questions."], modelAnswer: "Could you tell me more about your requirements? I'd like to understand the specific data fields you need access to and how you're planning to use this integration in your workflow." },
      legitimize: { score: 5, percentage: 50, feedback: ["The PM showed some empathy for the client's needs."], modelAnswer: "I understand the importance of this integration for your reporting needs. It makes perfect sense that you need this data to improve your analysis capabilities." },
      addPerspective: { score: 5, percentage: 50, feedback: ["The PM shared some technical considerations."], modelAnswer: "I should point out that integrating with external systems often requires additional security reviews and data mapping. This might impact our timeline, but I'll work to minimize any delays." },
      visualizeOptions: { score: 5, percentage: 50, feedback: ["The PM offered some alternative approaches."], modelAnswer: "We could approach this in a couple of ways: implement a full integration which would take longer but be more robust, or create a simpler data export feature first to meet your immediate needs while we work on the complete solution." },
      establishAgreements: { score: 5, percentage: 50, feedback: ["The PM discussed some next steps."], modelAnswer: "Let's plan for the following next steps: I'll create a detailed requirements document by Friday, schedule a meeting with the technical team next Tuesday, and provide you with a timeline estimate by the end of next week." }
    },
    overallFeedback: {
      strengths: defaultStrengths,
      areasForImprovement: defaultImprovements
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
const generateModelAnswer = async (interactionStep, pmName = "Project Manager") => {
  // Define prompts for each interaction step
  const modelAnswerPrompts = {
    1: `You are a project manager named ${pmName}. Write a very brief, professional first response to a client who just said hello. 
       It must be in FIRST PERSON (no "As ${pmName}, I would..."), extremely concise (10-15 words only), and simply introduce yourself and offer help.
       Do NOT include phrases like "Here's my response" or any client name.`,
       
    2: `You are a project manager named ${pmName}. Write a brief response to a client who just requested a software feature change.
       It must be in FIRST PERSON, concise (30-40 words), acknowledge their request, and ask 1-2 specific questions about their needs.
       Do NOT include phrases like "Here's my response" or refer to yourself in third person.`,
       
    3: `You are a project manager named ${pmName}. Write a brief response to a client who provided technical details about their requirements.
       It must be in FIRST PERSON, concise (40-50 words), mention you'll check with the dev team, and ask for one specific clarification.
       Do NOT include any meta-commentary or refer to yourself in third person.`,
       
    4: `You are a project manager named ${pmName}. Write a brief response to a client concerned about project timeline.
       It must be in FIRST PERSON, concise (40-50 words), acknowledge their deadline concern, provide a rough estimate, and mention prioritization.
       Do NOT include any meta-commentary or phrases like "Here's what I would say".`,
       
    5: `You are a project manager named ${pmName}. Write a brief response about implementation approaches to a flexible client.
       It must be in FIRST PERSON, concise (40-50 words), propose a specific approach, and mention next steps with the development team.
       Do NOT include any meta-commentary or refer to yourself in third person.`,
       
    6: `You are a project manager named ${pmName}. Write a brief closing response to a client who thanked you.
       It must be in FIRST PERSON, very concise (20-30 words), acknowledge their thanks, and summarize next steps.
       Do NOT include any meta-commentary or refer to yourself in third person.`
  };

  try {
    if (!modelAnswerPrompts[interactionStep]) {
      return `I'll help with your request and follow up with the development team.`;
    }
    
    const systemPrompt = "You are a project manager. Respond in first person, extremely concisely, with NO meta-commentary.";
    let modelAnswer = await queryOllama(modelAnswerPrompts[interactionStep], systemPrompt);
    
    // Clean up the response
    modelAnswer = modelAnswer
      .replace(/^\s*["']|["']\s*$/g, '') // Remove quotes at beginning/end
      .replace(/Here['']s my response:?/gi, "")
      .replace(/As [A-Za-z]+ I would say:?/gi, "")
      .replace(/As a project manager,?/gi, "")
      .replace(/My response would be:?/gi, "")
      .replace(/I would respond:?/gi, "")
      .trim();
    
    // Enforce word limits based on interaction step
    const words = modelAnswer.split(/\s+/);
    if (interactionStep === 1 && words.length > 15) {
      // For first interaction, limit to 15 words
      modelAnswer = words.slice(0, 15).join(' ');
    } else if (words.length > 50) {
      // For other interactions, limit to 50 words max
      modelAnswer = words.slice(0, 50).join(' ');
    }
    
    // Ensure proper sentence endings
    if (!modelAnswer.match(/[.!?]$/)) {
      modelAnswer += '.';
    }
    
    return modelAnswer;
  } catch (error) {
    console.error(`Error generating model answer for step ${interactionStep}:`, error);
    return `I'll help with your project and provide guidance through each step.`;
  }
};

export const evaluateConversation = async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "Valid conversation history is required" });
    }

    // Get PM name from the first user message
    let pmName = "Project Manager";
    if (conversationHistory && conversationHistory.length > 0) {
      const firstUserMsg = conversationHistory.find(m => m.role === "user");
      if (firstUserMsg) {
        // Try to extract a name from the first user message
        const nameMatch = firstUserMsg.content.match(/Hi ([A-Z][a-z]+)/i);
        if (nameMatch && nameMatch[1]) {
          pmName = nameMatch[1];
        } else if (firstUserMsg.content.split(" ").length === 1) {
          pmName = firstUserMsg.content.trim();
        }
      }
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

    // Generate the overall assessment
    const scoreValues = {};
    Object.keys(evaluation.evaluation).forEach(key => {
      scoreValues[key] = evaluation.evaluation[key].score;
    });
    
    // Generate overall assessment text using AI
    const overallAssessment = await generateOverallAssessment(conversationHistory, scoreValues);
    evaluation.overallAssessment = overallAssessment;

    // Generate high-quality model answers using Ollama for each interaction step
    const modelAnswers = [];
    for (let i = 1; i <= MAX_INTERACTIONS; i++) {
      const modelResponse = await generateModelAnswer(i, pmName);
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

// Returns only scores, feedback, and interaction metrics (no model answers)
export const evaluateScores = async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "Valid conversation history is required" });
    }

    let evaluation;
    let retryCount = 0;
    const maxRetries = 1;
    let partialEvaluation = null;
    const enhancedPromptSuffix = `\n\nIMPORTANT: Your response MUST be valid JSON. Format it exactly according to the structure specified, with no additional text or markdown formatting. Every field shown in the example must be included.`;

    while (retryCount < maxRetries) {
      try {
        const customPrompt = await getPromptByType('evaluation');
        let prompt;
        if (customPrompt) {
          const conversationHistoryText = conversationHistory.map(m => 
            `${m.role === "ai" ? "Internal Client" : "PM"}: ${m.content}`
          ).join("\n\n");
          prompt = customPrompt.content.replace(/\$\{conversationHistory\}/g, conversationHistoryText);
          prompt += enhancedPromptSuffix;
        } else {
          prompt = evaluationPrompt(conversationHistory) + enhancedPromptSuffix;
        }
        const systemPrompt = "You are a structured data extractor that ONLY responds with valid, properly formatted JSON according to the given schema.";
        const evaluationResponse = await queryOllama(prompt, systemPrompt);
        evaluation = parseEvaluationResponse(evaluationResponse);
        if (evaluation) {
          partialEvaluation = evaluation;
        }
        validateEvaluation(evaluation);
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          if (partialEvaluation) {
            evaluation = reconstructEvaluation(partialEvaluation);
          } else {
            evaluation = reconstructEvaluation();
          }
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // Normalize and adjust scores
    const scores = Object.keys(evaluation.evaluation).map(key => evaluation.evaluation[key].score);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    if (avgScore > 8) {
      const scalingFactor = 8 / avgScore;
      Object.keys(evaluation.evaluation).forEach(key => {
        let adjustedScore = Math.round(evaluation.evaluation[key].score * scalingFactor * 10) / 10;
        if (adjustedScore > 9.5) adjustedScore = 9.5;
        evaluation.evaluation[key].score = adjustedScore;
        evaluation.evaluation[key].percentage = (adjustedScore / 10) * 100;
      });
    } else {
      Object.keys(evaluation.evaluation).forEach(key => {
        evaluation.evaluation[key].percentage = (evaluation.evaluation[key].score / 10) * 100;
      });
    }

    // Add interaction metrics
    evaluation.interactionMetrics = {
      totalInteractions: MAX_INTERACTIONS,
      completedInteractions: Math.min(Math.floor(conversationHistory.length / 2), MAX_INTERACTIONS)
    };

    // Remove modelAnswers if present
    delete evaluation.modelAnswers;

    res.json(evaluation);
  } catch (error) {
    res.status(500).json({ error: "Server error during evaluation (scores)", details: error.message });
  }
};

// Returns only model answers for the conversation
export const getModelAnswers = async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "Valid conversation history is required" });
    }
    // Get PM name from the first user message
    let pmName = "Project Manager";
    if (conversationHistory && conversationHistory.length > 0) {
      const firstUserMsg = conversationHistory.find(m => m.role === "user");
      if (firstUserMsg) {
        const nameMatch = firstUserMsg.content.match(/Hi ([A-Z][a-z]+)/i);
        if (nameMatch && nameMatch[1]) {
          pmName = nameMatch[1];
        } else if (firstUserMsg.content.split(" ").length === 1) {
          pmName = firstUserMsg.content.trim();
        }
      }
    }
    const modelAnswers = [];
    for (let i = 1; i <= MAX_INTERACTIONS; i++) {
      const modelResponse = await generateModelAnswer(i, pmName);
      modelAnswers.push({
        interactionStep: i,
        example: modelResponse
      });
    }
    res.json({ modelAnswers });
  } catch (error) {
    res.status(500).json({ error: "Server error during model answer generation", details: error.message });
  }
};

// Generate an overall assessment of the conversation
const generateOverallAssessment = async (conversationHistory, scores) => {
  try {
    // Calculate overall average score
    const avgScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.values(scores).length;
    
    // Determine performance level based on average score
    let performanceLevel = "needs improvement";
    if (avgScore >= 8) {
      performanceLevel = "excellent";
    } else if (avgScore >= 6) {
      performanceLevel = "good";
    } else if (avgScore >= 4) {
      performanceLevel = "fair";
    }
    
    // Create prompt for generating overall assessment
    const conversationHistoryText = conversationHistory.map(m => 
      `${m.role === "ai" ? "Internal Client" : "PM"}: ${m.content}`
    ).join("\n\n");
    
    const assessmentPrompt = `
You are a project management coach evaluating a conversation between a PM and an internal client.
Generate a concise overall assessment (2-3 paragraphs) of the PM's communication skills based on the conversation below.
Focus on their strengths and areas for improvement, and provide specific actionable advice.
Use a professional but encouraging tone. The PM's average score was ${avgScore.toFixed(1)}/10, indicating ${performanceLevel} performance.

CONVERSATION:
${conversationHistoryText}

Your assessment should be practical, specific, and highlight both what worked well and concrete ways the PM can improve.
Keep your response to 150-200 words maximum.
`;

    const systemPrompt = "You are a project management skills coach providing concise, actionable feedback.";
    const assessment = await queryOllama(assessmentPrompt, systemPrompt);
    
    return assessment.trim();
  } catch (error) {
    console.error("Error generating overall assessment:", error);
    return "Unable to generate overall assessment due to a technical issue. Please review the individual scores and feedback sections for performance details.";
  }
};
