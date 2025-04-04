// config/ollama.js
import ollama from "ollama";

export const queryOllama = async (prompt) => {
  try {
    const response = await ollama.chat({
      model: "llama3.1", 
      messages: [{ role: "user", content: prompt }],
    });
    return response.message.content;
  } catch (error) {
    throw error;
  }
};

export default queryOllama;
