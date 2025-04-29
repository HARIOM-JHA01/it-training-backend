import express from "express";
import { startChat, respondChat, evaluateConversation, evaluateScores, getModelAnswers } from "../controllers/chatController.js";

const router = express.Router();

/**
 * @swagger
 * /api/chat/start-session:
 *   post:
 *     summary: Start a new chat session
 *     tags: [Chat]
 *     description: Initiates a new conversation with the AI client
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatStartRequest'
 *     responses:
 *       200:
 *         description: Chat session started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatStartResponse'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/start-session", startChat);

/**
 * @swagger
 * /api/chat/respond:
 *   post:
 *     summary: Get response from AI client
 *     tags: [Chat]
 *     description: Sends a user message and gets a response from the AI client
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatRespondRequest'
 *     responses:
 *       200:
 *         description: AI response received successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatRespondResponse'
 *       400:
 *         description: Bad request - missing required fields or invalid data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/respond", respondChat);

/**
 * @swagger
 * /api/chat/evaluate:
 *   post:
 *     summary: Evaluate complete conversation
 *     tags: [Evaluation]
 *     description: Evaluates the entire conversation between the PM and internal client
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EvaluationRequest'
 *     responses:
 *       200:
 *         description: Conversation evaluated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Complete evaluation results including scores, feedback, and model answers
 *       400:
 *         description: Bad request - invalid conversation history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/evaluate", evaluateConversation);

/**
 * @swagger
 * /api/chat/evaluate-scores:
 *   post:
 *     summary: Get evaluation scores only
 *     tags: [Evaluation]
 *     description: Evaluates the conversation and returns only the scores and feedback (no model answers)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EvaluationRequest'
 *     responses:
 *       200:
 *         description: Evaluation scores generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Evaluation results including scores and feedback
 *       400:
 *         description: Bad request - invalid conversation history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/evaluate-scores", evaluateScores);

/**
 * @swagger
 * /api/chat/model-answers:
 *   post:
 *     summary: Get model answers only
 *     tags: [Evaluation]
 *     description: Generates model answers for each interaction step based on the conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EvaluationRequest'
 *     responses:
 *       200:
 *         description: Model answers generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 modelAnswers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       interactionStep:
 *                         type: integer
 *                         description: The interaction step number
 *                       example:
 *                         type: string
 *                         description: The model answer for this step
 *       400:
 *         description: Bad request - invalid conversation history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/model-answers", getModelAnswers);

export default router;
