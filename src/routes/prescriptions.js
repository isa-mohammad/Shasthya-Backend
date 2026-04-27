import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const medicineSchema = z.object({
  medicine_name: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1),
  instructions: z.string().optional(),
});

const prescriptionSchema = z.object({
  appointment_id: z.string().uuid(),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  follow_up_date: z.string().date().optional(),
  medicines: z.array(medicineSchema).min(1),
});

// GET /prescriptions — patient gets their own
router.get('/', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data, error, count } = await supabase
    .from('prescriptions')
    .select(`
      *,
      prescription_medicines(*),
      doctors(specialty, profiles!doctors_user_id_fkey(name))
    `, { count: 'exact' })
    .eq('patient_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// GET /prescriptions/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      *,
      prescription_medicines(*),
      doctors(specialty, profiles!doctors_user_id_fkey(name, avatar_url)),
      appointments(doctor_slots(slot_date))
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !data) return notFound(res, 'Prescription');

  const { data: doctorRow } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', data.doctor_id)
    .single();

  const isPatient = data.patient_id === req.user.id;
  const isDoctor = doctorRow?.user_id === req.user.id;
  if (!isPatient && !isDoctor) return res.status(403).json({ error: 'Forbidden' });

  res.json(data);
});

// POST /prescriptions — doctor creates prescription
router.post('/', requireAuth, requireRole('doctor'), validate(prescriptionSchema), async (req, res) => {
  const { appointment_id, diagnosis, notes, follow_up_date, medicines } = req.body;

  // Verify the appointment belongs to this doctor
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  if (!doctor) return notFound(res, 'Doctor profile');

  const { data: appt } = await supabase
    .from('appointments')
    .select('patient_id, doctor_id')
    .eq('id', appointment_id)
    .single();

  if (!appt || appt.doctor_id !== doctor.id) {
    return res.status(403).json({ error: 'Forbidden: appointment does not belong to you' });
  }

  // Create prescription
  const { data: prescription, error: prescError } = await supabase
    .from('prescriptions')
    .insert({
      appointment_id,
      doctor_id: doctor.id,
      patient_id: appt.patient_id,
      diagnosis,
      notes,
      follow_up_date,
    })
    .select()
    .single();

  if (prescError) return dbError(res, prescError);

  // Insert medicines
  const medicineRows = medicines.map(m => ({ ...m, prescription_id: prescription.id }));
  const { data: meds, error: medError } = await supabase
    .from('prescription_medicines')
    .insert(medicineRows)
    .select();

  if (medError) return dbError(res, medError);

  res.status(201).json({ ...prescription, medicines: meds });
});

// POST /prescriptions/:id/upload-url — doctor gets signed URL to attach a PDF
router.post('/:id/upload-url', requireAuth, requireRole('doctor'), async (req, res) => {
  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  const { data: prescription } = await supabase
    .from('prescriptions').select('id, doctor_id').eq('id', req.params.id).single();
  if (!prescription) return notFound(res, 'Prescription');
  if (prescription.doctor_id !== doctor.id) return res.status(403).json({ error: 'Forbidden' });

  const ext = req.body.ext ?? 'pdf';
  const path = `${doctor.id}/${req.params.id}.${ext}`;

  const { data, error } = await supabase.storage
    .from('prescriptions')
    .createSignedUploadUrl(path);

  if (error) return dbError(res, error);
  res.json({ upload_url: data.signedUrl, path });
});

// PATCH /prescriptions/:id/file — save file URL after upload
router.patch('/:id/file', requireAuth, requireRole('doctor'), async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path required' });

  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('user_id', req.user.id).single();
  if (!doctor) return notFound(res, 'Doctor profile');

  // Generate a long-lived signed URL (1 year) stored in DB
  const { data: signedData, error: signedError } = await supabase.storage
    .from('prescriptions')
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  if (signedError) return dbError(res, signedError);

  const { data, error } = await supabase
    .from('prescriptions')
    .update({ file_url: signedData.signedUrl })
    .eq('id', req.params.id)
    .eq('doctor_id', doctor.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Prescription');
  res.json(data);
});

// GET /prescriptions/:id/file — get a fresh signed download URL
router.get('/:id/file', requireAuth, async (req, res) => {
  const { data: prescription } = await supabase
    .from('prescriptions').select('patient_id, doctor_id, file_url').eq('id', req.params.id).single();
  if (!prescription) return notFound(res, 'Prescription');

  const { data: doctorRow } = await supabase
    .from('doctors').select('user_id').eq('id', prescription.doctor_id).single();

  const isPatient = prescription.patient_id === req.user.id;
  const isDoctor = doctorRow?.user_id === req.user.id;
  if (!isPatient && !isDoctor) return res.status(403).json({ error: 'Forbidden' });
  if (!prescription.file_url) return res.status(404).json({ error: 'No file attached to this prescription' });

  // Extract path from stored URL and issue a fresh 1-hour signed URL
  const pathMatch = prescription.file_url.match(/\/prescriptions\/(.+?)(\?|$)/);
  if (!pathMatch) return res.status(500).json({ error: 'Could not resolve file path' });

  const { data, error } = await supabase.storage
    .from('prescriptions')
    .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);

  if (error) return dbError(res, error);
  res.json({ signed_url: data.signedUrl, expires_in: 3600 });
});

// GET /prescriptions/doctor/list — doctor's issued prescriptions
router.get('/doctor/list', requireAuth, requireRole('doctor'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  if (!doctor) return notFound(res, 'Doctor profile');

  const { data, error, count } = await supabase
    .from('prescriptions')
    .select(`
      *,
      prescription_medicines(*),
      profiles!prescriptions_patient_id_fkey(name, avatar_url)
    `, { count: 'exact' })
    .eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

export default router;
