import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../utils/errors.js';

const router = Router();

/**
 * POST /telemedicine/:appointmentId/token
 *
 * Returns a LiveKit room token for the requesting user (patient or doctor).
 * The room name is tied to the appointment ID so both parties join the same room.
 */
router.post('/:appointmentId/token', requireAuth, async (req, res) => {
  const { appointmentId } = req.params;

  // 1. Load appointment
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, mode, status')
    .eq('id', appointmentId)
    .single();

  if (!appt) return notFound(res, 'Appointment');
  if (appt.mode !== 'telemedicine') {
    return res.status(400).json({ error: 'This is not a telemedicine appointment' });
  }
  if (!['confirmed', 'completed'].includes(appt.status)) {
    return res.status(400).json({ error: 'Appointment is not confirmed yet' });
  }

  // 2. Verify the requester is the patient or the doctor
  const { data: doctorRow } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', appt.doctor_id)
    .single();

  const isPatient = appt.patient_id === req.user.id;
  const isDoctor = doctorRow?.user_id === req.user.id;

  if (!isPatient && !isDoctor) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 3. Load participant display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', req.user.id)
    .single();

  const participantName = profile?.name ?? req.user.id;
  const roomName = `appt-${appointmentId}`;

  // 4. Mint a LiveKit token
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: req.user.id,
      name: participantName,
      ttl: '2h',
    }
  );

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // enables chat
  });

  const token = await at.toJwt();

  // 5. Persist meeting_url on first call so the other party can see it
  await supabase
    .from('appointments')
    .update({ meeting_url: process.env.LIVEKIT_URL, meeting_token: null })
    .eq('id', appointmentId)
    .is('meeting_url', null);

  res.json({
    token,
    room_name: roomName,
    livekit_url: process.env.LIVEKIT_URL,
  });
});

/**
 * DELETE /telemedicine/:appointmentId/end
 *
 * Doctor ends the room (kicks all participants).
 */
router.delete('/:appointmentId/end', requireAuth, async (req, res) => {
  const { appointmentId } = req.params;

  const { data: appt } = await supabase
    .from('appointments')
    .select('doctor_id')
    .eq('id', appointmentId)
    .single();

  if (!appt) return notFound(res, 'Appointment');

  const { data: doctorRow } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', appt.doctor_id)
    .single();

  if (doctorRow?.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the doctor can end the room' });
  }

  // Use LiveKit REST API to delete the room
  const roomName = `appt-${appointmentId}`;
  const response = await fetch(`${process.env.LIVEKIT_API_URL}/twirp/livekit.RoomService/DeleteRoom`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await buildAdminToken()}`,
    },
    body: JSON.stringify({ room: roomName }),
  });

  if (!response.ok) {
    return res.status(502).json({ error: 'Failed to end room' });
  }

  // Mark appointment completed
  await supabase
    .from('appointments')
    .update({ status: 'completed' })
    .eq('id', appointmentId)
    .eq('status', 'confirmed');

  res.json({ message: 'Room ended' });
});

// Build a short-lived admin token for LiveKit server API calls
async function buildAdminToken() {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { ttl: '1m' }
  );
  at.addGrant({ roomAdmin: true });
  return at.toJwt();
}

export default router;
