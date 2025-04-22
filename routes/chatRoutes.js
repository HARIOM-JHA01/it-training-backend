import express from "express";
import { startChat, respondChat, evaluateConversation, evaluateScores, getModelAnswers } from "../controllers/chatController.js";

const router = express.Router();

router.post("/start-session", startChat);

router.post("/respond", respondChat);

router.post("/evaluate", evaluateConversation);

router.post("/evaluate-scores", evaluateScores);

router.post("/model-answers", getModelAnswers);

export default router;
