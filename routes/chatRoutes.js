import express from "express";
import { startChat, respondChat, evaluateConversation } from "../controllers/chatController.js";

const router = express.Router();

router.post("/start", startChat);

router.post("/respond", respondChat);

router.post("/evaluate", evaluateConversation);

export default router;
