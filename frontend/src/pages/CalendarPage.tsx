import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, Box, Paper, IconButton, Tooltip,
} from '@mui/material';
import { ArrowBack, ChevronLeft, ChevronRight } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../api';
import { CalendarEntry, RoomSimple } from '../types';

const CELL_WIDTH = 36;
const LABEL_WIDTH = 80;

const COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828',
  '#00838f', '#4e342e', '#283593', '#558b2f', '#ad1457',
];

export default function CalendarPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [rooms, setRooms] = useState<RoomSimple[]>([]);
  const [reservations, setReservations] = useState<CalendarEntry[]>([]);

  useEffect(() => {
    const from = month.format('YYYY-MM-DD');
    const to = month.endOf('month').format('YYYY-MM-DD');
    api.get(`/hotels/${hotelId}/calendar/?date_from=${from}&date_to=${to}`).then(r => {
      setRooms(r.data.rooms?.map((rm: any) => ({ id: rm.id, number: rm.number, capacity: rm.capacity })) || []);
      setReservations(r.data.reservations || []);
    });
  }, [hotelId, month]);

  const daysInMonth = month.daysInMonth();
  const days = Array.from({ length: daysInMonth }, (_, i) => month.add(i, 'day'));

  const reservationsByRoom = useMemo(() => {
    const map: Record<number, CalendarEntry[]> = {};
    reservations.forEach(r => {
      if (!map[r.room]) map[r.room] = [];
      map[r.room].push(r);
    });
    return map;
  }, [reservations]);

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        Powrót
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <IconButton onClick={() => setMonth(m => m.subtract(1, 'month'))}><ChevronLeft /></IconButton>
        <Typography variant="h6" sx={{ minWidth: 200, textAlign: 'center' }}>
          {month.format('MMMM YYYY')}
        </Typography>
        <IconButton onClick={() => setMonth(m => m.add(1, 'month'))}><ChevronRight /></IconButton>
      </Box>

      <Paper sx={{ overflow: 'auto' }}>
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
            <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, p: 0.5, borderRight: 1, borderColor: 'divider', fontWeight: 600, fontSize: 12 }}>
              Pokój
            </Box>
            {days.map(d => (
              <Box key={d.date()} sx={{
                width: CELL_WIDTH, flexShrink: 0, textAlign: 'center', p: 0.5,
                borderRight: 1, borderColor: 'divider', fontSize: 11,
                bgcolor: d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent',
              }}>
                <Box>{d.date()}</Box>
                <Box sx={{ fontSize: 9, opacity: 0.6 }}>{d.format('dd')}</Box>
              </Box>
            ))}
          </Box>

          {/* Rows */}
          {rooms.map(room => (
            <Box key={room.id} sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'relative', height: 32 }}>
              <Box sx={{
                width: LABEL_WIDTH, flexShrink: 0, p: 0.5, borderRight: 1, borderColor: 'divider',
                fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
              }}>
                {room.number}
              </Box>
              <Box sx={{ position: 'relative', display: 'flex', flex: 1 }}>
                {days.map(d => (
                  <Box key={d.date()} sx={{
                    width: CELL_WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider',
                    bgcolor: d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent',
                  }} />
                ))}
                {/* Reservation bars */}
                {(reservationsByRoom[room.id] || []).map((r, idx) => {
                  const start = dayjs(r.check_in);
                  const end = dayjs(r.check_out);
                  const monthStart = month;
                  const monthEnd = month.endOf('month');

                  const barStart = start.isBefore(monthStart) ? monthStart : start;
                  const barEnd = end.isAfter(monthEnd) ? monthEnd.add(1, 'day') : end;

                  const startOffset = barStart.diff(monthStart, 'day');
                  const barLength = barEnd.diff(barStart, 'day');

                  if (barLength <= 0) return null;

                  return (
                    <Tooltip key={r.id} title={`${r.guest_name} (${r.check_in} → ${r.check_out})`}>
                      <Box
                        onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}
                        sx={{
                          position: 'absolute',
                          left: startOffset * CELL_WIDTH,
                          width: barLength * CELL_WIDTH - 2,
                          top: 4,
                          height: 24,
                          bgcolor: COLORS[idx % COLORS.length],
                          borderRadius: 1,
                          color: '#fff',
                          fontSize: 10,
                          px: 0.5,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          '&:hover': { opacity: 0.85 },
                        }}
                      >
                        {r.guest_name}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>
    </>
  );
}
