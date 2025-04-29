import swaggerJSDoc from 'swagger-jsdoc';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IT Training Chat API',
      version: '1.0.0',
      description: 'API documentation for IT Training Chat Application - Project Manager training scenario with a simulated internal client',
      contact: {
        name: 'Administrator'
      }
    },
    servers: [
      {
        url: '/',
        description: 'Current server'
      }
    ],
    schemes: ['http', 'https'],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'string',
              description: 'Detailed error information'
            }
          }
        },
        ChatStartRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              description: 'The name of the PM (project manager)'
            },
            clientName: {
              type: 'string',
              description: 'The name of the client (defaults to "Joe")'
            }
          }
        },
        ChatStartResponse: {
          type: 'object',
          properties: {
            aiResponse: {
              type: 'string',
              description: 'The AI-generated greeting message'
            },
            prompt: {
              type: 'string',
              description: 'The prompt used to generate the greeting'
            },
            promptInfo: {
              type: 'object',
              properties: {
                clientName: {
                  type: 'string',
                  description: 'The name of the client'
                },
                interactionStep: {
                  type: 'integer',
                  description: 'The current interaction step (1 for greeting)'
                },
                totalInteractions: {
                  type: 'integer',
                  description: 'The total number of interactions in the conversation'
                },
                userName: {
                  type: 'string',
                  description: 'The name of the PM'
                }
              }
            }
          }
        },
        ChatRespondRequest: {
          type: 'object',
          required: ['conversationHistory', 'userMessage'],
          properties: {
            conversationHistory: {
              type: 'array',
              description: 'The history of messages in the conversation',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    enum: ['ai', 'user'],
                    description: 'The role of the message sender (ai for client, user for PM)'
                  },
                  content: {
                    type: 'string',
                    description: 'The content of the message'
                  }
                }
              }
            },
            userMessage: {
              type: 'string',
              description: 'The message from the PM to respond to'
            },
            interactionStep: {
              type: 'integer',
              description: 'The current interaction step'
            }
          }
        },
        ChatRespondResponse: {
          type: 'object',
          properties: {
            aiResponse: {
              type: 'string',
              description: 'The AI-generated response message'
            },
            prompt: {
              type: 'string',
              description: 'The prompt used to generate the response'
            },
            promptInfo: {
              type: 'object',
              properties: {
                clientName: {
                  type: 'string',
                  description: 'The name of the client'
                },
                interactionStep: {
                  type: 'integer',
                  description: 'The next interaction step'
                },
                totalInteractions: {
                  type: 'integer',
                  description: 'The total number of interactions in the conversation'
                }
              }
            },
            'conversation-history': {
              type: 'array',
              description: 'The updated history of messages in the conversation'
            }
          }
        },
        EvaluationRequest: {
          type: 'object',
          required: ['conversationHistory'],
          properties: {
            conversationHistory: {
              type: 'array',
              description: 'The complete conversation history to evaluate',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    enum: ['ai', 'user'],
                    description: 'The role of the message sender (ai for client, user for PM)'
                  },
                  content: {
                    type: 'string',
                    description: 'The content of the message'
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./routes/*.js', './server.js'] // paths to files containing annotations
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export default swaggerSpec;