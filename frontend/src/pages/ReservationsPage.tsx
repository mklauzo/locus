import { useState, useEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Button, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  IconButton, Paper, TableContainer, Chip, FormControlLabel, Checkbox, Box, Alert,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Add, Visibility, Delete, ArrowBack, MailOutline } from '@mui/icons-material';
import api from '../api';
import { Reservation, Room } from '../types';

const PL_MONTHS = ['', 'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

// Returns: number = calculated price, string = unavailability error, null = room/dates not yet selected
function calcPrice(rooms: Room[], roomId: string, checkIn: string, checkOut: string): number | string | null {
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
    if (!(month in pricingMap)) {
      return `Pokój niedostępny w ${PL_MONTHS[month]} — brak cennika dla tego miesiąca.`;
    }
    total += pricingMap[month];
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

const emptyForm = {
  room: '', guest_first_name: '', guest_last_name: '', companions: '' as any, animals: '' as any,
  check_in: '', check_out: '', deposit_paid: false, deposit_amount: '',
  deposit_date: '', remaining_amount: '', notes: '', contact_email: '', contact_phone: '',
};

export default function ReservationsPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [priceAutoCalc, setPriceAutoCalc] = useState(false);
  const [unavailableError, setUnavailableError] = useState('');
  const [filterGuest, setFilterGuest] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const load = () => {
    let url = `/hotels/${hotelId}/reservations/?`;
    if (filterGuest) url += `search=${filterGuest}&`;
    if (filterRoom) url += `room=${filterRoom}&`;
    if (filterDateFrom) url += `date_from=${filterDateFrom}&`;
    if (filterDateTo) url += `date_to=${filterDateTo}&`;
    api.get(url).then(r => setReservations(r.data.results || r.data));
  };

  useEffect(() => {
    api.get(`/hotels/${hotelId}/rooms/`).then(r => setRooms(r.data.results || r.data));
  }, [hotelId]);

  useEffect(() => {
    const state = location.state as { openNew?: boolean; email?: string } | null;
    if (state?.openNew) {
      setForm({ ...emptyForm, contact_email: state.email || '' });
      setEditId(null);
      setPriceAutoCalc(false);
      setUnavailableError('');
      setOpen(true);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => { load(); }, [hotelId, filterGuest, filterRoom, filterDateFrom, filterDateTo]);

  // Auto-refresh every 60 seconds to pick up new mail flags
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [hotelId, filterGuest, filterRoom, filterDateFrom, filterDateTo]);

  const applyAutoPrice = (patch: Partial<typeof emptyForm>, currentForm = form) => {
    const merged = { ...currentForm, ...patch };
    const price = calcPrice(rooms, merged.room, merged.check_in, merged.check_out);
    if (typeof price === 'string') {
      setUnavailableError(price);
      setPriceAutoCalc(false);
      return { ...merged, remaining_amount: '' };
    }
    setUnavailableError('');
    if (typeof price === 'number') {
      setPriceAutoCalc(true);
      return { ...merged, remaining_amount: String(price) };
    }
    setPriceAutoCalc(false);
    return merged;
  };

  const handleSave = async () => {
    setError('');
    const data = {
      ...form,
      hotel: Number(hotelId),
      room: form.room ? Number(form.room) : undefined,
      companions: Number(form.companions),
      animals: Number(form.animals),
      deposit_amount: form.deposit_amount || '0',
      remaining_amount: form.remaining_amount || '0',
      deposit_date: form.deposit_date || null,
    };
    try {
      if (editId) {
        await api.put(`/hotels/${hotelId}/reservations/${editId}/`, data);
      } else {
        await api.post(`/hotels/${hotelId}/reservations/`, data);
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      load();
    } catch (err: any) {
      const resp = err.response?.data;
      if (resp) {
        const msgs = typeof resp === 'string' ? resp
          : Array.isArray(resp) ? resp.join(', ')
          : Object.entries(resp).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ');
        setError(msgs);
      } else {
        setError('Wystąpił błąd podczas zapisywania.');
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Czy na pewno chcesz usunąć tę rezerwację?')) {
      await api.delete(`/hotels/${hotelId}/reservations/${id}/`);
      load();
    }
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        Powrót
      </Button>
      <Typography variant="h5" sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Rezerwacje
        <Button variant="contained" startIcon={<Add />} onClick={() => { setForm(emptyForm); setEditId(null); setPriceAutoCalc(false); setUnavailableError(''); setOpen(true); }}>
          Nowa rezerwacja
        </Button>
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'auto auto auto auto' }, gap: 1.5, mb: 2 }}>
        <TextField label="Szukaj gościa" size="small" value={filterGuest}
          onChange={e => setFilterGuest(e.target.value)} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
        <TextField label="Pokój" size="small" select value={filterRoom}
          onChange={e => setFilterRoom(e.target.value)}>
          <MenuItem value="">Wszystkie</MenuItem>
          {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.number}</MenuItem>)}
        </TextField>
        <TextField label="Od" type="date" size="small" InputLabelProps={{ shrink: true }}
          value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        <TextField label="Do" type="date" size="small" InputLabelProps={{ shrink: true }}
          value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Gość</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Pokój</TableCell>
              <TableCell>Zameldowanie / Wyjazd</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Dni</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Zaliczka</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Dopłata</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Do zapłaty</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Kontakt</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reservations.map(r => (
              <TableRow key={r.id} hover sx={{
                cursor: 'pointer',
                bgcolor: r.is_settled
                  ? theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f5f5f5'
                  : r.has_new_mail
                    ? alpha(theme.palette.primary.main, 0.22)
                    : alpha(theme.palette.primary.main, 0.08),
              }}
                onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" fontWeight={500}>{r.guest_name}</Typography>
                    {r.has_new_mail && (
                      <MailOutline fontSize="small" color="primary" titleAccess="Nowy email" />
                    )}
                  </Box>
                  {/* Na xs: pokaż pokój i daty pod nazwiskiem */}
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
                    pok.{r.room_number} · {r.check_in} – {r.check_out}
                  </Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{r.room_number}</TableCell>
                <TableCell>
                  <Box>{r.check_in}</Box>
                  <Typography variant="caption" color="text.secondary">{r.check_out}</Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{r.days_count}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  {r.deposit_paid
                    ? <Chip label={`${r.deposit_amount} zł`} color={r.is_settled ? 'default' : 'success'} size="small" />
                    : <Chip label="Brak" size="small" />}
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  <Chip label={`${(parseFloat(r.remaining_amount || '0') - parseFloat(r.deposit_amount || '0')).toFixed(2)} zł`}
                    color={r.is_settled ? 'default' : 'warning'} size="small" />
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  <Chip label={`${r.remaining_amount} zł`}
                    color={r.is_settled ? 'default' : 'error'} size="small" />
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {r.contact_email && <Typography variant="caption" display="block">{r.contact_email}</Typography>}
                  {r.contact_phone && <Typography variant="caption" display="block">{r.contact_phone}</Typography>}
                </TableCell>
                <TableCell align="right" onClick={e => e.stopPropagation()}>
                  <IconButton size="small" onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}>
                    <Visibility />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(r.id)}>
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editId ? 'Edytuj rezerwację' : 'Nowa rezerwacja'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Imię" value={form.guest_first_name}
            onChange={e => setForm({ ...form, guest_first_name: e.target.value })} fullWidth />
          <TextField label="Nazwisko" value={form.guest_last_name}
            onChange={e => setForm({ ...form, guest_last_name: e.target.value })} fullWidth />
          <TextField label="Pokój" select value={form.room}
            onChange={e => setForm(applyAutoPrice({ room: e.target.value }))} fullWidth>
            {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.number} ({r.capacity} os.)</MenuItem>)}
          </TextField>
          <TextField label="Osoby towarzyszące" type="number" value={form.companions}
            onChange={e => {
              const selectedRoom = rooms.find(r => r.id === Number(form.room));
              const max = selectedRoom ? selectedRoom.capacity - 1 : 99;
              setForm({ ...form, companions: Math.min(max, Math.max(0, +e.target.value)) });
            }}
            helperText={(() => { const r = rooms.find(rm => rm.id === Number(form.room)); return r ? `Max: ${r.capacity - 1} (pojemność pokoju: ${r.capacity})` : ''; })()} />
          <TextField label="Zwierzęta" type="number" value={form.animals}
            onChange={e => setForm({ ...form, animals: Math.max(0, +e.target.value) })} />
          <TextField label="Data zameldowania" type="date" InputLabelProps={{ shrink: true }}
            value={form.check_in} onChange={e => setForm(applyAutoPrice({ check_in: e.target.value }))} />
          <TextField label="Data wymeldowania" type="date" InputLabelProps={{ shrink: true }}
            value={form.check_out} onChange={e => setForm(applyAutoPrice({ check_out: e.target.value }))} />
          <FormControlLabel control={<Checkbox checked={form.deposit_paid}
            onChange={e => setForm({ ...form, deposit_paid: e.target.checked })} />} label="Zaliczka wpłacona" />
          {form.deposit_paid && (
            <>
              <TextField label="Kwota zaliczki" type="number" value={form.deposit_amount}
                onChange={e => setForm({ ...form, deposit_amount: e.target.value })} />
              <TextField label="Data wpłaty" type="date" InputLabelProps={{ shrink: true }}
                value={form.deposit_date} onChange={e => setForm({ ...form, deposit_date: e.target.value })} />
            </>
          )}
          {unavailableError && <Alert severity="error">{unavailableError}</Alert>}
          {!unavailableError && (
            <TextField
              label="Kwota do zapłaty"
              type="number"
              value={form.remaining_amount}
              onChange={e => { setPriceAutoCalc(false); setForm({ ...form, remaining_amount: e.target.value }); }}
              helperText={priceAutoCalc ? 'Obliczono automatycznie na podstawie cennika' : undefined}
              color={priceAutoCalc ? 'success' : undefined}
            />
          )}
          <TextField label="Email kontaktowy" value={form.contact_email}
            onChange={e => setForm({ ...form, contact_email: e.target.value })} />
          <TextField label="Telefon" value={form.contact_phone}
            onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
          <TextField label="Uwagi" multiline rows={3} value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleSave} disabled={!!unavailableError}>Zapisz</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
