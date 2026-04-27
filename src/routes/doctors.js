import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const doctorProfileSchema = z.object({
  bmdc_number: z.string().optional(),
  specialty: z.string().min(1),
  sub_specialty: z.string().optional(),
  consultation_fee: z.number().min(0),
  telemedicine_fee: z.number().min(0).optional(),
  languages: z.array(z.string()).optional(),
  bio: z.string().optional(),
  experience_years: z.number().int().min(0).optional(),
  qualifications: z.array(z.string()).optional(),
  available_for_telemedicine: z.boolean().optional(),
});

const scheduleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  slot_duration_minutes: z.number().int().min(10).max(120).default(30),
  max_patients: z.number().int().optional(),
  mode: z.enum(['in_person', 'telemedicine']).default('in_person'),
  is_active: z.boolean().default(true),
});

// GET /doctors — public list of verified doctors with search/filter
router.get('/', async (req, res) => {
  const { specialty, lang, telemedicine, search, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('doctors')
    .select(`
      id, specialty, sub_specialty, consultation_fee, telemedicine_fee,
      languages, bio, experience_years, qualifications,
      available_for_telemedicine, avg_rating, review_count,
      profiles!doctors_user_id_fkey(name, avatar_url)
    `, { count: 'exact' })
    .eq('verified', true)
    .range(offset, offset + Number(limit) - 1);

  if (specialty) query = query.eq('specialty', specialty);
  if (lang) query = query.contains('languages', [lang]);
  if (telemedicine === 'true') query = query.eq('available_for_telemedicine', true);
  if (search) query = query.textSearch('specialty, bio', search, { type: 'websearch' });

  const { data, error, count } = await query;
  if (error) return dbError(res, error);

  res.json({ data, total: count, page: Number(page), limit: Number(limit) });
});

// GET /doctors/:id — single doctor profile
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('doctors')
    .select(`
      *,
      profiles!doctors_user_id_fkey(name, avatar_url, lang)
    `)
    .eq('id', req.params.id)
    .eq('verified', true)
    .single();

  if (error || !data) return notFound(res, 'Doctor');
  res.json(data);
});

// GET /doctors/:id/slots — available booking slots
router.get('/:id/slots', async (req, res) => {
  const { date_from, date_to, mode } = req.query;

  let query = supabase
    .from('doctor_slots')
    .select('*')
    .eq('doctor_id', req.params.id)
    .eq('is_booked', false)
    .or('locked_until.is.null,locked_until.lt.' + new Date().toISOString())
    .gte('slot_date', date_from ?? new Date().toISOString().split('T')[0])
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (date_to) query = query.lte('slot_date', date_to);
  if (mode) query = query.eq('mode', mode);

  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json(data);
});

// GET /doctors/:id/reviews
router.get('/:id/reviews', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data, error, count } = await supabase
    .from('reviews')
    .select(`
      id, rating, comment, created_at,
      profiles!reviews_patient_id_fkey(name, avatar_url)
    `, { count: 'exact' })
    .eq('doctor_id', req.params.id)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// GET /doctors/me — own doctor profile (requires doctor role)
router.get('/me/profile', requireAuth, requireRole('doctor'), async (req, res) => {
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return notFound(res, 'Doctor profile');
  res.json(data);
});

// POST /doctors — register as doctor (requires auth)
router.post('/', requireAuth, validate(doctorProfileSchema), async (req, res) => {
  // Check if already exists
  const { data: existing } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'Doctor profile already exists' });

  const { data, error } = await supabase
    .from('doctors')
    .insert({ ...req.body, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, error);

  // Add doctor role
  await supabase
    .from('user_roles')
    .insert({ user_id: req.user.id, role: 'doctor' })
    .onConflict('user_id, role')
    .ignore();

  res.status(201).json(data);
});

// PATCH /doctors/me — update own doctor profile
router.patch('/me', requireAuth, requireRole('doctor'), validate(doctorProfileSchema.partial()), async (req, res) => {
  const { data, error } = await supabase
    .from('doctors')
    .update(req.body)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return dbError(res, error);
  res.json(data);
});

// GET /doctors/me/schedules
router.get('/me/schedules', requireAuth, requireRole('doctor'), async (req, res) => {
  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  const { data, error } = await supabase
    .from('doctor_schedules')
    .select('*')
    .eq('doctor_id', doctor.id)
    .order('day_of_week');

  if (error) return dbError(res, error);
  res.json(data);
});

// POST /doctors/me/schedules
router.post('/me/schedules', requireAuth, requireRole('doctor'), validate(scheduleSchema), async (req, res) => {
  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  const { data, error } = await supabase
    .from('doctor_schedules')
    .insert({ ...req.body, doctor_id: doctor.id })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// PATCH /doctors/me/schedules/:scheduleId
router.patch('/me/schedules/:scheduleId', requireAuth, requireRole('doctor'), validate(scheduleSchema.partial()), async (req, res) => {
  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  const { data, error } = await supabase
    .from('doctor_schedules')
    .update(req.body)
    .eq('id', req.params.scheduleId)
    .eq('doctor_id', doctor.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Schedule');
  res.json(data);
});

// DELETE /doctors/me/schedules/:scheduleId
router.delete('/me/schedules/:scheduleId', requireAuth, requireRole('doctor'), async (req, res) => {
  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  const { error } = await supabase
    .from('doctor_schedules')
    .delete()
    .eq('id', req.params.scheduleId)
    .eq('doctor_id', doctor.id);

  if (error) return dbError(res, error);
  res.status(204).send();
});

// POST /doctors/me/slots — manually add a specific slot
router.post('/me/slots', requireAuth, requireRole('doctor'), async (req, res) => {
  const slotSchema = z.object({
    slot_date: z.string().date(),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    mode: z.enum(['in_person', 'telemedicine']).default('in_person'),
  });

  const result = slotSchema.safeParse(req.body);
  if (!result.success) return res.status(422).json({ error: result.error.flatten().fieldErrors });

  const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  const { data, error } = await supabase
    .from('doctor_slots')
    .insert({ ...result.data, doctor_id: doctor.id })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

export default router;
