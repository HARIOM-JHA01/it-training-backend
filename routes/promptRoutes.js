import express from "express";
import { getPrompts, createPrompt, setActivePrompt, getActivePrompt } from "../controllers/promptController.js";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Prompt:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The prompt ID
 *         type:
 *           type: string
 *           enum: [greeting, conversation, evaluation]
 *           description: The type of prompt
 *         content:
 *           type: string
 *           description: The prompt template content
 *         isActive:
 *           type: boolean
 *           description: Whether this prompt is currently active
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the prompt was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the prompt was last updated
 *     PromptCreateRequest:
 *       type: object
 *       required: [type, content]
 *       properties:
 *         type:
 *           type: string
 *           enum: [greeting, conversation, evaluation]
 *           description: The type of prompt to create
 *         content:
 *           type: string
 *           description: The prompt template content
 *     PromptActivateResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Success message
 *     ActivePromptResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The prompt ID (if not default)
 *         type:
 *           type: string
 *           description: The prompt type
 *         content:
 *           type: string
 *           description: The prompt template content
 *         isDefault:
 *           type: boolean
 *           description: Whether this is the default system prompt
 */

/**
 * @swagger
 * /api/prompts/types/{type}:
 *   get:
 *     summary: Get all prompts of a specific type
 *     description: Retrieves all prompts of the specified type (greeting, conversation, or evaluation)
 *     tags: [Prompts]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [greeting, conversation, evaluation]
 *         description: The type of prompts to retrieve
 *     responses:
 *       200:
 *         description: List of prompts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Prompt'
 *       400:
 *         description: Invalid prompt type
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
router.get("/types/:type", getPrompts);

/**
 * @swagger
 * /api/prompts/active/{type}:
 *   get:
 *     summary: Get the active prompt of a specific type
 *     description: Retrieves the currently active prompt for the specified type, or returns the default if none is active
 *     tags: [Prompts]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [greeting, conversation, evaluation]
 *         description: The type of prompt to retrieve
 *     responses:
 *       200:
 *         description: Active prompt details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ActivePromptResponse'
 *       400:
 *         description: Invalid prompt type
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
router.get("/active/:type", getActivePrompt);

/**
 * @swagger
 * /api/prompts:
 *   post:
 *     summary: Create a new prompt
 *     description: Creates a new prompt template of the specified type
 *     tags: [Prompts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PromptCreateRequest'
 *     responses:
 *       201:
 *         description: Created prompt
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Prompt'
 *       400:
 *         description: Invalid request parameters
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
router.post("/", createPrompt);

/**
 * @swagger
 * /api/prompts/activate/{id}:
 *   put:
 *     summary: Activate a specific prompt
 *     description: Sets a specific prompt as active for its type
 *     tags: [Prompts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the prompt to activate
 *     responses:
 *       200:
 *         description: Activation success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PromptActivateResponse'
 *       400:
 *         description: Invalid prompt ID
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
router.put("/activate/:id", setActivePrompt);

export default router;