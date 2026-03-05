import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, CardContent, ToggleButtonGroup, ToggleButton, Box, Divider,
  TextField, Button, Alert, Switch, FormControlLabel,
} from '@mui/material';
import { LightMode, DarkMode, ArrowBack } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { AutoLogoutSettings } from '../hooks/useAutoLogout';

const COLOR_KEYS = [
  { key: 'blue', value: '#1976d2' },
  { key: 'green', value: '#388e3c' },
  { key: 'purple', value: '#7b1fa2' },
  { key: 'red', value: '#c62828' },
  { key: 'orange', value: '#e65100' },
  { key: 'teal', value: '#00838f' },
];

const TIMEOUT_OPTIONS = [5, 10, 15, 30, 60];

interface Props {
  themeSettings: { mode: 'light' | 'dark'; color: string };
  onUpdateTheme: (s: { mode: 'light' | 'dark'; color: string }) => void;
  autoLogoutSettings: AutoLogoutSettings;
  onUpdateAutoLogout: (s: AutoLogoutSettings) => void;
}

export default function SettingsPage({ themeSettings, onUpdateTheme, autoLogoutSettings, onUpdateAutoLogout }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: t('settings.passwordMismatch') });
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
      setPwMsg({ type: 'error', text: err.response?.data?.detail || t('settings.passwordError') });
    }
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/')} sx={{ mb: 2 }}>
        {t('settings.backToMain')}
      </Button>

      <Typography variant="h5" sx={{ mb: 3 }}>{t('settings.title')}</Typography>

      <Card sx={{ maxWidth: 500, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>{t('settings.theme')}</Typography>
          <ToggleButtonGroup
            value={themeSettings.mode}
            exclusive
            onChange={(_, v) => v && onUpdateTheme({ ...themeSettings, mode: v })}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="light"><LightMode sx={{ mr: 1 }} /> {t('settings.light')}</ToggleButton>
            <ToggleButton value="dark"><DarkMode sx={{ mr: 1 }} /> {t('settings.dark')}</ToggleButton>
          </ToggleButtonGroup>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 2 }}>{t('settings.primaryColor')}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {COLOR_KEYS.map(c => (
              <Box
                key={c.value}
                onClick={() => onUpdateTheme({ ...themeSettings, color: c.value })}
                sx={{
                  width: 40, height: 40, borderRadius: 2, bgcolor: c.value, cursor: 'pointer',
                  border: themeSettings.color === c.value ? '3px solid' : '3px solid transparent',
                  borderColor: themeSettings.color === c.value ? 'text.primary' : 'transparent',
                  '&:hover': { opacity: 0.8 },
                }}
                title={t(`settings.colors.${c.key}`)}
              />
            ))}
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 500, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>{t('settings.autoLogout')}</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={autoLogoutSettings.enabled}
                onChange={e => onUpdateAutoLogout({ ...autoLogoutSettings, enabled: e.target.checked })}
              />
            }
            label={t('settings.autoLogoutEnable')}
          />
          {autoLogoutSettings.enabled && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" sx={{ mb: 1.5 }}>{t('settings.autoLogoutTimeout')}</Typography>
              <ToggleButtonGroup
                value={autoLogoutSettings.timeoutMinutes}
                exclusive
                onChange={(_, v) => v && onUpdateAutoLogout({ ...autoLogoutSettings, timeoutMinutes: v })}
                size="small"
              >
                {TIMEOUT_OPTIONS.map(m => (
                  <ToggleButton key={m} value={m}>
                    {t('settings.autoLogoutMinutes', { count: m })}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </>
          )}
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 500 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>{t('settings.changePassword')}</Typography>
          {pwMsg && <Alert severity={pwMsg.type} sx={{ mb: 2 }}>{pwMsg.text}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label={t('settings.currentPassword')} type="password" value={oldPassword}
              onChange={e => setOldPassword(e.target.value)} size="small" />
            <TextField label={t('settings.newPassword')} type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} size="small" />
            <TextField label={t('settings.confirmPassword')} type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} size="small" />
            <Button variant="contained" onClick={handleChangePassword}
              disabled={!oldPassword || !newPassword || !confirmPassword}>
              {t('settings.changePasswordBtn')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}
