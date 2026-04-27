import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const postSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  image_url: z.string().url().optional(),
});

const commentSchema = z.object({
  body: z.string().min(1),
  parent_id: z.string().uuid().optional(),
});

// GET /community/posts
router.get('/posts', async (req, res) => {
  const { category, search, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('community_posts')
    .select(`
      id, title, body, category, tags, image_url, is_pinned,
      view_count, created_at, updated_at,
      profiles!community_posts_user_id_fkey(name, avatar_url),
      post_likes(count),
      post_comments(count)
    `, { count: 'exact' })
    .eq('is_hidden', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (category) query = query.eq('category', category);
  if (search) query = query.ilike('title', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// GET /community/posts/:id
router.get('/posts/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('community_posts')
    .select(`
      *,
      profiles!community_posts_user_id_fkey(name, avatar_url),
      post_likes(count),
      post_comments(count)
    `)
    .eq('id', req.params.id)
    .eq('is_hidden', false)
    .single();

  if (error || !data) return notFound(res, 'Post');

  supabase.from('community_posts').update({ view_count: data.view_count + 1 }).eq('id', data.id);
  res.json(data);
});

// POST /community/posts
router.post('/posts', requireAuth, validate(postSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('community_posts')
    .insert({ ...req.body, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// PATCH /community/posts/:id
router.patch('/posts/:id', requireAuth, validate(postSchema.partial()), async (req, res) => {
  const { data, error } = await supabase
    .from('community_posts')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Post');
  res.json(data);
});

// DELETE /community/posts/:id
router.delete('/posts/:id', requireAuth, async (req, res) => {
  const { data: post } = await supabase
    .from('community_posts')
    .select('user_id')
    .eq('id', req.params.id)
    .single();

  if (!post) return notFound(res, 'Post');

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', req.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (post.user_id !== req.user.id && !roles) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { error } = await supabase.from('community_posts').delete().eq('id', req.params.id);
  if (error) return dbError(res, error);
  res.status(204).send();
});

// GET /community/posts/:id/comments
router.get('/posts/:id/comments', async (req, res) => {
  const { data, error } = await supabase
    .from('post_comments')
    .select(`
      id, body, parent_id, created_at, updated_at,
      profiles!post_comments_user_id_fkey(name, avatar_url)
    `)
    .eq('post_id', req.params.id)
    .eq('is_hidden', false)
    .order('created_at');

  if (error) return dbError(res, error);
  res.json(data);
});

// POST /community/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ ...req.body, post_id: req.params.id, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// DELETE /community/comments/:id
router.delete('/comments/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return dbError(res, error);
  res.status(204).send();
});

// POST /community/posts/:id/like
router.post('/posts/:id/like', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('post_likes')
    .insert({ post_id: req.params.id, user_id: req.user.id })
    .select()
    .single();

  if (error?.code === '23505') return res.status(409).json({ error: 'Already liked' });
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// DELETE /community/posts/:id/like
router.delete('/posts/:id/like', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return dbError(res, error);
  res.status(204).send();
});

// POST /community/posts/:id/report — increment report count
router.post('/posts/:id/report', requireAuth, async (req, res) => {
  const { data: post } = await supabase
    .from('community_posts')
    .select('report_count')
    .eq('id', req.params.id)
    .single();

  if (!post) return notFound(res, 'Post');

  await supabase
    .from('community_posts')
    .update({ report_count: post.report_count + 1 })
    .eq('id', req.params.id);

  res.json({ message: 'Reported' });
});

// PATCH /community/posts/:id/hide — admin moderation
router.patch('/posts/:id/hide', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('community_posts')
    .update({ is_hidden: true })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Post');
  res.json(data);
});

export default router;
