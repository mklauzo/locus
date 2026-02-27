import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, Card, CardContent, Grid, Chip, Box, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  FormControlLabel, Checkbox, Table, TableHead, TableRow, TableCell, TableBody,
  Alert, CircularProgress, IconButton, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { ArrowBack, Edit, History, Email, CheckCircle, Delete, Reply } from '@mui/icons-material';
import api from '../api';
import { Reservation, RoomSimple } from '../types';

export default function ReservationDetailPage() {
  const { hotelId, id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [rooms, setRooms] = useState<RoomSimple[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailEmail, setMailEmail] = useState('');
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editError, setEditError] = useState('');
  const [replyDialog, setReplyDialog] = useState<{ corrId: number; subject: string; senderEmail: string } | null>(null);
  const [replyToEmail, setReplyToEmail] = useState('');
  const [replyMode, setReplyMode] = useState<'imap' | 'smtp'>('smtp');
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyResult, setReplyResult] = useState<{ text: string; imapSaved?: boolean; smtpSent?: boolean; error?: string } | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    api.get(`/hotels/${hotelId}/reservations/${id}/`)
      .then(r => setReservation(r.data))
      .catch(err => setError(err.response?.data?.detail || 'Błąd ładowania rezerwacji'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get(`/hotels/${hotelId}/rooms/`).then(r => setRooms(r.data.results || r.data)).catch(() => {});
  }, [hotelId, id]);

  const handleSearchMail = async (emailOverride?: string) => {
    setMailLoading(true);
    try {
      await api.post(`/hotels/${hotelId}/reservations/${id}/search_mail/`, {
        email: emailOverride || '',
      });
      setTimeout(() => { load(); setMailLoading(false); }, 3000);
    } catch {
      setMailLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!confirm('Czy na pewno chcesz oznaczyć rezerwację jako rozliczoną?')) return;
    try {
      await api.post(`/hotels/${hotelId}/reservations/${id}/settle/`);
      load();
    } catch {}
  };

  const handleEdit = () => {
    if (!reservation) return;
    setEditError('');
    setForm({
      room: reservation.room,
      guest_first_name: reservation.guest_first_name,
      guest_last_name: reservation.guest_last_name,
      companions: reservation.companions,
      animals: reservation.animals,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      deposit_paid: reservation.deposit_paid,
      deposit_amount: reservation.deposit_amount,
      deposit_date: reservation.deposit_date || '',
      remaining_amount: reservation.remaining_amount,
      notes: reservation.notes,
      contact_email: reservation.contact_email,
      contact_phone: reservation.contact_phone,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    setEditError('');
    try {
      await api.put(`/hotels/${hotelId}/reservations/${id}/`, {
        ...form,
        hotel: Number(hotelId),
        room: Number(form.room),
        deposit_date: form.deposit_date || null,
      });
      setEditOpen(false);
      load();
    } catch (err: any) {
      const resp = err.response?.data;
      if (resp) {
        const msgs = typeof resp === 'string' ? resp
          : Array.isArray(resp) ? resp.join(', ')
          : Object.entries(resp).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ');
        setEditError(msgs);
      } else {
        setEditError('Błąd zapisywania');
      }
    }
  };

  const handleDeleteCorrespondence = async (corrId: number) => {
    if (!confirm('Czy na pewno chcesz usunąć tę korespondencję?')) return;
    try {
      await api.delete(`/hotels/${hotelId}/reservations/${id}/correspondence/${corrId}/`);
      load();
    } catch {}
  };

  const openReplyDialog = (corrId: number, subject: string, senderEmail: string) => {
    setReplyToEmail(senderEmail || reservation?.contact_email || '');
    setReplyResult(null);
    setReplyDialog({ corrId, subject, senderEmail });
  };

  const handleGenerateReply = async () => {
    if (!replyDialog) return;
    setReplyLoading(true);
    setReplyResult(null);
    try {
      const res = await api.post(
        `/hotels/${hotelId}/reservations/${id}/correspondence/${replyDialog.corrId}/reply/`,
        { to_email: replyToEmail, send_via_smtp: replyMode === 'smtp' },
      );
      setReplyResult({
        text: res.data.reply_text,
        imapSaved: res.data.imap_saved,
        smtpSent: res.data.smtp_sent,
        error: res.data.imap_error || res.data.smtp_error,
      });
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Błąd generowania odpowiedzi.';
      setReplyResult({ text: '', error: msg });
    } finally {
      setReplyLoading(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress /></Box>;
  }

  if (error) {
    return (
      <>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}/reservations`)} sx={{ mb: 2 }}>
          Powrót do listy
        </Button>
        <Alert severity="error">{error}</Alert>
      </>
    );
  }

  if (!reservation) return null;

  const correspondence = reservation.correspondence || [];
  const auditLogs = reservation.audit_logs || [];

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}/reservations`)} sx={{ mb: 2 }}>
        Powrót do listy
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">{reservation.guest_name}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<Edit />} onClick={handleEdit}>Edytuj</Button>
          <Button variant="outlined" startIcon={mailLoading ? <CircularProgress size={20} /> : <History />}
            onClick={() => handleSearchMail()} disabled={mailLoading}>
            Historia
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Szczegóły rezerwacji</Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2">Pokój:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.room_number}</Typography>
                <Typography variant="body2">Zameldowanie:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.check_in}</Typography>
                <Typography variant="body2">Wymeldowanie:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.check_out}</Typography>
                <Typography variant="body2">Liczba dni:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.days_count}</Typography>
                <Typography variant="body2">Osoby towarzyszące:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.companions}</Typography>
                <Typography variant="body2">Zwierzęta:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.animals}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Płatności i kontakt</Typography>
              <Divider sx={{ my: 1 }} />
              {reservation.is_settled && (
                <Chip label="Rozliczono" color="success" sx={{ mb: 1 }} />
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2" sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>Zaliczka:</Typography>
                <Box sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                  {reservation.deposit_paid
                    ? <Chip label={`${reservation.deposit_amount} zł`} color={reservation.is_settled ? 'default' : 'success'} size="small" />
                    : <Chip label="Nie wpłacona" size="small" />}
                </Box>
                {reservation.deposit_date && (
                  <>
                    <Typography variant="body2">Data wpłaty:</Typography>
                    <Typography variant="body2" fontWeight={600}>{reservation.deposit_date}</Typography>
                  </>
                )}
                <Typography variant="body2" sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>Dopłata:</Typography>
                <Typography variant="body2" fontWeight={600} sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                  {(parseFloat(reservation.remaining_amount) - parseFloat(reservation.deposit_amount || '0')).toFixed(2)} zł
                </Typography>
                <Typography variant="body2" sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>Do zapłaty:</Typography>
                <Typography variant="body2" fontWeight={600} sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                  {reservation.remaining_amount} zł
                </Typography>
                <Typography variant="body2">Email:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.contact_email || '—'}</Typography>
                <Typography variant="body2">Telefon:</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.contact_phone || '—'}</Typography>
              </Box>
              {!reservation.is_settled && (
                <Box sx={{ mt: 2 }}>
                  <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={handleSettle}>
                    Rozlicz
                  </Button>
                </Box>
              )}
              {reservation.notes && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" color="text.secondary">Uwagi:</Typography>
                  <Typography variant="body2">{reservation.notes}</Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Manual email search */}
        {!reservation.contact_email && correspondence.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info" action={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField size="small" placeholder="Email gościa" value={mailEmail}
                  onChange={e => setMailEmail(e.target.value)} />
                <Button size="small" startIcon={<Email />}
                  onClick={() => { handleSearchMail(mailEmail); setMailEmail(''); }}
                  disabled={!mailEmail || mailLoading}>
                  Szukaj
                </Button>
              </Box>
            }>
              Nie znaleziono korespondencji po nazwisku. Podaj email gościa, aby ponowić wyszukiwanie.
            </Alert>
          </Grid>
        )}

        {/* Correspondence */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Historia korespondencji ({correspondence.length})
              </Typography>
              {correspondence.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Brak korespondencji</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Data</TableCell>
                      <TableCell>Temat</TableCell>
                      <TableCell>Treść</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {correspondence.map(c => (
                      <TableRow key={c.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(c.date).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell>{c.subject}</TableCell>
                        <TableCell sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.body}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <IconButton
                            size="small"
                            title="Generuj odpowiedź AI"
                            onClick={() => openReplyDialog(c.id, c.subject, c.sender_email)}
                          >
                            <Reply fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteCorrespondence(c.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Audit log */}
        {auditLogs.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Historia zmian
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Data</TableCell>
                      <TableCell>Użytkownik</TableCell>
                      <TableCell>Akcja</TableCell>
                      <TableCell>Zmiany</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditLogs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(l.created_at).toLocaleString('pl-PL')}
                        </TableCell>
                        <TableCell>{l.user_name}</TableCell>
                        <TableCell>{l.action}</TableCell>
                        <TableCell>
                          {l.changes && typeof l.changes === 'object' && Object.entries(l.changes).map(([k, v]) => (
                            <Typography key={k} variant="caption" display="block">
                              {k}: {v?.old} → {v?.new}
                            </Typography>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Reply Dialog */}
      <Dialog open={!!replyDialog} onClose={() => { setReplyDialog(null); setReplyResult(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Generuj odpowiedź AI</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {!replyResult && (
            <>
              <TextField
                label="Adres e-mail odbiorcy"
                value={replyToEmail}
                onChange={e => setReplyToEmail(e.target.value)}
                fullWidth
                placeholder="email@gości.pl"
              />
              <ToggleButtonGroup
                value={replyMode}
                exclusive
                onChange={(_, v) => { if (v) setReplyMode(v); }}
                size="small"
                fullWidth
              >
                <ToggleButton value="smtp" sx={{ flex: 1 }}>
                  Wyślij emailem (SMTP)
                </ToggleButton>
                <ToggleButton value="imap" sx={{ flex: 1 }}>
                  Zapisz do roboczych (IMAP)
                </ToggleButton>
              </ToggleButtonGroup>
              <Alert severity="info">
                {replyMode === 'smtp'
                  ? 'Email zostanie wysłany bezpośrednio do gościa przez serwer SMTP hotelu.'
                  : 'Odpowiedź zostanie zapisana w folderze Wersje robocze na skrzynce hotelu.'}
              </Alert>
            </>
          )}
          {replyResult && replyResult.error && !replyResult.text && (
            <Alert severity="error">{replyResult.error}</Alert>
          )}
          {replyResult?.smtpSent && (
            <Alert severity="success">Email wysłany do {replyToEmail}.</Alert>
          )}
          {replyResult?.imapSaved && (
            <Alert severity="success">Odpowiedź zapisana w folderze Wersje robocze.</Alert>
          )}
          {replyResult && !replyResult.smtpSent && !replyResult.imapSaved && replyResult.text && (
            <Alert severity="warning">
              {replyResult.error
                ? `Błąd: ${replyResult.error}. Treść poniżej — możesz ją skopiować.`
                : 'Brak konfiguracji IMAP/SMTP. Treść poniżej — możesz ją skopiować.'}
            </Alert>
          )}
          {replyResult?.text && (
            <TextField
              label="Wygenerowana odpowiedź"
              multiline
              rows={8}
              value={replyResult.text}
              fullWidth
              InputProps={{ readOnly: true }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setReplyDialog(null); setReplyResult(null); }}>Zamknij</Button>
          {!replyResult && (
            <Button
              variant="contained"
              startIcon={replyLoading ? <CircularProgress size={18} /> : <Reply />}
              onClick={handleGenerateReply}
              disabled={replyLoading || !replyToEmail}
            >
              {replyMode === 'smtp' ? 'Generuj i wyślij' : 'Generuj i zapisz'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edytuj rezerwację</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {editError && <Alert severity="error">{editError}</Alert>}
          <TextField label="Imię" value={form.guest_first_name || ''}
            onChange={e => setForm({ ...form, guest_first_name: e.target.value })} fullWidth />
          <TextField label="Nazwisko" value={form.guest_last_name || ''}
            onChange={e => setForm({ ...form, guest_last_name: e.target.value })} fullWidth />
          <TextField label="Pokój" select value={form.room || ''}
            onChange={e => setForm({ ...form, room: e.target.value })} fullWidth>
            {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.number} ({r.capacity} os.)</MenuItem>)}
          </TextField>
          <TextField label="Osoby towarzyszące" type="number" value={form.companions ?? 0}
            onChange={e => {
              const selectedRoom = rooms.find(r => r.id === Number(form.room));
              const max = selectedRoom ? selectedRoom.capacity - 1 : 99;
              setForm({ ...form, companions: Math.min(max, Math.max(0, +e.target.value)) });
            }}
            helperText={(() => { const r = rooms.find(r => r.id === Number(form.room)); return r ? `Max: ${r.capacity - 1} (pojemność pokoju: ${r.capacity})` : ''; })()} />
          <TextField label="Zwierzęta" type="number" value={form.animals ?? 0}
            onChange={e => setForm({ ...form, animals: Math.max(0, +e.target.value) })} />
          <TextField label="Data zameldowania" type="date" InputLabelProps={{ shrink: true }}
            value={form.check_in || ''} onChange={e => setForm({ ...form, check_in: e.target.value })} />
          <TextField label="Data wymeldowania" type="date" InputLabelProps={{ shrink: true }}
            value={form.check_out || ''} onChange={e => setForm({ ...form, check_out: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={form.deposit_paid || false}
            onChange={e => setForm({ ...form, deposit_paid: e.target.checked })} />} label="Zaliczka wpłacona" />
          {form.deposit_paid && (
            <>
              <TextField label="Kwota zaliczki" type="number" value={form.deposit_amount || '0'}
                onChange={e => setForm({ ...form, deposit_amount: e.target.value })} />
              <TextField label="Data wpłaty" type="date" InputLabelProps={{ shrink: true }}
                value={form.deposit_date || ''} onChange={e => setForm({ ...form, deposit_date: e.target.value })} />
            </>
          )}
          <TextField label="Kwota do zapłaty" type="number" value={form.remaining_amount || '0'}
            onChange={e => setForm({ ...form, remaining_amount: e.target.value })} />
          <TextField label="Email" value={form.contact_email || ''}
            onChange={e => setForm({ ...form, contact_email: e.target.value })} />
          <TextField label="Telefon" value={form.contact_phone || ''}
            onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
          <TextField label="Uwagi" multiline rows={3} value={form.notes || ''}
            onChange={e => setForm({ ...form, notes: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleSave}>Zapisz</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
