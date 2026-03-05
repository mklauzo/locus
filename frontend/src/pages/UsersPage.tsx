import { useState, useEffect } from 'react';
import {
  Typography, Button, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  IconButton, Paper, TableContainer, Chip,
} from '@mui/material';
import { Add, Block, LockOpen, Delete, RestoreFromTrash, DeleteForever } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { User } from '../types';

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ username: string; email: string; password: string; role: 'USER' | 'ADMIN'; first_name: string; last_name: string }>({ username: '', email: '', password: '', role: 'USER', first_name: '', last_name: '' });

  const load = () => api.get('/users/').then(r => setUsers(r.data.results || r.data));

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await api.post('/users/', form);
    setOpen(false);
    setForm({ username: '', email: '', password: '', role: 'USER' as const, first_name: '', last_name: '' });
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
    if (confirm(t('users.trashConfirm'))) {
      await api.post(`/users/${id}/trash/`);
      load();
    }
  };

  const handleRestore = async (id: number) => {
    await api.post(`/users/${id}/restore/`);
    load();
  };

  const handlePermanentDelete = async (id: number) => {
    if (confirm(t('users.permanentDeleteConfirm'))) {
      await api.delete(`/users/${id}/permanent_delete/`);
      load();
    }
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('users.title')}
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
          {t('users.addUser')}
        </Button>
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('users.usernameHeader')}</TableCell>
              <TableCell>{t('users.emailHeader')}</TableCell>
              <TableCell>{t('users.roleHeader')}</TableCell>
              <TableCell>{t('users.statusHeader')}</TableCell>
              <TableCell align="right">{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell>{u.username}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>
                  {u.is_trashed ? <Chip label={t('users.trash')} color="error" size="small" />
                    : u.is_blocked ? <Chip label={t('users.blocked')} color="warning" size="small" />
                    : <Chip label={t('users.active')} color="success" size="small" />}
                </TableCell>
                <TableCell align="right">
                  {u.is_trashed ? (
                    <>
                      <IconButton size="small" title={t('users.restore')} onClick={() => handleRestore(u.id)}>
                        <RestoreFromTrash />
                      </IconButton>
                      <IconButton size="small" title={t('users.permanentDelete')} onClick={() => handlePermanentDelete(u.id)}>
                        <DeleteForever color="error" />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      {u.is_blocked ? (
                        <IconButton size="small" title={t('users.unblock')} onClick={() => handleUnblock(u.id)}>
                          <LockOpen />
                        </IconButton>
                      ) : (
                        <IconButton size="small" title={t('users.block')} onClick={() => handleBlock(u.id)}>
                          <Block />
                        </IconButton>
                      )}
                      <IconButton size="small" title={t('users.toTrash')} onClick={() => handleTrash(u.id)}>
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
        <DialogTitle>{t('users.newUser')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important', minWidth: 350 }}>
          <TextField label={t('common.username')} value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })} />
          <TextField label={t('users.emailField')} value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <TextField label={t('common.firstName')} value={form.first_name}
            onChange={e => setForm({ ...form, first_name: e.target.value })} />
          <TextField label={t('common.lastName')} value={form.last_name}
            onChange={e => setForm({ ...form, last_name: e.target.value })} />
          <TextField label={t('users.passwordField')} type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
          <TextField label={t('users.roleField')} select value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as 'USER' | 'ADMIN' })}>
            <MenuItem value="USER">{t('users.roleUser')}</MenuItem>
            <MenuItem value="ADMIN">{t('users.roleAdmin')}</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate}>{t('common.create')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
