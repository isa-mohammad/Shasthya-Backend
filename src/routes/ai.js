import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-3.0-flash';
const MAX_HISTORY_MESSAGES = 20; // keep last 10 exchanges in context

// ── System prompts ────────────────────────────────────────────────

const DR_SASTHYA_SYSTEM = `You are Dr. Sasthya, a friendly and knowledgeable AI health assistant for Sasthya Sathi — a Bangladeshi telemedicine platform.

Your role:
- Answer general health questions clearly and compassionately
- Help users understand symptoms, medications, and when to seek care
- Give advice relevant to Bangladesh (local diseases, climate, food, healthcare system)
- Respond in the same language the user writes in (Bengali or English)
- If a user writes in Bengali (বাংলা), always reply in Bengali

Important boundaries:
- Never diagnose a specific medical condition definitively
- Never prescribe specific medications or dosages
- For serious symptoms (chest pain, difficulty breathing, stroke signs, severe bleeding) always say: seek emergency care immediately
- Always recommend consulting a verified doctor on the platform for personalised advice
- Do not discuss topics unrelated to health and wellness

Tone: warm, clear, non-alarmist. Use simple language, avoid heavy jargon.`;

const NUTRITION_SYSTEM = `You are a nutrition expert specialised in Bangladeshi cuisine and health.

Your task: generate a detailed 7-day meal plan tailored to the user's goals and preferences.

Rules:
- Use locally available Bangladeshi foods (rice, dal, fish, vegetables, etc.)
- Include 3 meals + 1 snack per day
- Provide approximate calories and macros per day
- Respect any dietary restrictions the user mentions (diabetes, hypertension, vegetarian, etc.)
- Respond in the same language the user writes in (Bengali or English)

Format each day as:
Day X:
- Breakfast: ...
- Lunch: ...
- Snack: ...
- Dinner: ...
- ~XXXX kcal | Protein: Xg | Carbs: Xg | Fat: Xg`;

// ── Helpers ───────────────────────────────────────────────────────

async function getOrCreateSession(userId, type) {
  // Try to reuse most recent active session (today)
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('ai_chat_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .gte('created_at', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .insert({ user_id: userId, type })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function loadHistory(sessionId) {
  const { data } = await supabase
    .from('ai_chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  return (data ?? []).map(m => ({ role: m.role, content: m.content }));
}

async function saveMessages(sessionId, userMessage, assistantMessage) {
  await supabase.from('ai_chat_messages').insert([
    { session_id: sessionId, role: 'user', content: userMessage },
    { session_id: sessionId, role: 'assistant', content: assistantMessage },
  ]);
}

// ── Routes ────────────────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional(), // optionally continue an existing session
});

/**
 * POST /ai/chat
 * Dr. Sasthya general health chatbot — streaming response
 */
router.post('/chat', requireAuth, validate(chatSchema), async (req, res) => {
  const { message, session_id } = req.body;

  let sessionId;
  try {
    sessionId = session_id ?? await getOrCreateSession(req.user.id, 'doctor');
  } catch (err) {
    return dbError(res, err);
  }

  // Verify session belongs to this user
  if (session_id) {
    const { data: session } = await supabase
      .from('ai_chat_sessions')
      .select('user_id')
      .eq('id', session_id)
      .single();
    if (!session || session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const history = await loadHistory(sessionId);

  // Stream the response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Session-Id', sessionId);

  let fullResponse = '';

  try {
    // Gemini history format: role is 'user' | 'model', content uses parts array
    const geminiHistory = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = ai.chats.create({
      model: MODEL,
      config: { systemInstruction: DR_SASTHYA_SYSTEM, maxOutputTokens: 1024 },
      history: geminiHistory,
    });

    const stream = await chat.sendMessageStream({ message });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, session_id: sessionId })}\n\n`);
    res.end();

    await saveMessages(sessionId, message, fullResponse);

  } catch (err) {
    console.error('[AI Chat Error]', err);
    res.write(`data: ${JSON.stringify({ error: 'AI service error' })}\n\n`);
    res.end();
  }
});

/**
 * POST /ai/nutrition
 * 7-day Bangladeshi nutrition planner — single response (not streamed)
 */
router.post('/nutrition', requireAuth, validate(chatSchema), async (req, res) => {
  const { message, session_id } = req.body;

  let sessionId;
  try {
    sessionId = session_id ?? await getOrCreateSession(req.user.id, 'nutrition');
  } catch (err) {
    return dbError(res, err);
  }

  const history = await loadHistory(sessionId);

  try {
    const geminiHistory = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = ai.chats.create({
      model: MODEL,
      config: { systemInstruction: NUTRITION_SYSTEM, maxOutputTokens: 2048 },
      history: geminiHistory,
    });

    const response = await chat.sendMessage({ message });
    const reply = response.text;

    await saveMessages(sessionId, message, reply);

    res.json({ reply, session_id: sessionId });

  } catch (err) {
    console.error('[Nutrition AI Error]', err);
    res.status(502).json({ error: 'AI service error' });
  }
});

/**
 * GET /ai/sessions — list user's chat sessions
 */
router.get('/sessions', requireAuth, async (req, res) => {
  const { type } = req.query;

  let query = supabase
    .from('ai_chat_sessions')
    .select('id, type, created_at, updated_at')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json(data);
});

/**
 * GET /ai/sessions/:id/messages — load history for a session
 */
router.get('/sessions/:id/messages', requireAuth, async (req, res) => {
  const { data: session } = await supabase
    .from('ai_chat_sessions')
    .select('user_id')
    .eq('id', req.params.id)
    .single();

  if (!session) return notFound(res, 'Session');
  if (session.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', req.params.id)
    .order('created_at');

  if (error) return dbError(res, error);
  res.json(data);
});

/**
 * DELETE /ai/sessions/:id — clear a session
 */
router.delete('/sessions/:id', requireAuth, async (req, res) => {
  const { data: session } = await supabase
    .from('ai_chat_sessions')
    .select('user_id')
    .eq('id', req.params.id)
    .single();

  if (!session) return notFound(res, 'Session');
  if (session.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await supabase.from('ai_chat_sessions').delete().eq('id', req.params.id);
  res.status(204).send();
});

export default router;
