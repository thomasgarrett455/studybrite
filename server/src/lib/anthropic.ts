import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export const CHAT_MODEL = "claude-sonnet-5";

