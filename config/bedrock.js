import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// Helper to get credentials from environment variables only
function getAWSCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined
    };
  }
  throw new Error("AWS credentials not set in environment variables");
}

const BEDROCK_MODEL_IDS = {
  "bedrock-claude-2": "anthropic.claude-v2:1",
  "bedrock-llama3-70b": "arn:aws:bedrock:us-east-1:894304940763:inference-profile/us.meta.llama3-3-70b-instruct-v1:0"
};

export async function queryBedrock({ prompt, model, maxTokens = 1024, temperature = 0.7, top_p = 0.9 }) {
  const region = process.env.AWS_REGION || "us-east-1";
  const modelId = BEDROCK_MODEL_IDS[model];
  if (!modelId) throw new Error("Unknown Bedrock model: " + model);
  const client = new BedrockRuntimeClient({ region });
  let bodyObj;
  if (model.startsWith("bedrock-claude")) {
    bodyObj = {
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: maxTokens,
      temperature,
      top_p
    };
  } else if (model.startsWith("bedrock-llama3")) {
    bodyObj = {
      prompt,
      max_gen_len: maxTokens,
      temperature,
      top_p
    };
  } else {
    throw new Error("Unsupported Bedrock model: " + model);
  }
  const body = JSON.stringify(bodyObj);
  const command = new InvokeModelCommand({
    modelId,
    body,
    contentType: "application/json",
    accept: "application/json"
  });
  const response = await client.send(command);
  const responseBody = new TextDecoder().decode(response.body);
  const json = JSON.parse(responseBody);
  if (model.startsWith("bedrock-claude")) {
    return json.completion;
  } else if (model.startsWith("bedrock-llama3")) {
    return json.generation || json.completion || JSON.stringify(json);
  }
  return JSON.stringify(json);
}
