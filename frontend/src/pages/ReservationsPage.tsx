import { useState, useEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Typography, Button, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  IconButton, Paper, TableContainer, Chip, FormControlLabel, Checkbox, Box, Alert,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Add, Visibility, Delete, ArrowBack, MailOutline, FilterAltOff } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { Reservation, Room, Inquiry } from '../types';

// Returns: number = calculated price, string = unavailability error, null = room/dates not yet selected
function calcPrice(
  rooms: Room[],
  roomId: string,
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
    if (!(month in pricingMap)) {
      return `Pokój niedostępny w ${monthNames[month]} — brak cennika dla tego miesiąca.`;
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
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const { t } = useTranslation();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const filterParam = searchParams.get('filter');
  const yearParam = searchParams.get('year') || '';
  const currentYear = new Date().getFullYear();
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
  const [filterDateFrom, setFilterDateFrom] = useState(
    filterParam === 'archive' && yearParam ? `${yearParam}-01-01` :
    filterParam === 'confirmed' ? `${currentYear}-01-01` : ''
  );
  const [filterDateTo, setFilterDateTo] = useState(filterParam === 'archive' && yearParam ? `${yearParam}-12-31` : '');
  const [filterPreliminary, setFilterPreliminary] = useState(filterParam === 'preliminary');
  const [filterConfirmed, setFilterConfirmed] = useState(filterParam === 'confirmed');
  const [filterSettled] = useState(filterParam === 'archive');
  const [archiveYear] = useState(filterParam === 'archive' ? yearParam : '');
  const initState = location.state as { openNew?: boolean; email?: string; inquiry?: Inquiry } | null;
  const [openInquiry, setOpenInquiry] = useState<Inquiry | null>(initState?.inquiry || null);

  const monthNames: string[] = t('months.full', { returnObjects: true }) as string[];

  const load = () => {
    let url = `/hotels/${hotelId}/reservations/?`;
    if (filterGuest) url += `search=${filterGuest}&`;
    if (filterRoom) url += `room=${filterRoom}&`;
    if (filterDateFrom) url += `date_from=${filterDateFrom}&`;
    if (filterDateTo) url += `date_to=${filterDateTo}&`;
    if (filterPreliminary) url += `deposit_paid=false&`;
    if (filterConfirmed) url += `deposit_paid=true&is_settled=false&`;
    if (filterSettled) url += `is_settled=true&`;
    api.get(url).then(r => {
      const list: Reservation[] = r.data.results || r.data;
      list.sort((a, b) => {
        const mailDiff = Number(b.has_new_mail) - Number(a.has_new_mail);
        if (mailDiff !== 0) return mailDiff;
        return Number(a.is_settled) - Number(b.is_settled);
      });
      setReservations(list);
    });
  };

  useEffect(() => {
    api.get(`/hotels/${hotelId}/rooms/`).then(r => setRooms(r.data.results || r.data));
  }, [hotelId]);

  useEffect(() => {
    const state = location.state as { openNew?: boolean; email?: string; inquiry?: Inquiry } | null;
    if (state?.openNew) {
      setForm({ ...emptyForm, contact_email: state.email || '' });
      setEditId(null);
      setPriceAutoCalc(false);
      setUnavailableError('');
      setOpenInquiry(state.inquiry || null);
      setOpen(true);
    }
    if (state) {
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => { load(); }, [hotelId, filterGuest, filterRoom, filterDateFrom, filterDateTo, filterPreliminary, filterConfirmed, filterSettled]);

  // Auto-refresh every 60 seconds to pick up new mail flags
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [hotelId, filterGuest, filterRoom, filterDateFrom, filterDateTo, filterPreliminary, filterConfirmed, filterSettled]);

  const applyAutoPrice = (patch: Partial<typeof emptyForm>, currentForm = form) => {
    const merged = { ...currentForm, ...patch };
    const price = calcPrice(rooms, merged.room, merged.check_in, merged.check_out, monthNames);
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
        setError(t('reservations.saveError'));
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('reservations.deleteConfirm'))) {
      await api.delete(`/hotels/${hotelId}/reservations/${id}/`);
      load();
    }
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        {t('common.back')}
      </Button>
      <Typography variant="h5" sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {archiveYear
          ? t('reservations.archive', { year: archiveYear })
          : filterConfirmed
            ? t('reservations.confirmed')
            : filterPreliminary
              ? t('reservations.preliminary')
              : t('reservations.title')}
        <Button variant="contained" startIcon={<Add />} onClick={() => { setForm(emptyForm); setEditId(null); setPriceAutoCalc(false); setUnavailableError(''); setOpenInquiry(null); setOpen(true); }}>
          {t('reservations.newReservation')}
        </Button>
      </Typography>

      {filterPreliminary && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" startIcon={<FilterAltOff />} onClick={() => setFilterPreliminary(false)}>
              {t('common.showAll')}
            </Button>
          }
        >
          {t('reservations.showingPreliminary')}
        </Alert>
      )}

      {filterConfirmed && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" startIcon={<FilterAltOff />} onClick={() => setFilterConfirmed(false)}>
              {t('common.showAll')}
            </Button>
          }
        >
          {t('reservations.showingConfirmed')}
        </Alert>
      )}

      {filterSettled && archiveYear && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('reservations.showingArchive', { year: archiveYear })}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'auto auto auto auto' }, gap: 1.5, mb: 2 }}>
        <TextField label={t('reservations.filterGuest')} size="small" value={filterGuest}
          onChange={e => setFilterGuest(e.target.value)} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
        <TextField label={t('reservations.filterRoom')} size="small" select value={filterRoom}
          onChange={e => setFilterRoom(e.target.value)}>
          <MenuItem value="">{t('common.all')}</MenuItem>
          {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.number}</MenuItem>)}
        </TextField>
        <TextField label={t('common.from')} type="date" size="small" InputLabelProps={{ shrink: true }}
          value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        <TextField label={t('common.to')} type="date" size="small" InputLabelProps={{ shrink: true }}
          value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('reservations.guest')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('common.room')}</TableCell>
              <TableCell>{t('reservations.checkInOut')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('common.days')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('common.deposit')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('common.surcharge')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('common.totalAmount')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('common.contact')}</TableCell>
              <TableCell align="right">{t('common.actions')}</TableCell>
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
                    : <Chip label={t('reservations.noDeposit')} size="small" />}
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

      <Dialog
        open={open}
        onClose={() => { setOpen(false); setOpenInquiry(null); }}
        maxWidth={openInquiry ? 'lg' : 'sm'}
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>{editId ? t('reservations.editReservation') : t('reservations.newReservation')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 0, p: 0, pt: '0 !important' }}>

          {/* ── Panel emaila (lewa strona) ── */}
          {openInquiry && (
            <Box sx={{
              width: { md: '45%' }, flexShrink: 0,
              borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'action.hover',
            }}>
              <Box sx={{ px: 2, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t('reservations.inquiryContent')}</Typography>
                <Typography variant="body2" fontWeight={600} noWrap>{openInquiry.subject || t('reservations.noSubject')}</Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Od: <strong>{openInquiry.from_name}</strong> &lt;{openInquiry.from_email}&gt;
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(openInquiry.date).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                </Typography>
              </Box>
              <Box sx={{ px: 2, py: 1.5, overflow: 'auto', flex: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                  {openInquiry.body_preview || t('reservations.noContent')}
                </Typography>
              </Box>
            </Box>
          )}

          {/* ── Formularz (prawa strona) ── */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, p: 2, overflow: 'auto' }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label={t('common.firstName')} value={form.guest_first_name}
              onChange={e => setForm({ ...form, guest_first_name: e.target.value })} fullWidth />
            <TextField label={t('common.lastName')} value={form.guest_last_name}
              onChange={e => setForm({ ...form, guest_last_name: e.target.value })} fullWidth />
            <TextField label={t('common.room')} select value={form.room}
              onChange={e => setForm(applyAutoPrice({ room: e.target.value }))} fullWidth>
              {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.number} ({r.capacity} {t('common.person')})</MenuItem>)}
            </TextField>
            <TextField label={t('reservations.companions')} type="number" value={form.companions}
              onChange={e => {
                const selectedRoom = rooms.find(r => r.id === Number(form.room));
                const max = selectedRoom ? selectedRoom.capacity - 1 : 99;
                setForm({ ...form, companions: Math.min(max, Math.max(0, +e.target.value)) });
              }}
              helperText={(() => { const r = rooms.find(rm => rm.id === Number(form.room)); return r ? t('reservations.companionsHelper', { max: r.capacity - 1, capacity: r.capacity }) : ''; })()} />
            <TextField label={t('reservations.animals')} type="number" value={form.animals}
              onChange={e => setForm({ ...form, animals: Math.max(0, +e.target.value) })} />
            <TextField label={t('reservations.checkIn')} type="date" InputLabelProps={{ shrink: true }}
              value={form.check_in} onChange={e => setForm(applyAutoPrice({ check_in: e.target.value }))} />
            <TextField label={t('reservations.checkOut')} type="date" InputLabelProps={{ shrink: true }}
              value={form.check_out} onChange={e => setForm(applyAutoPrice({ check_out: e.target.value }))} />
            <FormControlLabel control={<Checkbox checked={form.deposit_paid}
              onChange={e => setForm({ ...form, deposit_paid: e.target.checked })} />} label={t('reservations.depositPaid')} />
            {form.deposit_paid && (
              <>
                <TextField label={t('reservations.depositAmount')} type="number" value={form.deposit_amount}
                  onChange={e => setForm({ ...form, deposit_amount: e.target.value })} />
                <TextField label={t('reservations.depositDate')} type="date" InputLabelProps={{ shrink: true }}
                  value={form.deposit_date} onChange={e => setForm({ ...form, deposit_date: e.target.value })} />
              </>
            )}
            {unavailableError && <Alert severity="error">{unavailableError}</Alert>}
            {!unavailableError && (
              <TextField
                label={t('reservations.totalAmountLabel')}
                type="number"
                value={form.remaining_amount}
                onChange={e => { setPriceAutoCalc(false); setForm({ ...form, remaining_amount: e.target.value }); }}
                helperText={priceAutoCalc ? t('reservations.priceAutoCalc') : undefined}
                color={priceAutoCalc ? 'success' : undefined}
              />
            )}
            <TextField label={t('reservations.contactEmail')} value={form.contact_email}
              onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            <TextField label={t('reservations.contactPhone')} value={form.contact_phone}
              onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
            <TextField label={t('common.notes')} multiline rows={3} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setOpenInquiry(null); }}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} disabled={!!unavailableError}>{t('common.save')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
