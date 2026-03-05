import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, Card, CardContent, Grid, Chip, Box, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  FormControlLabel, Checkbox, Table, TableHead, TableRow, TableCell, TableBody,
  Alert, CircularProgress, IconButton, ToggleButton, ToggleButtonGroup,
  useMediaQuery, useTheme, Collapse,
} from '@mui/material';
import { ArrowBack, Edit, History, Email, CheckCircle, Delete, Reply, Refresh, ExpandMore, ExpandLess, Send, AutoAwesome } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { Reservation, Room } from '../types';

function calcPrice(
  rooms: Room[],
  roomId: number | string,
  checkIn: string,
  checkOut: string,
  monthNames: string[],
): number | string | null {
  const room = rooms.find(r => r.id === Number(roomId));
  if (!room) return null;
  if (!checkIn || !checkOut) return null;
  const pricingMap: Record<number, number> = {};
  (room.pricing || []).forEach(p => {
    if (Number(p.price_per_night) > 0) pricingMap[p.month] = Number(p.price_per_night);
  });
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (end <= start) return null;
  let total = 0;
  const cur = new Date(start);
  while (cur < end) {
    const month = cur.getMonth() + 1;
    if (!(month in pricingMap)) return `Pokój niedostępny w ${monthNames[month]} — brak cennika dla tego miesiąca.`;
    total += pricingMap[month];
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

interface MonthBreakdown { month: number; month_name: string; nights: number; rate: number; amount: number; }

function getPriceBreakdown(
  rooms: Room[],
  roomId: number | string,
  checkIn: string,
  checkOut: string,
  monthNames: string[],
): MonthBreakdown[] | null {
  const room = rooms.find(r => r.id === Number(roomId));
  if (!room || !checkIn || !checkOut) return null;
  const pricingMap: Record<number, number> = {};
  (room.pricing || []).forEach(p => { if (Number(p.price_per_night) > 0) pricingMap[p.month] = Number(p.price_per_night); });
  if (Object.keys(pricingMap).length === 0) return null;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (end <= start) return null;
  const monthly: Record<number, number> = {};
  const cur = new Date(start);
  while (cur < end) {
    const m = cur.getMonth() + 1;
    monthly[m] = (monthly[m] || 0) + 1;
    cur.setDate(cur.getDate() + 1);
  }
  return Object.entries(monthly).map(([m, nights]) => {
    const month = Number(m);
    const rate = pricingMap[month] || 0;
    return { month, month_name: monthNames[month], nights, rate, amount: nights * rate };
  });
}

function nightsSuffix(n: number, t: (key: string) => string): string {
  if (n === 1) return t('reservationDetail.nightsSuffix_1');
  if (n >= 2 && n <= 4) return t('reservationDetail.nightsSuffix_2_4');
  return t('reservationDetail.nightsSuffix_5');
}

export default function ReservationDetailPage() {
  const { hotelId, id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { t } = useTranslation();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editPriceAutoCalc, setEditPriceAutoCalc] = useState(false);
  const [editUnavailableError, setEditUnavailableError] = useState('');
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
  const [replyText, setReplyText] = useState('');
  const [replyResult, setReplyResult] = useState<{ imapSaved?: boolean; smtpSent?: boolean; error?: string } | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' });
  const [composeAiPurpose, setComposeAiPurpose] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeAiLoading, setComposeAiLoading] = useState(false);
  const [composeResult, setComposeResult] = useState<{ sent?: boolean; error?: string } | null>(null);
  const [expandedCorr, setExpandedCorr] = useState<number | null>(null);

  const monthNames: string[] = t('months.full', { returnObjects: true }) as string[];
  const fieldLabels: Record<string, string> = t('fields', { returnObjects: true }) as Record<string, string>;

  const load = () => {
    setLoading(true);
    setError('');
    api.get(`/hotels/${hotelId}/reservations/${id}/`)
      .then(r => setReservation(r.data))
      .catch(err => setError(err.response?.data?.detail || t('reservationDetail.loadError')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get(`/hotels/${hotelId}/rooms/`).then(r => setRooms(r.data.results || r.data)).catch(() => {});
  }, [hotelId, id]);

  const handleSearchMail = async (emailOverride?: string) => {
    const resolvedEmail = emailOverride || reservation?.contact_email || '';
    if (!resolvedEmail) {
      load();
      return;
    }
    setMailLoading(true);
    try {
      await api.post(`/hotels/${hotelId}/reservations/${id}/search_mail/`, {
        email: resolvedEmail,
      });
      setTimeout(() => { load(); setMailLoading(false); }, 6000);
    } catch {
      setMailLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!confirm(t('reservationDetail.settleConfirm'))) return;
    try {
      await api.post(`/hotels/${hotelId}/reservations/${id}/settle/`);
      load();
    } catch {}
  };

  const applyAutoPrice = (patch: Record<string, any>, currentForm = form) => {
    const merged = { ...currentForm, ...patch };
    const price = calcPrice(rooms, merged.room, merged.check_in, merged.check_out, monthNames);
    if (typeof price === 'string') {
      setEditUnavailableError(price);
      setEditPriceAutoCalc(false);
      return { ...merged, remaining_amount: '' };
    }
    setEditUnavailableError('');
    if (typeof price === 'number') {
      setEditPriceAutoCalc(true);
      return { ...merged, remaining_amount: String(price) };
    }
    setEditPriceAutoCalc(false);
    return merged;
  };

  const handleEdit = () => {
    if (!reservation) return;
    setEditError('');
    setEditPriceAutoCalc(false);
    setEditUnavailableError('');
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
        setEditError(t('reservationDetail.saveEditError'));
      }
    }
  };

  const handleDeleteCorrespondence = async (corrId: number) => {
    if (!confirm(t('reservationDetail.deleteCorrespondenceConfirm'))) return;
    try {
      await api.delete(`/hotels/${hotelId}/reservations/${id}/correspondence/${corrId}/`);
      load();
    } catch {}
  };

  const openReplyDialog = (corrId: number, subject: string, senderEmail: string) => {
    setReplyToEmail(senderEmail || reservation?.contact_email || '');
    setReplyResult(null);
    setReplyText('');
    setReplyDialog({ corrId, subject, senderEmail });
  };

  const handleGenerateReply = async () => {
    if (!replyDialog) return;
    setReplyLoading(true);
    setReplyResult(null);
    try {
      const res = await api.post(
        `/hotels/${hotelId}/reservations/${id}/correspondence/${replyDialog.corrId}/reply/`,
        { to_email: replyToEmail, generate_only: true },
      );
      setReplyText(res.data.reply_text || '');
    } catch (err: any) {
      const msg = err.response?.data?.detail || t('reservationDetail.generateReplyError');
      setReplyResult({ error: msg });
    } finally {
      setReplyLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyDialog || !replyText) return;
    setReplyLoading(true);
    try {
      const res = await api.post(
        `/hotels/${hotelId}/reservations/${id}/correspondence/${replyDialog.corrId}/reply/`,
        { to_email: replyToEmail, send_via_smtp: replyMode === 'smtp', reply_text: replyText },
      );
      setReplyResult({
        imapSaved: res.data.imap_saved,
        smtpSent: res.data.smtp_sent,
        error: res.data.imap_error || res.data.smtp_error,
      });
    } catch (err: any) {
      const msg = err.response?.data?.detail || t('reservationDetail.sendError');
      setReplyResult({ error: msg });
    } finally {
      setReplyLoading(false);
    }
  };

  const openCompose = () => {
    setComposeForm({ to: reservation?.contact_email || '', subject: '', body: '' });
    setComposeAiPurpose('');
    setComposeResult(null);
    setComposeOpen(true);
  };

  const handleAiDraft = async () => {
    setComposeAiLoading(true);
    try {
      const res = await api.post(`/hotels/${hotelId}/reservations/${id}/generate-message/`, {
        purpose: composeAiPurpose,
      });
      setComposeForm(f => ({ ...f, body: res.data.draft || '' }));
    } catch (err: any) {
      setComposeResult({ error: err.response?.data?.detail || t('reservationDetail.aiDraftError') });
    } finally {
      setComposeAiLoading(false);
    }
  };

  const handleSendMessage = async () => {
    setComposeSending(true);
    setComposeResult(null);
    try {
      await api.post(`/hotels/${hotelId}/reservations/${id}/send-message/`, {
        to_email: composeForm.to,
        subject: composeForm.subject,
        body: composeForm.body,
      });
      setComposeResult({ sent: true });
      load();
    } catch (err: any) {
      setComposeResult({ error: err.response?.data?.detail || t('reservationDetail.sendMessageError') });
    } finally {
      setComposeSending(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress /></Box>;
  }

  if (error) {
    return (
      <>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
          {t('reservationDetail.backToList')}
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
      <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        {t('reservationDetail.backToList')}
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">{reservation.guest_name}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<Edit />} onClick={handleEdit}>{t('reservationDetail.editBtn')}</Button>
          <Button variant="outlined" startIcon={<Send />} onClick={openCompose}>{t('reservationDetail.writeMessage')}</Button>
          <Button variant="outlined" startIcon={mailLoading ? <CircularProgress size={20} /> : <History />}
            onClick={() => handleSearchMail()} disabled={mailLoading}>
            {t('reservationDetail.historyBtn')}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">{t('reservationDetail.reservationDetails')}</Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2">{t('reservationDetail.roomLabel')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.room_number}</Typography>
                <Typography variant="body2">{t('reservationDetail.checkIn')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.check_in}</Typography>
                <Typography variant="body2">{t('reservationDetail.checkOut')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.check_out}</Typography>
                <Typography variant="body2">{t('reservationDetail.daysCount')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.days_count}</Typography>
                {(() => {
                  const breakdown = getPriceBreakdown(rooms, reservation.room, reservation.check_in, reservation.check_out, monthNames);
                  if (!breakdown || breakdown.length === 0) return null;
                  return (
                    <>
                      <Typography variant="body2" sx={{ gridColumn: '1 / -1', mt: 0.5 }} color="text.secondary">{t('reservationDetail.pricing')}</Typography>
                      {breakdown.map(b => (
                        <>
                          <Typography key={`${b.month}-label`} variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                            {b.month_name} ({b.nights} {nightsSuffix(b.nights, t)} × {b.rate} zł):
                          </Typography>
                          <Typography key={`${b.month}-val`} variant="body2" fontWeight={500}>{b.amount} zł</Typography>
                        </>
                      ))}
                      {breakdown.length > 1 && (
                        <>
                          <Typography variant="body2" fontWeight={600}>{t('reservationDetail.pricingTotal')}</Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {breakdown.reduce((s, b) => s + b.amount, 0)} zł
                          </Typography>
                        </>
                      )}
                    </>
                  );
                })()}
                <Typography variant="body2">{t('reservationDetail.companions')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.companions}</Typography>
                <Typography variant="body2">{t('reservationDetail.animals')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.animals}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">{t('reservationDetail.paymentsContact')}</Typography>
              <Divider sx={{ my: 1 }} />
              {reservation.is_settled && (
                <Chip label={t('reservationDetail.settled')} color="success" sx={{ mb: 1 }} />
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2" sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>{t('reservationDetail.depositLabel')}</Typography>
                <Box sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                  {reservation.deposit_paid
                    ? <Chip label={`${reservation.deposit_amount} zł`} color={reservation.is_settled ? 'default' : 'success'} size="small" />
                    : <Chip label={t('reservationDetail.depositNotPaid')} size="small" />}
                </Box>
                {reservation.deposit_date && (
                  <>
                    <Typography variant="body2">{t('reservationDetail.depositDateLabel')}</Typography>
                    <Typography variant="body2" fontWeight={600}>{reservation.deposit_date}</Typography>
                  </>
                )}
                <Typography variant="body2" sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>{t('reservationDetail.surchargeLabel')}</Typography>
                <Typography variant="body2" fontWeight={600} sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                  {(parseFloat(reservation.remaining_amount) - parseFloat(reservation.deposit_amount || '0')).toFixed(2)} zł
                </Typography>
                <Typography variant="body2" sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>{t('reservationDetail.totalAmountLabel')}</Typography>
                <Typography variant="body2" fontWeight={600} sx={reservation.is_settled ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                  {reservation.remaining_amount} zł
                </Typography>
                <Typography variant="body2">{t('reservationDetail.emailLabel')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.contact_email || '—'}</Typography>
                <Typography variant="body2">{t('reservationDetail.phoneLabel')}</Typography>
                <Typography variant="body2" fontWeight={600}>{reservation.contact_phone || '—'}</Typography>
              </Box>
              {!reservation.is_settled && (
                <Box sx={{ mt: 2 }}>
                  <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={handleSettle}>
                    {t('reservationDetail.settleBtn')}
                  </Button>
                </Box>
              )}
              {reservation.notes && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" color="text.secondary">{t('reservationDetail.notesLabel')}</Typography>
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
                <TextField size="small" placeholder={t('reservationDetail.emailPlaceholder')} value={mailEmail}
                  onChange={e => setMailEmail(e.target.value)} />
                <Button size="small" startIcon={<Email />}
                  onClick={() => { handleSearchMail(mailEmail); setMailEmail(''); }}
                  disabled={!mailEmail || mailLoading}>
                  {t('common.search')}
                </Button>
              </Box>
            }>
              {t('reservationDetail.noEmailAlert')}
            </Alert>
          </Grid>
        )}

        {/* Correspondence */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('reservationDetail.correspondenceTitle', { count: correspondence.length })}
                </Typography>
                <IconButton
                  size="small"
                  title={t('reservationDetail.refreshTooltip')}
                  disabled={mailLoading}
                  onClick={() => handleSearchMail()}
                >
                  {mailLoading ? <CircularProgress size={16} /> : <Refresh fontSize="small" />}
                </IconButton>
              </Box>
              {correspondence.length === 0 ? (
                <Typography variant="body2" color="text.secondary">{t('reservationDetail.noCorrespondence')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('reservationDetail.dateHeader')}</TableCell>
                      <TableCell>{t('reservationDetail.subjectHeader')}</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {correspondence.map(c => (
                      <>
                        <TableRow
                          key={c.id}
                          hover
                          sx={{ cursor: 'pointer', '& td': { borderBottom: expandedCorr === c.id ? 0 : undefined } }}
                          onClick={() => setExpandedCorr(expandedCorr === c.id ? null : c.id)}
                        >
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {new Date(c.date).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {expandedCorr === c.id
                                ? <ExpandLess fontSize="small" sx={{ opacity: 0.5, flexShrink: 0 }} />
                                : <ExpandMore fontSize="small" sx={{ opacity: 0.5, flexShrink: 0 }} />}
                              <Typography variant="body2">{c.subject}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            <IconButton
                              size="small"
                              title={t('reservationDetail.aiReplyTitle')}
                              onClick={() => openReplyDialog(c.id, c.subject, c.sender_email)}
                            >
                              <Reply fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleDeleteCorrespondence(c.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                        <TableRow key={`${c.id}-body`}>
                          <TableCell colSpan={3} sx={{ p: 0, border: 0 }}>
                            <Collapse in={expandedCorr === c.id} unmountOnExit>
                              <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
                                {c.sender_email && (
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                    {t('reservationDetail.fromLabel', { email: c.sender_email })}
                                  </Typography>
                                )}
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {c.body}
                                </Typography>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
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
                  {t('reservationDetail.changeHistory')}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('reservationDetail.dateHeader')}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('reservationDetail.userHeader')}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('reservationDetail.actionHeader')}</TableCell>
                      <TableCell>{t('reservationDetail.changesHeader')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditLogs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(l.created_at).toLocaleString('pl-PL')}
                          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
                            {l.user_name} · {l.action}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{l.user_name}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{l.action}</TableCell>
                        <TableCell>
                          {l.changes && typeof l.changes === 'object' && Object.entries(l.changes).map(([k, v]) => (
                            <Typography key={k} variant="caption" display="block">
                              {fieldLabels[k] ?? k}: {translateFieldValue(v?.old, t)} → {translateFieldValue(v?.new, t)}
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
      <Dialog open={!!replyDialog} onClose={() => { setReplyDialog(null); setReplyResult(null); setReplyText(''); }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{t('reservationDetail.aiReplyTitle')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label={t('reservationDetail.recipientEmail')}
            value={replyToEmail}
            onChange={e => setReplyToEmail(e.target.value)}
            fullWidth
            placeholder="email@guest.com"
            disabled={!!replyResult}
          />
          <ToggleButtonGroup
            value={replyMode}
            exclusive
            onChange={(_, v) => { if (v) setReplyMode(v); }}
            size="small"
            fullWidth
            disabled={!!replyResult}
          >
            <ToggleButton value="smtp" sx={{ flex: 1 }}>{t('reservationDetail.sendViaSMTP')}</ToggleButton>
            <ToggleButton value="imap" sx={{ flex: 1 }}>{t('reservationDetail.saveToIMAP')}</ToggleButton>
          </ToggleButtonGroup>

          {replyResult?.error && <Alert severity="error">{replyResult.error}</Alert>}
          {replyResult?.smtpSent && <Alert severity="success">{t('reservationDetail.smtpSent', { email: replyToEmail })}</Alert>}
          {replyResult?.imapSaved && <Alert severity="success">{t('reservationDetail.imapSaved')}</Alert>}
          {replyResult && !replyResult.smtpSent && !replyResult.imapSaved && !replyResult.error && (
            <Alert severity="warning">{t('reservationDetail.noImapSmtp')}</Alert>
          )}

          {replyText && !replyResult && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              {t('reservationDetail.contentGenerated')}
            </Alert>
          )}
          {(replyText || replyResult) && (
            <TextField
              label={t('reservationDetail.replyContent')}
              multiline
              rows={10}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              fullWidth
              InputProps={{ readOnly: !!replyResult }}
              helperText={!replyResult ? `${replyText.length} ${t('common.characters', { count: replyText.length }).split(' ')[1] || 'znaków'}` : undefined}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button onClick={() => { setReplyDialog(null); setReplyResult(null); setReplyText(''); }}>{t('common.close')}</Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!replyResult && (
              <Button
                variant={replyText ? 'outlined' : 'contained'}
                startIcon={replyLoading && !replyText ? <CircularProgress size={18} color="inherit" /> : <Reply />}
                onClick={handleGenerateReply}
                disabled={replyLoading || !replyToEmail}
              >
                {replyText ? t('common.regenerate') : t('common.generate')}
              </Button>
            )}
            {replyText && !replyResult && (
              <Button
                variant="contained"
                startIcon={replyLoading ? <CircularProgress size={18} color="inherit" /> : undefined}
                onClick={handleSendReply}
                disabled={replyLoading || !replyToEmail || !replyText.trim()}
              >
                {replyMode === 'smtp' ? t('common.send') : t('reservationDetail.saveToIMAPBtn')}
              </Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{t('reservationDetail.composeTitle')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {composeResult?.error && <Alert severity="error">{composeResult.error}</Alert>}
          {composeResult?.sent && <Alert severity="success">{t('reservationDetail.messageSentSuccess')}</Alert>}

          <TextField
            label={t('reservationDetail.toLabel')}
            value={composeForm.to}
            onChange={e => setComposeForm(f => ({ ...f, to: e.target.value }))}
            fullWidth
            disabled={composeResult?.sent}
          />
          <TextField
            label={t('common.subject')}
            value={composeForm.subject}
            onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
            fullWidth
            disabled={composeResult?.sent}
          />
          <TextField
            label={t('common.content')}
            multiline
            rows={10}
            value={composeForm.body}
            onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
            fullWidth
            disabled={composeResult?.sent}
            helperText={composeForm.body ? `${composeForm.body.length} znaków` : undefined}
          />

          {!composeResult?.sent && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                label={t('reservationDetail.aiPurposeLabel')}
                size="small"
                value={composeAiPurpose}
                onChange={e => setComposeAiPurpose(e.target.value)}
                placeholder={t('reservationDetail.aiPurposePlaceholder')}
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={composeAiLoading ? <CircularProgress size={16} /> : <AutoAwesome />}
                onClick={handleAiDraft}
                disabled={composeAiLoading}
                sx={{ mt: 0.5, flexShrink: 0 }}
              >
                {t('common.aiDraft')}
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setComposeOpen(false)}>
            {composeResult?.sent ? t('common.close') : t('common.cancel')}
          </Button>
          {!composeResult?.sent && (
            <Button
              variant="contained"
              startIcon={composeSending ? <CircularProgress size={18} color="inherit" /> : <Send />}
              onClick={handleSendMessage}
              disabled={composeSending || !composeForm.to || !composeForm.subject || !composeForm.body.trim()}
            >
              {t('common.send')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{t('reservations.editReservation')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {editError && <Alert severity="error">{editError}</Alert>}
          <TextField label={t('common.firstName')} value={form.guest_first_name || ''}
            onChange={e => setForm({ ...form, guest_first_name: e.target.value })} fullWidth />
          <TextField label={t('common.lastName')} value={form.guest_last_name || ''}
            onChange={e => setForm({ ...form, guest_last_name: e.target.value })} fullWidth />
          <TextField label={t('common.room')} select value={form.room || ''}
            onChange={e => setForm(applyAutoPrice({ room: e.target.value }))} fullWidth>
            {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.number} ({r.capacity} {t('common.person')})</MenuItem>)}
          </TextField>
          <TextField label={t('reservations.companions')} type="number" value={form.companions ?? 0}
            onChange={e => {
              const selectedRoom = rooms.find(r => r.id === Number(form.room));
              const max = selectedRoom ? selectedRoom.capacity - 1 : 99;
              setForm({ ...form, companions: Math.min(max, Math.max(0, +e.target.value)) });
            }}
            helperText={(() => { const r = rooms.find(r => r.id === Number(form.room)); return r ? t('reservations.companionsHelper', { max: r.capacity - 1, capacity: r.capacity }) : ''; })()} />
          <TextField label={t('reservations.animals')} type="number" value={form.animals ?? 0}
            onChange={e => setForm({ ...form, animals: Math.max(0, +e.target.value) })} />
          <TextField label={t('reservations.checkIn')} type="date" InputLabelProps={{ shrink: true }}
            value={form.check_in || ''} onChange={e => setForm(applyAutoPrice({ check_in: e.target.value }))} />
          <TextField label={t('reservations.checkOut')} type="date" InputLabelProps={{ shrink: true }}
            value={form.check_out || ''} onChange={e => setForm(applyAutoPrice({ check_out: e.target.value }))} />
          <FormControlLabel control={<Checkbox checked={form.deposit_paid || false}
            onChange={e => setForm({ ...form, deposit_paid: e.target.checked })} />} label={t('reservations.depositPaid')} />
          {form.deposit_paid && (
            <>
              <TextField label={t('reservations.depositAmount')} type="number" value={form.deposit_amount || '0'}
                onChange={e => setForm({ ...form, deposit_amount: e.target.value })} />
              <TextField label={t('reservations.depositDate')} type="date" InputLabelProps={{ shrink: true }}
                value={form.deposit_date || ''} onChange={e => setForm({ ...form, deposit_date: e.target.value })} />
            </>
          )}
          {editUnavailableError && <Alert severity="error">{editUnavailableError}</Alert>}
          {!editUnavailableError && (
            <TextField
              label={t('reservations.totalAmountLabel')}
              type="number"
              value={form.remaining_amount || '0'}
              onChange={e => { setEditPriceAutoCalc(false); setForm({ ...form, remaining_amount: e.target.value }); }}
              helperText={editPriceAutoCalc ? t('reservations.priceAutoCalc') : undefined}
              color={editPriceAutoCalc ? 'success' : undefined}
            />
          )}
          <TextField label={t('common.email')} value={form.contact_email || ''}
            onChange={e => setForm({ ...form, contact_email: e.target.value })} />
          <TextField label={t('common.phone')} value={form.contact_phone || ''}
            onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
          <TextField label={t('common.notes')} multiline rows={3} value={form.notes || ''}
            onChange={e => setForm({ ...form, notes: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} disabled={!!editUnavailableError}>{t('common.save')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function translateFieldValue(value: unknown, t: (key: string) => string): string {
  if (value === true || value === 'True') return t('fieldValues.true');
  if (value === false || value === 'False') return t('fieldValues.false');
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}
