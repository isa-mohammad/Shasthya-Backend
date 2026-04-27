import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  lang: z.enum(['en', 'bn']).optional().default('en'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const emailOtpSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().min(6).max(6),
  type: z.enum(['signup', 'email']).default('email'),
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

const resetVerifySchema = z.object({
  token_hash: z.string().min(1),
});

// POST /auth/signup — email + password
router.post('/signup', validate(signupSchema), async (req, res) => {
  const { email, password, name, lang } = req.body;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { name, lang },
  });

  if (error) return res.status(400).json({ error: error.message });

  // Trigger profile creation manually in case trigger hasn't fired yet
  await supabase.from('profiles').upsert({ id: data.user.id, name, lang });

  res.status(201).json({ message: 'Account created. Please verify your email.' });
});

// POST /auth/login — email + password
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return res.status(401).json({ error: error.message });

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id);

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email,
      roles: roles?.map(r => r.role) ?? [],
    },
  });
});

// POST /auth/otp/send — send email OTP (magic link / OTP)
router.post('/otp/send', validate(emailOtpSchema), async (req, res) => {
  const { email } = req.body;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'OTP sent to email' });
});

// POST /auth/otp/verify — verify email OTP
router.post('/otp/verify', validate(verifyOtpSchema), async (req, res) => {
  const { email, token, type } = req.body;

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });

  if (error) return res.status(401).json({ error: error.message });

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id);

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email,
      roles: roles?.map(r => r.role) ?? [],
    },
  });
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: error.message });

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
});

// POST /auth/password/reset-request
router.post('/password/reset-request', validate(resetRequestSchema), async (req, res) => {
  const { email } = req.body;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL,
  });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password reset email sent' });
});

// POST /auth/password/reset-verify — exchange token_hash from email link for a session
// Frontend calls this after user lands on the reset-password page with ?token_hash=xxx&type=recovery
router.post('/password/reset-verify', validate(resetVerifySchema), async (req, res) => {
  const { token_hash } = req.body;

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash,
    type: 'recovery',
  });

  if (error || !data.session) {
    return res.status(401).json({ error: 'Invalid or expired reset link' });
  }

  // Return a short-lived session — frontend uses access_token to call /password/update
  res.json({
    access_token: data.session.access_token,
    expires_at: data.session.expires_at,
  });
});

// POST /auth/password/update — update password (requires valid session)
router.post('/password/update', requireAuth, validate(resetPasswordSchema), async (req, res) => {
  const { password } = req.body;

  const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password updated successfully' });
});

// POST /auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  // Invalidate all sessions for this user (service role required)
  const { error } = await supabase.auth.admin.signOut(req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Logged out' });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', req.user.id);

  res.json({
    id: req.user.id,
    email: req.user.email,
    roles: roles?.map(r => r.role) ?? [],
    profile,
  });
});

export default router;
