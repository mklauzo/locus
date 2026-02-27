import { useState } from 'react';
import {
  Typography, Card, CardContent, ToggleButtonGroup, ToggleButton, Box, Divider,
  TextField, Button, Alert,
} from '@mui/material';
import { LightMode, DarkMode } from '@mui/icons-material';
import api from '../api';

const COLORS = [
  { label: 'Niebieski', value: '#1976d2' },
  { label: 'Zielony', value: '#388e3c' },
  { label: 'Fioletowy', value: '#7b1fa2' },
  { label: 'Czerwony', value: '#c62828' },
  { label: 'Pomarańczowy', value: '#e65100' },
  { label: 'Turkusowy', value: '#00838f' },
];

interface Props {
  themeSettings: { mode: 'light' | 'dark'; color: string };
  onUpdateTheme: (s: { mode: 'light' | 'dark'; color: string }) => void;
}

export default function SettingsPage({ themeSettings, onUpdateTheme }: Props) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'Nowe hasła nie są identyczne.' });
      return;
    }
    try {
      const res = await api.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPwMsg({ type: 'success', text: res.data.detail });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err.response?.data?.detail || 'Błąd zmiany hasła.' });
    }
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>Ustawienia</Typography>

      <Card sx={{ maxWidth: 500, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Motyw</Typography>
          <ToggleButtonGroup
            value={themeSettings.mode}
            exclusive
            onChange={(_, v) => v && onUpdateTheme({ ...themeSettings, mode: v })}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="light"><LightMode sx={{ mr: 1 }} /> Jasny</ToggleButton>
            <ToggleButton value="dark"><DarkMode sx={{ mr: 1 }} /> Ciemny</ToggleButton>
          </ToggleButtonGroup>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 2 }}>Kolor przewodni</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <Box
                key={c.value}
                onClick={() => onUpdateTheme({ ...themeSettings, color: c.value })}
                sx={{
                  width: 40, height: 40, borderRadius: 2, bgcolor: c.value, cursor: 'pointer',
                  border: themeSettings.color === c.value ? '3px solid' : '3px solid transparent',
                  borderColor: themeSettings.color === c.value ? 'text.primary' : 'transparent',
                  '&:hover': { opacity: 0.8 },
                }}
                title={c.label}
              />
            ))}
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 500 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Zmiana hasła</Typography>
          {pwMsg && <Alert severity={pwMsg.type} sx={{ mb: 2 }}>{pwMsg.text}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Aktualne hasło" type="password" value={oldPassword}
              onChange={e => setOldPassword(e.target.value)} size="small" />
            <TextField label="Nowe hasło" type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} size="small" />
            <TextField label="Potwierdź nowe hasło" type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} size="small" />
            <Button variant="contained" onClick={handleChangePassword}
              disabled={!oldPassword || !newPassword || !confirmPassword}>
              Zmień hasło
            </Button>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}
