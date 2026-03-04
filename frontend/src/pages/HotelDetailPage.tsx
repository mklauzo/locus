import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Card, CardContent, Grid, Button, Box, Chip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText,
  TextField, Divider,
} from '@mui/material';
import {
  MeetingRoom, EventNote, CalendarMonth, ArrowBack, Email, SmartToy, MailOutline, Search, PendingActions, Reply, AutoAwesome, Inventory,
} from '@mui/icons-material';
import api from '../api';
import { Hotel, Inquiry } from '../types';

export default function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [reservationCount, setReservationCount] = useState<number | null>(null);
  const [preliminaryCount, setPreliminaryCount] = useState<number | null>(null);

  useEffect(() => {
    api.get(`/hotels/${id}/`).then(r => setHotel(r.data));
    api.get(`/hotels/${id}/reservations/?deposit_paid=true`).then(r => {
      setReservationCount(r.data.count ?? (r.data.results || r.data).length);
    });
    api.get(`/hotels/${id}/reservations/?deposit_paid=false`).then(r => {
      setPreliminaryCount(r.data.count ?? (r.data.results || r.data).length);
    });
  }, [id]);

  const handleTestImap = async () => {
    if (!hotel) return;
    setImapResult(null);
    setImapTesting(true);
    try {
      const res = await api.post(`/hotels/${id}/test_imap/`, {});
      setImapResult({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setImapResult({ type: 'error', text: err.response?.data?.message || 'Błąd połączenia' });
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
      setSmtpResult({ type: 'error', text: err.response?.data?.message || 'Błąd połączenia' });
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
    } catch (err: any) {
      setInquiriesError(err.response?.data?.detail || 'Błąd wyszukiwania zapytań.');
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
        navigate(`/hotels/${id}/reservations`, { state: { openNew: true, email: inq.from_email, inquiry: inq } });
      }
    } catch {
      setInquiriesOpen(false);
      navigate(`/hotels/${id}/reservations`, { state: { openNew: true, email: inq.from_email, inquiry: inq } });
    } finally {
      setEmailChecking(null);
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
      setReplyError(err.response?.data?.detail || 'Błąd generowania szkicu AI.');
    } finally {
      setReplyAiLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyDialog) return;
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
      setReplyError(err.response?.data?.detail || 'Błąd wysyłania wiadomości.');
    } finally {
      setReplySending(false);
    }
  };

  if (!hotel) return null;

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/')} sx={{ mb: 2 }}>
        Powrót do listy
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
                  Test IMAP
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
                  Test SMTP
                </Button>
              </>
            )}
            <Chip label={`${hotel.rooms.length} pokoi`} size="small" />
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
                <Typography variant="h6">Nowe zapytania</Typography>
                <Typography variant="body2" color="text.secondary">
                  Sprawdź nieznanych nadawców
                </Typography>
                {inquiries !== null && inquiries.length > 0 && (
                  <Chip
                    label={inquiries.length}
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
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/reservations?filter=preliminary`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <PendingActions sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="h6">Rezerwacje wstępne</Typography>
              <Typography variant="body2" color="text.secondary">
                Bez wpłaconej zaliczki{preliminaryCount !== null ? ` (${preliminaryCount})` : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/reservations?filter=confirmed`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <EventNote sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Rezerwacje potwierdzone</Typography>
              <Typography variant="body2" color="text.secondary">
                Z wpłaconą zaliczką{reservationCount !== null ? ` (${reservationCount})` : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/calendar`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <CalendarMonth sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Kalendarz</Typography>
              <Typography variant="body2" color="text.secondary">
                Widok obłożenia pokoi
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/ai-assistant`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <SmartToy sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Asystent AI</Typography>
              <Typography variant="body2" color="text.secondary">
                Konfiguracja odpowiedzi e-mail
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/rooms`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <MeetingRoom sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Pokoje</Typography>
              <Typography variant="body2" color="text.secondary">
                Zarządzaj pokojami ({hotel.rooms.length})
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/archive`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Inventory sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6">Historia</Typography>
              <Typography variant="body2" color="text.secondary">
                Archiwum rozliczonych rezerwacji
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={inquiriesOpen} onClose={() => setInquiriesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <span>Nowe zapytania z e-mail</span>
            <Button
              variant="contained"
              size="small"
              startIcon={inquiriesLoading ? <CircularProgress size={16} color="inherit" /> : <Search />}
              onClick={handleSearchInquiries}
              disabled={inquiriesLoading}
            >
              {inquiriesLoading ? 'Wyszukiwanie...' : 'Wyszukaj w skrzynce'}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {inquiriesError && <Alert severity="error" sx={{ mb: 2 }}>{inquiriesError}</Alert>}
          {inquiries === null && !inquiriesLoading && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Kliknij „Wyszukaj w skrzynce" aby znaleźć nowe zapytania od nieznanych nadawców (ostatnie 30 dni).
            </Typography>
          )}
          {inquiries !== null && inquiries.length === 0 && (
            <Alert severity="info">Brak nowych zapytań od nieznanych nadawców w ciągu ostatnich 30 dni.</Alert>
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
                      Dodaj gościa
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Reply />}
                      onClick={() => handleOpenReply(inq)}
                    >
                      Odpowiedz
                    </Button>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInquiriesOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!replyDialog} onClose={() => !replySending && setReplyDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Odpowiedz na zapytanie
          {replyDialog && (
            <Typography variant="body2" color="text.secondary">
              Do: {replyDialog.from_name} &lt;{replyDialog.from_email}&gt;
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {replyDialog && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.85rem' }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                Oryginalna wiadomość:
              </Typography>
              <Typography variant="body2" sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                {replyDialog.body_preview}
              </Typography>
            </Box>
          )}
          <Divider sx={{ mb: 2 }} />
          <TextField
            label="Temat"
            fullWidth
            size="small"
            value={replyForm.subject}
            onChange={e => setReplyForm(f => ({ ...f, subject: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label="Cel wiadomości (dla AI)"
              fullWidth
              size="small"
              placeholder="np. poproś o doprecyzowanie liczby gości i terminu"
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
              Szkic AI
            </Button>
          </Box>
          <TextField
            label="Treść odpowiedzi"
            fullWidth
            multiline
            rows={8}
            value={replyForm.body}
            onChange={e => setReplyForm(f => ({ ...f, body: e.target.value }))}
          />
          {replyError && <Alert severity="error" sx={{ mt: 1.5 }}>{replyError}</Alert>}
          {replySuccess && <Alert severity="success" sx={{ mt: 1.5 }}>Wiadomość wysłana pomyślnie.</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplyDialog(null)} disabled={replySending}>Anuluj</Button>
          <Button
            variant="contained"
            startIcon={replySending ? <CircularProgress size={16} color="inherit" /> : <Reply />}
            onClick={handleSendReply}
            disabled={replySending || !replyForm.body.trim() || replySuccess}
          >
            {replySending ? 'Wysyłanie...' : 'Wyślij'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!emailExistsDialog} onClose={() => setEmailExistsDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Email już przypisany do rezerwacji</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            Adres <strong>{emailExistsDialog?.email}</strong> jest już powiązany z{' '}
            {emailExistsDialog?.reservations.length === 1 ? 'rezerwacją' : 'rezerwacjami'}:
          </Typography>
          <List dense disablePadding>
            {emailExistsDialog?.reservations.map((r: any) => (
              <ListItem key={r.id} disableGutters>
                <ListItemText
                  primary={r.guest_name}
                  secondary={`Pokój ${r.room_number} · ${r.check_in} – ${r.check_out}`}
                />
              </ListItem>
            ))}
          </List>
          <Typography sx={{ mt: 1.5 }}>Czy chcesz dodać nową rezerwację dla tego gościa?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailExistsDialog(null)}>Anuluj</Button>
          <Button
            variant="contained"
            onClick={() => {
              const email = emailExistsDialog?.email || '';
              const inquiry = emailExistsDialog?.inquiry || null;
              setEmailExistsDialog(null);
              setInquiriesOpen(false);
              navigate(`/hotels/${id}/reservations`, { state: { openNew: true, email, inquiry } });
            }}
          >
            Nowa rezerwacja
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
