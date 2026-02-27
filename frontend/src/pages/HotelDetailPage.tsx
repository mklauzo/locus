import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Card, CardContent, Grid, Button, Box, Chip, Alert, CircularProgress,
} from '@mui/material';
import {
  MeetingRoom, EventNote, CalendarMonth, ArrowBack, Email,
} from '@mui/icons-material';
import api from '../api';
import { Hotel } from '../types';

export default function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapResult, setImapResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.get(`/hotels/${id}/`).then(r => setHotel(r.data));
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
                  Test poczty
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
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
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
        <Grid item xs={12} sm={4}>
          <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/hotels/${id}/reservations`)}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <EventNote sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Rezerwacje</Typography>
              <Typography variant="body2" color="text.secondary">
                Zarządzaj rezerwacjami
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
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
      </Grid>
    </>
  );
}
