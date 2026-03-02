import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Button, Box, Paper, IconButton, Tooltip,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { ArrowBack, ChevronLeft, ChevronRight, ViewList, GridView } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../api';
import { CalendarEntry, RoomSimple } from '../types';

const CELL_WIDTH = 36;
const LABEL_WIDTH = 80;
const ROW_HEIGHT = 28;
const DAY_LABEL_WIDTH = 64;
const ROOM_COL_WIDTH = 100;

const COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828',
  '#00838f', '#4e342e', '#283593', '#558b2f', '#ad1457',
];

type ViewMode = 'gantt' | 'matrix';

export default function CalendarPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('calendarViewMode') as ViewMode) || 'gantt',
  );
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [rooms, setRooms] = useState<RoomSimple[]>([]);
  const [reservations, setReservations] = useState<CalendarEntry[]>([]);

  const handleViewMode = (_: React.MouseEvent, v: ViewMode | null) => {
    if (!v) return;
    setViewMode(v);
    localStorage.setItem('calendarViewMode', v);
  };

  useEffect(() => {
    const from = month.format('YYYY-MM-DD');
    const to = month.endOf('month').format('YYYY-MM-DD');
    api.get(`/hotels/${hotelId}/calendar/?date_from=${from}&date_to=${to}`).then(r => {
      setRooms(r.data.rooms?.map((rm: any) => ({ id: rm.id, number: rm.number, capacity: rm.capacity })) || []);
      setReservations(r.data.reservations || []);
    });
  }, [hotelId, month]);

  const days = useMemo(
    () => Array.from({ length: month.daysInMonth() }, (_, i) => month.add(i, 'day')),
    [month],
  );

  // Consistent color per reservation across both views
  const colorMap = useMemo(() => {
    const map: Record<number, string> = {};
    reservations.forEach((r, idx) => { map[r.id] = COLORS[idx % COLORS.length]; });
    return map;
  }, [reservations]);

  const reservationsByRoom = useMemo(() => {
    const map: Record<number, CalendarEntry[]> = {};
    reservations.forEach(r => {
      if (!map[r.room]) map[r.room] = [];
      map[r.room].push(r);
    });
    return map;
  }, [reservations]);

  // Shared bar click/hover style
  const barBase = {
    borderRadius: 1, color: '#fff', fontSize: 10, px: 0.5,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    cursor: 'pointer', '&:hover': { opacity: 0.85 },
  } as const;

  // ── Gantt view (rows = rooms, columns = days) ──────────────────────────────
  const renderGantt = () => (
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

        {/* Room rows */}
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
              {(reservationsByRoom[room.id] || []).map(r => {
                const start = dayjs(r.check_in);
                const end = dayjs(r.check_out);
                const monthStart = month;
                const monthEnd = month.endOf('month');
                const isCheckInClamped = start.isBefore(monthStart);
                const isCheckOutClamped = end.isAfter(monthEnd);
                const barStart = isCheckInClamped ? monthStart : start;
                const barEnd = isCheckOutClamped ? monthEnd.add(1, 'day') : end;
                const startOffset = barStart.diff(monthStart, 'day');
                const endOffset = barEnd.diff(monthStart, 'day');
                if (endOffset - startOffset < 0) return null;
                const half = CELL_WIDTH / 2;
                const leftPx = startOffset * CELL_WIDTH + (isCheckInClamped ? 0 : half);
                const rightPx = endOffset * CELL_WIDTH + (isCheckOutClamped ? 0 : half);
                const widthPx = rightPx - leftPx - 2;
                if (widthPx <= 0) return null;
                return (
                  <Tooltip key={r.id} title={`${r.guest_name} (${r.check_in} → ${r.check_out})`}>
                    <Box
                      onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}
                      sx={{
                        ...barBase,
                        position: 'absolute', left: leftPx, width: widthPx,
                        top: 4, height: 24,
                        bgcolor: colorMap[r.id],
                        display: 'flex', alignItems: 'center',
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
  );

  // ── Matrix view (rows = days, columns = rooms) — vertical bars ─────────────
  const renderMatrix = () => {
    const half = ROW_HEIGHT / 2;
    const monthStart = month;
    const monthEnd = month.endOf('month');

    return (
      <Paper sx={{ overflow: 'auto' }}>
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>
          {/* Sticky header: room names */}
          <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
            <Box sx={{ width: DAY_LABEL_WIDTH, flexShrink: 0, p: 0.5, borderRight: 1, borderColor: 'divider', fontWeight: 600, fontSize: 12 }}>
              Dzień
            </Box>
            {rooms.map(room => (
              <Box key={room.id} sx={{
                width: ROOM_COL_WIDTH, flexShrink: 0, textAlign: 'center', p: 0.5,
                borderRight: 1, borderColor: 'divider', fontSize: 12, fontWeight: 600,
              }}>
                {room.number}
              </Box>
            ))}
          </Box>

          {/* Body: day labels + room columns with vertical bars */}
          <Box sx={{ display: 'flex' }}>
            {/* Day labels */}
            <Box sx={{ width: DAY_LABEL_WIDTH, flexShrink: 0 }}>
              {days.map(d => (
                <Box key={d.date()} sx={{
                  height: ROW_HEIGHT, borderBottom: 1, borderRight: 1, borderColor: 'divider',
                  bgcolor: d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent',
                  display: 'flex', alignItems: 'center', px: 0.75, gap: 0.5, fontSize: 11,
                }}>
                  <Box sx={{ fontWeight: 600 }}>{d.date()}</Box>
                  <Box sx={{ fontSize: 9, opacity: 0.6 }}>{d.format('dd')}</Box>
                </Box>
              ))}
            </Box>

            {/* One column per room */}
            {rooms.map(room => (
              <Box key={room.id} sx={{
                width: ROOM_COL_WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider',
                position: 'relative',
              }}>
                {/* Background day grid */}
                {days.map(d => (
                  <Box key={d.date()} sx={{
                    height: ROW_HEIGHT, borderBottom: 1, borderColor: 'divider',
                    bgcolor: d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent',
                  }} />
                ))}

                {/* Vertical reservation bars */}
                {(reservationsByRoom[room.id] || []).map(r => {
                  const start = dayjs(r.check_in);
                  const end = dayjs(r.check_out);
                  const isCheckInClamped = start.isBefore(monthStart);
                  const isCheckOutClamped = end.isAfter(monthEnd);
                  const barStart = isCheckInClamped ? monthStart : start;
                  const barEnd = isCheckOutClamped ? monthEnd.add(1, 'day') : end;
                  const startOffset = barStart.diff(monthStart, 'day');
                  const endOffset = barEnd.diff(monthStart, 'day');
                  if (endOffset - startOffset < 0) return null;
                  const topPx = startOffset * ROW_HEIGHT + (isCheckInClamped ? 0 : half);
                  const bottomPx = endOffset * ROW_HEIGHT + (isCheckOutClamped ? 0 : half);
                  const heightPx = bottomPx - topPx - 2;
                  if (heightPx <= 0) return null;
                  return (
                    <Tooltip key={r.id} title={`${r.guest_name} (${r.check_in} → ${r.check_out})`}>
                      <Box
                        onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}
                        sx={{
                          ...barBase,
                          position: 'absolute',
                          top: topPx, left: 4, right: 4, height: heightPx,
                          bgcolor: colorMap[r.id],
                          display: 'flex', alignItems: 'flex-start', pt: 0.5,
                        }}
                      >
                        {r.guest_name}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>
    );
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        Powrót
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <IconButton onClick={() => setMonth(m => m.subtract(1, 'month'))}><ChevronLeft /></IconButton>
        <Typography variant="h6" sx={{ minWidth: 200, textAlign: 'center' }}>
          {month.format('MMMM YYYY')}
        </Typography>
        <IconButton onClick={() => setMonth(m => m.add(1, 'month'))}><ChevronRight /></IconButton>

        <Box sx={{ flexGrow: 1 }} />

        <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewMode} size="small">
          <ToggleButton value="gantt" title="Pokoje jako wiersze, dni jako kolumny">
            <ViewList fontSize="small" />
          </ToggleButton>
          <ToggleButton value="matrix" title="Dni jako wiersze, pokoje jako kolumny">
            <GridView fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === 'gantt' ? renderGantt() : renderMatrix()}
    </>
  );
}
