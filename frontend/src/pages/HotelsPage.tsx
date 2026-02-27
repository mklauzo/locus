import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Button, Card, CardContent, CardActions, Grid, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Checkbox,
  FormControlLabel, IconButton, Alert, CircularProgress, Divider,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import api from '../api';
import { Hotel } from '../types';
import { useAuthContext } from '../App';

const emptyHotel = {
  name: '', address: '', email: '',
  imap_host: '', imap_port: 993, imap_ssl: true, imap_login: '', imap_password: '',
  smtp_host: '', smtp_port: 587, smtp_ssl: false, smtp_login: '', smtp_password: '',
};

export default function HotelsPage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyHotel);
  const [editId, setEditId] = useState<number | null>(null);
  const [imapTest, setImapTest] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [imapTesting, setImapTesting] = useState(false);
  const [smtpTest, setSmtpTest] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);

  const load = () => api.get('/hotels/').then(r => setHotels(r.data.results || r.data));

  useEffect(() => { load(); }, []);

  const handleOpen = () => {
    setForm(emptyHotel);
    setEditId(null);
    setImapTest(null);
    setSmtpTest(null);
    setOpen(true);
  };

  const handleSave = async () => {
    if (editId) {
      await api.put(`/hotels/${editId}/`, form);
    } else {
      await api.post('/hotels/', form);
    }
    setOpen(false);
    load();
  };

  const handleEdit = (h: Hotel) => {
    setForm({
      name: h.name, address: h.address, email: h.email,
      imap_host: h.imap_host, imap_port: h.imap_port, imap_ssl: h.imap_ssl,
      imap_login: h.imap_login, imap_password: '',
      smtp_host: h.smtp_host || '', smtp_port: h.smtp_port || 587,
      smtp_ssl: h.smtp_ssl || false, smtp_login: h.smtp_login || '', smtp_password: '',
    });
    setEditId(h.id);
    setImapTest(null);
    setSmtpTest(null);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Czy na pewno chcesz usunąć ten hotel?')) {
      await api.delete(`/hotels/${id}/`);
      load();
    }
  };

  const handleTestImap = async () => {
    setImapTest(null);
    setImapTesting(true);
    try {
      const res = await api.post('/test-imap/', {
        imap_host: form.imap_host, imap_port: form.imap_port,
        imap_ssl: form.imap_ssl, imap_login: form.imap_login, imap_password: form.imap_password,
      });
      setImapTest({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setImapTest({ type: 'error', text: err.response?.data?.message || 'Błąd połączenia IMAP' });
    } finally {
      setImapTesting(false);
    }
  };

  const handleTestSmtp = async () => {
    setSmtpTest(null);
    setSmtpTesting(true);
    try {
      const res = await api.post('/test-smtp/', {
        smtp_host: form.smtp_host, smtp_port: form.smtp_port,
        smtp_ssl: form.smtp_ssl, smtp_login: form.smtp_login, smtp_password: form.smtp_password,
      });
      setSmtpTest({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setSmtpTest({ type: 'error', text: err.response?.data?.message || 'Błąd połączenia SMTP' });
    } finally {
      setSmtpTesting(false);
    }
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Hotele
        <Button variant="contained" startIcon={<Add />} onClick={handleOpen}>
          Dodaj hotel
        </Button>
      </Typography>

      <Grid container spacing={2}>
        {hotels.map(h => (
          <Grid item xs={12} sm={6} md={4} key={h.id}>
            <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}>
              <CardContent onClick={() => navigate(`/hotels/${h.id}`)}>
                <Typography variant="h6">{h.name}</Typography>
                <Typography variant="body2" color="text.secondary">{h.address}</Typography>
                <Typography variant="body2" color="text.secondary">{h.email}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {h.rooms.length} pokoi
                </Typography>
              </CardContent>
              {user?.role === 'ADMIN' && (
                <CardActions>
                  <IconButton size="small" onClick={() => handleEdit(h)}><Edit /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(h.id)}><Delete /></IconButton>
                </CardActions>
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edytuj hotel' : 'Nowy hotel'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>

          <TextField label="Nazwa" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField label="Adres" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} fullWidth multiline rows={2} />
          <TextField label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} fullWidth />

          <Divider><Typography variant="caption" color="text.secondary">Konfiguracja IMAP (odbiór poczty)</Typography></Divider>

          <TextField label="Host IMAP" value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} fullWidth />
          <TextField label="Port IMAP" type="number" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: +e.target.value })} />
          <FormControlLabel control={<Checkbox checked={form.imap_ssl} onChange={e => setForm({ ...form, imap_ssl: e.target.checked })} />} label="SSL (port 993)" />
          <TextField label="Login IMAP" value={form.imap_login} onChange={e => setForm({ ...form, imap_login: e.target.value })} fullWidth />
          <TextField label="Hasło IMAP" type="password" value={form.imap_password} onChange={e => setForm({ ...form, imap_password: e.target.value })} fullWidth />
          <Button
            variant="outlined" size="small"
            disabled={imapTesting || !form.imap_host || !form.imap_login || !form.imap_password}
            startIcon={imapTesting ? <CircularProgress size={16} /> : undefined}
            onClick={handleTestImap}
          >
            Testuj połączenie IMAP
          </Button>
          {imapTest && <Alert severity={imapTest.type}>{imapTest.text}</Alert>}

          <Divider><Typography variant="caption" color="text.secondary">Konfiguracja SMTP (wysyłka poczty)</Typography></Divider>

          <TextField label="Host SMTP" value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} fullWidth placeholder="smtp.gmail.com" />
          <TextField label="Port SMTP" type="number" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: +e.target.value })} />
          <FormControlLabel control={<Checkbox checked={form.smtp_ssl} onChange={e => setForm({ ...form, smtp_ssl: e.target.checked })} />} label="SSL (port 465) — odznacz dla STARTTLS (port 587)" />
          <TextField label="Login SMTP" value={form.smtp_login} onChange={e => setForm({ ...form, smtp_login: e.target.value })} fullWidth />
          <TextField label="Hasło SMTP" type="password" value={form.smtp_password} onChange={e => setForm({ ...form, smtp_password: e.target.value })} fullWidth />
          <Button
            variant="outlined" size="small"
            disabled={smtpTesting || !form.smtp_host || !form.smtp_login || !form.smtp_password}
            startIcon={smtpTesting ? <CircularProgress size={16} /> : undefined}
            onClick={handleTestSmtp}
          >
            Testuj połączenie SMTP
          </Button>
          {smtpTest && <Alert severity={smtpTest.type}>{smtpTest.text}</Alert>}

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleSave}>Zapisz</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
