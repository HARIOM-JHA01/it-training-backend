import ollama from "ollama";

export const queryOllama = async (prompt) => {
  try {
    const response = await ollama.chat({
      model: "qwen2.5:32b", 
      messages: [{ role: "user", content: prompt }],
    });
    return response.message.content;
  } catch (error) {
    console.error("Error querying Ollama:", error);
    throw error;
  }
};

export default queryOllama;
