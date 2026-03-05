import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Card, CardContent, Grid, Button, Box, Chip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText,
  TextField, Divider,
} from '@mui/material';
import {
  MeetingRoom, EventNote, CalendarMonth, ArrowBack, Email, SmartToy, MailOutline, Search, PendingActions, Reply, AutoAwesome, Inventory, BarChart, DeleteOutline,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { Hotel, Inquiry } from '../types';

export default function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapResult, setImapResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inquiriesOpen, setInquiriesOpen] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inquiriesError, setInquiriesError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState<string | null>(null);
  const [emailExistsDialog, setEmailExistsDialog] = useState<{ email: string; reservations: any[]; inquiry: Inquiry | null } | null>(null);
  const [replyDialog, setReplyDialog] = useState<Inquiry | null>(null);
  const [replyForm, setReplyForm] = useState({ subject: '', body: '' });
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);
  const [replyAiPurpose, setReplyAiPurpose] = useState('');
  const [replyAiLoading, setReplyAiLoading] = useState(false);
  const [deletingInquiry, setDeletingInquiry] = useState<string | null>(null);
  const [reservationCount, setReservationCount] = useState<number | null>(null);
  const [preliminaryCount, setPreliminaryCount] = useState<number | null>(null);
  const [confirmedNewMail, setConfirmedNewMail] = useState(() =>
    parseInt(localStorage.getItem(`locus_badge_confirmed_${id}`) || '0')
  );
  const [preliminaryNewMail, setPreliminaryNewMail] = useState(() =>
    parseInt(localStorage.getItem(`locus_badge_preliminary_${id}`) || '0')
  );
  const [inquiryBadgeCount, setInquiryBadgeCount] = useState(() =>
    parseInt(localStorage.getItem(`locus_badge_inquiry_${id}`) || '0')
  );

  const loadMailCounts = () => {
    api.get(`/hotels/${id}/reservations/?deposit_paid=true&has_new_mail=true&is_settled=false`).then(r => {
      const n = r.data.count ?? (r.data.results || r.data).length;
      setConfirmedNewMail(n);
      localStorage.setItem(`locus_badge_confirmed_${id}`, String(n));
    }).catch(() => {});
    api.get(`/hotels/${id}/reservations/?deposit_paid=false&has_new_mail=true`).then(r => {
      const n = r.data.count ?? (r.data.results || r.data).length;
      setPreliminaryNewMail(n);
      localStorage.setItem(`locus_badge_preliminary_${id}`, String(n));
    }).catch(() => {});
  };

  useEffect(() => {
    api.get(`/hotels/${id}/`).then(r => setHotel(r.data));
    api.get(`/hotels/${id}/reservations/?deposit_paid=true`).then(r => {
      setReservationCount(r.data.count ?? (r.data.results || r.data).length);
    });
    api.get(`/hotels/${id}/reservations/?deposit_paid=false`).then(r => {
      setPreliminaryCount(r.data.count ?? (r.data.results || r.data).length);
    });
    loadMailCounts();
  }, [id]);

  useEffect(() => {
    const interval = setInterval(loadMailCounts, 60000);
    return () => clearInterval(interval);
  }, [id]);

  const handleTestImap = async () => {
    if (!hotel) return;
    setImapResult(null);
    setImapTesting(true);
    try {
      const res = await api.post(`/hotels/${id}/test_imap/`, {});
      setImapResult({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setImapResult({ type: 'error', text: err.response?.data?.message || t('hotels.connectionError') });
    } finally {
      setImapTesting(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!hotel) return;
    setSmtpResult(null);
    setSmtpTesting(true);
    try {
      const res = await api.post(`/hotels/${id}/test_smtp/`, {});
      setSmtpResult({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setSmtpResult({ type: 'error', text: err.response?.data?.message || t('hotels.connectionError') });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleSearchInquiries = async () => {
    setInquiriesError(null);
    setInquiriesLoading(true);
    try {
      const res = await api.post(`/hotels/${id}/search-inquiries/`, {});
      setInquiries(res.data);
      const n = (res.data as any[]).length;
      setInquiryBadgeCount(n);
      localStorage.setItem(`locus_badge_inquiry_${id}`, String(n));
    } catch (err: any) {
      setInquiriesError(err.response?.data?.detail || t('hotelDetail.searchError'));
    } finally {
      setInquiriesLoading(false);
    }
  };

  const handleInquiryAction = async (inq: Inquiry) => {
    setEmailChecking(inq.from_email);
    try {
      const res = await api.get(`/hotels/${id}/reservations/?search=${encodeURIComponent(inq.from_email)}`);
      const results = res.data.results || res.data;
      if (results.length > 0) {
        setEmailExistsDialog({ email: inq.from_email, reservations: results, inquiry: inq });
      } else {
        setInquiriesOpen(false);
        navigate(`/hotels/${id}/reservations?filter=preliminary`, { state: { openNew: true, email: inq.from_email, inquiry: inq } });
      }
    } catch {
      setInquiriesOpen(false);
      navigate(`/hotels/${id}/reservations?filter=preliminary`, { state: { openNew: true, email: inq.from_email, inquiry: inq } });
    } finally {
      setEmailChecking(null);
    }
  };

  const handleDeleteInquiry = async (inq: Inquiry) => {
    if (!confirm(t('hotelDetail.deleteInquiryConfirm', { name: inq.from_name }))) return;
    setDeletingInquiry(inq.message_id);
    try {
      await api.post(`/hotels/${id}/delete-inquiry/`, { message_id: inq.message_id });
      setInquiries(prev => prev ? prev.filter(i => i.message_id !== inq.message_id) : prev);
      const remaining = (inquiries?.length ?? 1) - 1;
      setInquiryBadgeCount(remaining);
      localStorage.setItem(`locus_badge_inquiry_${id}`, String(remaining));
    } catch (err: any) {
      alert(err.response?.data?.detail || t('hotelDetail.deleteMessageError'));
    } finally {
      setDeletingInquiry(null);
    }
  };

  const handleOpenReply = (inq: Inquiry) => {
    setReplyDialog(inq);
    setReplyForm({ subject: `Re: ${inq.subject}`, body: '' });
    setReplyError(null);
    setReplySuccess(false);
    setReplyAiPurpose('');
  };

  const handleAiDraftReply = async () => {
    if (!replyDialog) return;
    setReplyAiLoading(true);
    setReplyError(null);
    try {
      const res = await api.post(`/hotels/${id}/generate-inquiry-reply/`, {
        from_name: replyDialog.from_name,
        from_email: replyDialog.from_email,
        subject: replyDialog.subject,
        body_preview: replyDialog.body_preview,
        purpose: replyAiPurpose,
      });
      setReplyForm(f => ({ ...f, body: res.data.draft }));
    } catch (err: any) {
      setReplyError(err.response?.data?.detail || t('hotelDetail.aiDraftError'));
    } finally {
      setReplyAiLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyDialog) return;
    if (!hotel?.smtp_host) {
      setReplyError(t('hotelDetail.smtpNotConfigured'));
      return;
    }
    setReplySending(true);
    setReplyError(null);
    try {
      await api.post(`/hotels/${id}/send-inquiry-reply/`, {
        to_email: replyDialog.from_email,
        subject: replyForm.subject,
        body: replyForm.body,
      });
      setReplySuccess(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const httpStatus = err.response?.status;
      setReplyError(
        detail
          ? detail
          : httpStatus
            ? t('hotelDetail.serverError', { status: httpStatus })
            : t('hotelDetail.networkError'),
      );
    } finally {
      setReplySending(false);
    }
  };

  if (!hotel) return null;

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/')} sx={{ mb: 2 }}>
        {t('hotelDetail.backToList')}
      </Button>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 1 }}>{hotel.name}</Typography>
          <Typography color="text.secondary">{hotel.address}</Typography>
          <Typography color="text.secondary">{hotel.email}</Typography>
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {hotel.imap_host && (
              <>
                <Chip label={`IMAP: ${hotel.imap_host}`} size="small" />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={imapTesting ? <CircularProgress size={16} /> : <Email />}
                  onClick={handleTestImap}
                  disabled={imapTesting}
                >
                  {t('hotels.testImapBtn')}
                </Button>
              </>
            )}
            {hotel.smtp_host && (
              <>
                <Chip label={`SMTP: ${hotel.smtp_host}`} size="small" />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={smtpTesting ? <CircularProgress size={16} /> : <Email />}
                  onClick={handleTestSmtp}
                  disabled={smtpTesting}
                >
                  {t('hotels.testSmtpBtn')}
                </Button>
              </>
            )}
            <Chip label={t('hotels.roomsCount', { count: hotel.rooms.length })} size="small" />
          </Box>
          {imapResult && (
            <Alert severity={imapResult.type} sx={{ mt: 1 }} onClose={() => setImapResult(null)}>
              {imapResult.text}
            </Alert>
          )}
          {smtpResult && (
            <Alert severity={smtpResult.type} sx={{ mt: 1 }} onClose={() => setSmtpResult(null)}>
              {smtpResult.text}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {hotel.imap_host && (
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 }, position: 'relative' }}
              onClick={() => setInquiriesOpen(true)}
            >
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <MailOutline sx={{ fontSize: 48, color: 'warning.main', mb: 1 }} />
                <Typography variant="h6">{t('hotelDetail.newInquiries')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('hotelDetail.newInquiriesDesc')}
                </Typography>
                {inquiryBadgeCount > 0 && (
                  <Chip
                    label={inquiryBadgeCount}
                    color="error"
                    size="small"
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 }, position: 'relative' }}
                onClick={() => navigate(`/hotels/${id}/reservations?filter=preliminary`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <PendingActions sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.preliminaryReservations')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {preliminaryCount !== null
                  ? t('hotelDetail.preliminaryCount', { count: preliminaryCount })
                  : t('hotelDetail.preliminaryDesc')}
              </Typography>
            </CardContent>
            {preliminaryNewMail > 0 && (
              <Chip
                label={preliminaryNewMail}
                color="error"
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
              />
            )}
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 }, position: 'relative' }}
                onClick={() => navigate(`/hotels/${id}/reservations?filter=confirmed`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <EventNote sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.confirmedReservations')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {reservationCount !== null
                  ? t('hotelDetail.confirmedCount', { count: reservationCount })
                  : t('hotelDetail.confirmedDesc')}
              </Typography>
            </CardContent>
            {confirmedNewMail > 0 && (
              <Chip
                label={confirmedNewMail}
                color="error"
                size="small"
                sx={{ position: 'absolute', top: 8, right: 8 }}
              />
            )}
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/calendar`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <CalendarMonth sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.calendar')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hotelDetail.calendarDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/ai-assistant`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <SmartToy sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.aiAssistant')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hotelDetail.aiAssistantDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/rooms`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <MeetingRoom sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.rooms')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hotelDetail.roomsDesc', { count: hotel.rooms.length })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/revenue`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <BarChart sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.revenue')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hotelDetail.revenueDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/archive`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Inventory sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6">{t('hotelDetail.history')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hotelDetail.historyDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={inquiriesOpen} onClose={() => setInquiriesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <span>{t('hotelDetail.inquiriesTitle')}</span>
            <Button
              variant="contained"
              size="small"
              startIcon={inquiriesLoading ? <CircularProgress size={16} color="inherit" /> : <Search />}
              onClick={handleSearchInquiries}
              disabled={inquiriesLoading}
            >
              {inquiriesLoading ? t('hotelDetail.searching') : t('hotelDetail.searchInbox')}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {inquiriesError && <Alert severity="error" sx={{ mb: 2 }}>{inquiriesError}</Alert>}
          {inquiries === null && !inquiriesLoading && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {t('hotelDetail.clickToSearch')}
            </Typography>
          )}
          {inquiries !== null && inquiries.length === 0 && (
            <Alert severity="info">{t('hotelDetail.noInquiries')}</Alert>
          )}
          {inquiries && inquiries.length > 0 && (
            <List disablePadding>
              {inquiries.map((inq) => (
                <ListItem key={inq.message_id} divider alignItems="flex-start" sx={{ gap: 1 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="subtitle2" noWrap>{inq.from_name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {new Date(inq.date).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" color="text.secondary">{inq.from_email}</Typography>
                        <Typography variant="body2" fontWeight={500}>{inq.subject}</Typography>
                        {inq.body_preview && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                            {inq.body_preview}
                          </Typography>
                        )}
                      </>
                    }
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0, alignSelf: 'flex-start', mt: 0.5 }}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={emailChecking === inq.from_email}
                      startIcon={emailChecking === inq.from_email ? <CircularProgress size={14} color="inherit" /> : undefined}
                      onClick={() => handleInquiryAction(inq)}
                    >
                      {t('hotelDetail.addGuest')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Reply />}
                      onClick={() => handleOpenReply(inq)}
                    >
                      {t('common.reply')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={deletingInquiry === inq.message_id ? <CircularProgress size={14} color="inherit" /> : <DeleteOutline />}
                      disabled={deletingInquiry === inq.message_id}
                      onClick={() => handleDeleteInquiry(inq)}
                    >
                      {t('common.delete')}
                    </Button>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInquiriesOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!replyDialog} onClose={() => !replySending && setReplyDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('hotelDetail.replyTitle')}
          {replyDialog && (
            <Typography variant="body2" color="text.secondary">
              {t('hotelDetail.replyTo', { name: replyDialog.from_name, email: replyDialog.from_email })}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {replyDialog && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.85rem' }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                {t('hotelDetail.originalMessage')}
              </Typography>
              <Typography variant="body2" sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                {replyDialog.body_preview}
              </Typography>
            </Box>
          )}
          <Divider sx={{ mb: 2 }} />
          <TextField
            label={t('common.subject')}
            fullWidth
            size="small"
            value={replyForm.subject}
            onChange={e => setReplyForm(f => ({ ...f, subject: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label={t('hotelDetail.aiPurposeLabel')}
              fullWidth
              size="small"
              placeholder={t('hotelDetail.aiPurposePlaceholder')}
              value={replyAiPurpose}
              onChange={e => setReplyAiPurpose(e.target.value)}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={replyAiLoading ? <CircularProgress size={14} /> : <AutoAwesome />}
              onClick={handleAiDraftReply}
              disabled={replyAiLoading}
              sx={{ flexShrink: 0 }}
            >
              {t('common.aiDraft')}
            </Button>
          </Box>
          <TextField
            label={t('hotelDetail.replyContentLabel')}
            fullWidth
            multiline
            rows={8}
            value={replyForm.body}
            onChange={e => setReplyForm(f => ({ ...f, body: e.target.value }))}
          />
          {replyError && <Alert severity="error" sx={{ mt: 1.5 }}>{replyError}</Alert>}
          {replySuccess && <Alert severity="success" sx={{ mt: 1.5 }}>{t('hotelDetail.messageSent')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplyDialog(null)} disabled={replySending}>{t('common.exit')}</Button>
          <Button
            variant="contained"
            startIcon={replySending ? <CircularProgress size={16} color="inherit" /> : <Reply />}
            onClick={handleSendReply}
            disabled={replySending || !replyForm.body.trim() || replySuccess}
          >
            {replySending ? t('common.sending') : t('common.send')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!emailExistsDialog} onClose={() => setEmailExistsDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('hotelDetail.emailExists')}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}
            dangerouslySetInnerHTML={{
              __html: t('hotelDetail.emailExistsDesc', {
                email: emailExistsDialog?.email,
                count: emailExistsDialog?.reservations.length,
              }),
            }}
          />
          <List dense disablePadding>
            {emailExistsDialog?.reservations.map((r: any) => (
              <ListItem key={r.id} disableGutters>
                <ListItemText
                  primary={r.guest_name}
                  secondary={`${t('hotelDetail.roomLabel', { room: r.room_number })} · ${r.check_in} – ${r.check_out}`}
                />
              </ListItem>
            ))}
          </List>
          <Typography sx={{ mt: 1.5 }}>{t('hotelDetail.addNewReservation')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailExistsDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const email = emailExistsDialog?.email || '';
              const inquiry = emailExistsDialog?.inquiry || null;
              setEmailExistsDialog(null);
              setInquiriesOpen(false);
              navigate(`/hotels/${id}/reservations?filter=preliminary`, { state: { openNew: true, email, inquiry } });
            }}
          >
            {t('hotelDetail.newReservation')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
