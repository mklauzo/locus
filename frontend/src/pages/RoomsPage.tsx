import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
  Paper, TableContainer,
} from '@mui/material';
import { Add, Edit, Delete, ArrowBack } from '@mui/icons-material';
import api from '../api';
import { Room } from '../types';

export default function RoomsPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ number: '', capacity: 1 });
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => api.get(`/hotels/${hotelId}/rooms/`).then(r => setRooms(r.data.results || r.data));

  useEffect(() => { load(); }, [hotelId]);

  const handleSave = async () => {
    const data = { ...form, hotel: Number(hotelId) };
    if (editId) {
      await api.put(`/hotels/${hotelId}/rooms/${editId}/`, data);
    } else {
      await api.post(`/hotels/${hotelId}/rooms/`, data);
    }
    setOpen(false);
    setForm({ number: '', capacity: 1 });
    setEditId(null);
    load();
  };

  const handleEdit = (r: Room) => {
    setForm({ number: r.number, capacity: r.capacity });
    setEditId(r.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Czy na pewno chcesz usunąć ten pokój?')) {
      await api.delete(`/hotels/${hotelId}/rooms/${id}/`);
      load();
    }
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        Powrót
      </Button>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Pokoje
        <Button variant="contained" startIcon={<Add />} onClick={() => { setForm({ number: '', capacity: 1 }); setEditId(null); setOpen(true); }}>
          Dodaj pokój
        </Button>
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Numer pokoju</TableCell>
              <TableCell>Pojemność</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rooms.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.number}</TableCell>
                <TableCell>{r.capacity} os.</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleEdit(r)}><Edit /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(r.id)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>{editId ? 'Edytuj pokój' : 'Nowy pokój'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important', minWidth: 300 }}>
          <TextField label="Numer pokoju" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
          <TextField label="Pojemność (os.)" type="number" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: Math.max(1, +e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleSave}>Zapisz</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
