import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const articleSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  title_bn: z.string().optional(),
  body: z.string().min(1),
  body_bn: z.string().optional(),
  excerpt: z.string().optional(),
  cover_image_url: z.string().url().optional(),
  category: z.string().min(1),
  tags: z.array(z.string()).optional(),
  published: z.boolean().default(false),
});

// GET /articles — public list of published articles
router.get('/', async (req, res) => {
  const { category, tag, search, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('articles')
    .select(`
      id, slug, title, title_bn, excerpt, cover_image_url,
      category, tags, published_at, view_count,
      profiles!articles_author_id_fkey(name, avatar_url)
    `, { count: 'exact' })
    .eq('published', true)
    .order('published_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (category) query = query.eq('category', category);
  if (tag) query = query.contains('tags', [tag]);
  if (search) query = query.textSearch('title, body', search, { type: 'websearch' });

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// GET /articles/:slug
router.get('/:slug', async (req, res) => {
  const { data, error } = await supabase
    .from('articles')
    .select(`
      *,
      profiles!articles_author_id_fkey(name, avatar_url)
    `)
    .eq('slug', req.params.slug)
    .eq('published', true)
    .single();

  if (error || !data) return notFound(res, 'Article');

  // Increment view count (fire and forget)
  supabase.from('articles').update({ view_count: data.view_count + 1 }).eq('id', data.id);

  res.json(data);
});

// GET /articles/categories/list — distinct categories
router.get('/categories/list', async (req, res) => {
  const { data, error } = await supabase
    .from('articles')
    .select('category')
    .eq('published', true);

  if (error) return dbError(res, error);
  const categories = [...new Set(data.map(r => r.category))].sort();
  res.json(categories);
});

// POST /articles — admin/author create
router.post('/', requireAuth, requireRole('admin'), validate(articleSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('articles')
    .insert({
      ...req.body,
      author_id: req.user.id,
      published_at: req.body.published ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// PATCH /articles/:id — admin/author update
router.patch('/:id', requireAuth, requireRole('admin'), validate(articleSchema.partial()), async (req, res) => {
  const updates = { ...req.body };
  if (updates.published === true) updates.published_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('articles')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Article');
  res.json(data);
});

// DELETE /articles/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('articles').delete().eq('id', req.params.id);
  if (error) return dbError(res, error);
  res.status(204).send();
});

export default router;
