import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  lang: z.enum(['en', 'bn']).optional(),
  date_of_birth: z.string().date().optional(),
  gender: z.string().optional(),
  blood_group: z.string().optional(),
  address: z.string().optional(),
});

// GET /profile
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Profile');
  res.json(data);
});

// PATCH /profile
router.patch('/', requireAuth, validate(updateProfileSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(req.body)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) return dbError(res, error);
  res.json(data);
});

// POST /profile/avatar — get a signed upload URL
router.post('/avatar/upload-url', requireAuth, async (req, res) => {
  const ext = req.body.ext ?? 'jpg';
  const path = `${req.user.id}/avatar.${ext}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUploadUrl(path);

  if (error) return dbError(res, error);
  res.json({ upload_url: data.signedUrl, path });
});

// PATCH /profile/avatar — save public URL after upload
router.patch('/avatar', requireAuth, async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path required' });

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);

  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: urlData.publicUrl })
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) return dbError(res, error);
  res.json(data);
});

export default router;
