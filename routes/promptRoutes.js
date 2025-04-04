import express from "express";
import { getPrompts, createPrompt, setActivePrompt, getActivePrompt } from "../controllers/promptController.js";

const router = express.Router();

// Get all prompts of a specific type
router.get("/types/:type", getPrompts);

// Get the active prompt of a specific type
router.get("/active/:type", getActivePrompt);

// Create a new prompt
router.post("/", createPrompt);

// Activate a specific prompt
router.put("/activate/:id", setActivePrompt);

export default router;