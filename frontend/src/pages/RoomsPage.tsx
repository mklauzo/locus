import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
  Paper, TableContainer, Box, Divider, InputAdornment,
} from '@mui/material';
import { Add, Edit, Delete, ArrowBack } from '@mui/icons-material';
import api from '../api';
import { Room, RoomPricing } from '../types';

const MONTH_NAMES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

function emptyPricing(): RoomPricing[] {
  return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, price_per_night: 0 }));
}

function loadPricing(roomPricing: RoomPricing[]): RoomPricing[] {
  const result = emptyPricing();
  roomPricing.forEach(p => {
    result[p.month - 1].price_per_night = Number(p.price_per_night);
  });
  return result;
}

function priceSummary(pricing: RoomPricing[]): string {
  const prices = pricing.map(p => p.price_per_night).filter(v => v > 0);
  if (prices.length === 0) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${min} zł/noc`;
  return `${min}–${max} zł/noc`;
}

export default function RoomsPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ number: '', capacity: 1 });
  const [pricing, setPricing] = useState<RoomPricing[]>(emptyPricing());
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => api.get(`/hotels/${hotelId}/rooms/`).then(r => setRooms(r.data.results || r.data));

  useEffect(() => { load(); }, [hotelId]);

  const handleSave = async () => {
    const data = {
      ...form,
      hotel: Number(hotelId),
      pricing: pricing.filter(p => p.price_per_night > 0),
    };
    if (editId) {
      await api.put(`/hotels/${hotelId}/rooms/${editId}/`, data);
    } else {
      await api.post(`/hotels/${hotelId}/rooms/`, data);
    }
    setOpen(false);
    setForm({ number: '', capacity: 1 });
    setPricing(emptyPricing());
    setEditId(null);
    load();
  };

  const handleEdit = (r: Room) => {
    setForm({ number: r.number, capacity: r.capacity });
    setPricing(loadPricing(r.pricing || []));
    setEditId(r.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Czy na pewno chcesz usunąć ten pokój?')) {
      await api.delete(`/hotels/${hotelId}/rooms/${id}/`);
      load();
    }
  };

  const handleOpen = () => {
    setForm({ number: '', capacity: 1 });
    setPricing(emptyPricing());
    setEditId(null);
    setOpen(true);
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        Powrót
      </Button>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Pokoje
        <Button variant="contained" startIcon={<Add />} onClick={handleOpen}>
          Dodaj pokój
        </Button>
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Numer pokoju</TableCell>
              <TableCell>Pojemność</TableCell>
              <TableCell>Cena za noc</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rooms.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.number}</TableCell>
                <TableCell>{r.capacity} os.</TableCell>
                <TableCell>{priceSummary(r.pricing || [])}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleEdit(r)}><Edit /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(r.id)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edytuj pokój' : 'Nowy pokój'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Numer pokoju" value={form.number}
            onChange={e => setForm({ ...form, number: e.target.value })} />
          <TextField label="Pojemność (os.)" type="number" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: Math.max(1, +e.target.value) })} />

          <Divider />
          <Typography variant="subtitle2" color="text.secondary">
            Cennik — cena za dobę (0 = brak stawki)
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
            {pricing.map((p, idx) => (
              <TextField
                key={p.month}
                label={MONTH_NAMES[idx]}
                type="number"
                size="small"
                value={p.price_per_night || ''}
                placeholder="0"
                inputProps={{ min: 0, step: 1 }}
                InputProps={{ endAdornment: <InputAdornment position="end">zł</InputAdornment> }}
                onChange={e => {
                  const next = [...pricing];
                  next[idx] = { ...next[idx], price_per_night: Math.max(0, Number(e.target.value)) };
                  setPricing(next);
                }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleSave}>Zapisz</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
