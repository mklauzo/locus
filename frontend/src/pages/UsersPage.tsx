import { useState, useEffect } from 'react';
import {
  Typography, Button, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  IconButton, Paper, TableContainer, Chip,
} from '@mui/material';
import { Add, Block, LockOpen, Delete, RestoreFromTrash, DeleteForever } from '@mui/icons-material';
import api from '../api';
import { User } from '../types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'USER' as const, first_name: '', last_name: '' });

  const load = () => api.get('/users/').then(r => setUsers(r.data.results || r.data));

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await api.post('/users/', form);
    setOpen(false);
    setForm({ username: '', email: '', password: '', role: 'USER', first_name: '', last_name: '' });
    load();
  };

  const handleBlock = async (id: number) => {
    await api.post(`/users/${id}/block/`);
    load();
  };

  const handleUnblock = async (id: number) => {
    await api.post(`/users/${id}/unblock/`);
    load();
  };

  const handleTrash = async (id: number) => {
    if (confirm('Przenieść użytkownika do kosza? Jego obiekty zostaną ukryte.')) {
      await api.post(`/users/${id}/trash/`);
      load();
    }
  };

  const handleRestore = async (id: number) => {
    await api.post(`/users/${id}/restore/`);
    load();
  };

  const handlePermanentDelete = async (id: number) => {
    if (confirm('UWAGA: Trwałe usunięcie! Tej operacji nie można cofnąć.')) {
      await api.delete(`/users/${id}/permanent_delete/`);
      load();
    }
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Użytkownicy
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
          Dodaj użytkownika
        </Button>
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nazwa użytkownika</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Rola</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell>{u.username}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>
                  {u.is_trashed ? <Chip label="Kosz" color="error" size="small" />
                    : u.is_blocked ? <Chip label="Zablokowany" color="warning" size="small" />
                    : <Chip label="Aktywny" color="success" size="small" />}
                </TableCell>
                <TableCell align="right">
                  {u.is_trashed ? (
                    <>
                      <IconButton size="small" title="Przywróć" onClick={() => handleRestore(u.id)}>
                        <RestoreFromTrash />
                      </IconButton>
                      <IconButton size="small" title="Usuń trwale" onClick={() => handlePermanentDelete(u.id)}>
                        <DeleteForever color="error" />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      {u.is_blocked ? (
                        <IconButton size="small" title="Odblokuj" onClick={() => handleUnblock(u.id)}>
                          <LockOpen />
                        </IconButton>
                      ) : (
                        <IconButton size="small" title="Zablokuj" onClick={() => handleBlock(u.id)}>
                          <Block />
                        </IconButton>
                      )}
                      <IconButton size="small" title="Do kosza" onClick={() => handleTrash(u.id)}>
                        <Delete />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Nowy użytkownik</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important', minWidth: 350 }}>
          <TextField label="Nazwa użytkownika" value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })} />
          <TextField label="Email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <TextField label="Imię" value={form.first_name}
            onChange={e => setForm({ ...form, first_name: e.target.value })} />
          <TextField label="Nazwisko" value={form.last_name}
            onChange={e => setForm({ ...form, last_name: e.target.value })} />
          <TextField label="Hasło" type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
          <TextField label="Rola" select value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as 'USER' | 'ADMIN' })}>
            <MenuItem value="USER">Użytkownik</MenuItem>
            <MenuItem value="ADMIN">Administrator</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleCreate}>Utwórz</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
