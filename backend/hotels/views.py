import re
import imaplib
from datetime import date
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from django.conf import settings
from django.db.models import Q
from .models import Hotel, Room, Reservation, MailCorrespondence, AuditLog
from .serializers import (
    UserSerializer, UserMeSerializer, HotelSerializer, RoomSerializer,
    ReservationSerializer, ReservationListSerializer, CalendarSerializer,
    MailCorrespondenceSerializer,
)
from .tasks import search_mail_for_reservation

User = get_user_model()


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.is_admin


# --- Auth & Users ---

@api_view(['GET'])
def me(request):
    return Response(UserMeSerializer(request.user).data)


@api_view(['POST'])
def change_password(request):
    old_password = request.data.get('old_password', '')
    new_password = request.data.get('new_password', '')
    if not new_password or len(new_password) < 6:
        return Response({'detail': 'Nowe hasło musi mieć co najmniej 6 znaków.'}, status=status.HTTP_400_BAD_REQUEST)
    if not request.user.check_password(old_password):
        return Response({'detail': 'Stare hasło jest nieprawidłowe.'}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(new_password)
    request.user.save()
    return Response({'detail': 'Hasło zostało zmienione.'})


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return User.objects.exclude(id=self.request.user.id).order_by('username')

    @action(detail=True, methods=['post'])
    def block(self, request, pk=None):
        user = self.get_object()
        user.is_blocked = True
        user.save()
        return Response({'status': 'blocked'})

    @action(detail=True, methods=['post'])
    def unblock(self, request, pk=None):
        user = self.get_object()
        user.is_blocked = False
        user.save()
        return Response({'status': 'unblocked'})

    @action(detail=True, methods=['post'])
    def trash(self, request, pk=None):
        user = self.get_object()
        user.is_trashed = True
        user.is_active = False
        user.save()
        # Soft-delete hotels created by this user
        Hotel.objects.filter(created_by=user).update(is_deleted=True)
        return Response({'status': 'trashed'})

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        user = self.get_object()
        user.is_trashed = False
        user.is_active = True
        user.save()
        Hotel.objects.filter(created_by=user).update(is_deleted=False)
        return Response({'status': 'restored'})

    @action(detail=True, methods=['delete'])
    def permanent_delete(self, request, pk=None):
        user = self.get_object()
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Hotels ---

class HotelViewSet(viewsets.ModelViewSet):
    serializer_class = HotelSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Hotel.objects.filter(is_deleted=False)
        return Hotel.objects.filter(users=user, is_deleted=False)

    def perform_create(self, serializer):
        hotel = serializer.save(created_by=self.request.user)
        hotel.users.add(self.request.user)

    @action(detail=True, methods=['post'])
    def test_imap(self, request, pk=None):
        hotel = self.get_object()
        host = request.data.get('imap_host', hotel.imap_host)
        port = int(request.data.get('imap_port', hotel.imap_port))
        ssl = request.data.get('imap_ssl', hotel.imap_ssl)
        login = request.data.get('imap_login', hotel.imap_login)
        password = request.data.get('imap_password', hotel.imap_password)

        if not host or not login or not password:
            return Response({'status': 'error', 'message': 'Brak danych IMAP.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if ssl:
                mail = imaplib.IMAP4_SSL(host, port)
            else:
                mail = imaplib.IMAP4(host, port)
            mail.login(login, password)
            mail.select('INBOX', readonly=True)
            _, messages = mail.search(None, 'ALL')
            count = len(messages[0].split()) if messages[0] else 0
            mail.logout()
            return Response({'status': 'ok', 'message': f'Połączenie OK. Wiadomości w skrzynce: {count}'})
        except imaplib.IMAP4.error as e:
            return Response({'status': 'error', 'message': f'Błąd logowania IMAP: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'status': 'error', 'message': f'Błąd połączenia: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


# --- Rooms ---

class RoomViewSet(viewsets.ModelViewSet):
    serializer_class = RoomSerializer

    def get_queryset(self):
        return Room.objects.filter(
            hotel_id=self.kwargs['hotel_pk'],
            is_deleted=False,
        ).order_by('number')

    def perform_create(self, serializer):
        serializer.save(hotel_id=self.kwargs['hotel_pk'])


# --- Reservations ---

class ReservationViewSet(viewsets.ModelViewSet):
    filterset_fields = ['room', 'is_deleted']
    search_fields = ['guest_first_name', 'guest_last_name', 'contact_email', 'contact_phone']
    ordering_fields = ['check_in', 'check_out', 'guest_name', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return ReservationListSerializer
        return ReservationSerializer

    def get_queryset(self):
        qs = Reservation.objects.filter(
            hotel_id=self.kwargs['hotel_pk'],
        ).select_related('room').order_by('-check_in')

        show_deleted = self.request.query_params.get('show_deleted', 'false')
        if show_deleted != 'true':
            qs = qs.filter(is_deleted=False)

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(check_out__gte=date_from)
        if date_to:
            qs = qs.filter(check_in__lte=date_to)
        return qs

    def perform_create(self, serializer):
        reservation = serializer.save(
            hotel_id=self.kwargs['hotel_pk'],
            created_by=self.request.user,
        )
        # Trigger async mail search by last name
        if reservation.guest_last_name:
            search_mail_for_reservation.delay(reservation.id, reservation.guest_last_name)

    def perform_update(self, serializer):
        old = self.get_object()
        old_data = ReservationSerializer(old).data
        reservation = serializer.save(edited_by=self.request.user)
        new_data = ReservationSerializer(reservation).data

        changes = {}
        tracked = ['guest_first_name', 'guest_last_name', 'check_in', 'check_out', 'room', 'deposit_paid',
                   'deposit_amount', 'remaining_amount', 'is_settled', 'companions', 'animals', 'notes',
                   'contact_email', 'contact_phone']
        for field in tracked:
            if str(old_data.get(field)) != str(new_data.get(field)):
                changes[field] = {'old': str(old_data.get(field)), 'new': str(new_data.get(field))}

        if changes:
            AuditLog.objects.create(
                reservation=reservation,
                user=self.request.user,
                action='update',
                changes=changes,
            )

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save()
        AuditLog.objects.create(
            reservation=instance,
            user=self.request.user,
            action='soft_delete',
            changes={},
        )

    @action(detail=True, methods=['post'])
    def settle(self, request, hotel_pk=None, pk=None):
        reservation = self.get_object()
        reservation.is_settled = True
        reservation.save(update_fields=['is_settled'])
        AuditLog.objects.create(
            reservation=reservation,
            user=request.user,
            action='settle',
            changes={},
        )
        return Response({'status': 'settled'})

    @action(detail=True, methods=['post'])
    def search_mail(self, request, hotel_pk=None, pk=None):
        reservation = self.get_object()
        search_term = reservation.guest_last_name
        if request.data.get('email'):
            search_term = request.data['email']
        search_mail_for_reservation.delay(reservation.id, search_term)
        return Response({'status': 'mail_search_started'})


# --- Correspondence ---

@api_view(['DELETE'])
def delete_correspondence(request, hotel_pk, reservation_pk, pk):
    try:
        mail = MailCorrespondence.objects.get(
            pk=pk,
            reservation_id=reservation_pk,
            reservation__hotel_id=hotel_pk,
        )
    except MailCorrespondence.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    mail.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# --- Calendar ---

@api_view(['GET'])
def calendar_view(request, hotel_pk):
    date_from = request.query_params.get('date_from', str(date.today()))
    date_to = request.query_params.get('date_to')
    if not date_to:
        from datetime import timedelta
        date_to = str(date.today() + timedelta(days=30))

    reservations = Reservation.objects.filter(
        hotel_id=hotel_pk,
        is_deleted=False,
        check_in__lte=date_to,
        check_out__gte=date_from,
    ).select_related('room').order_by('room__number', 'check_in')

    rooms = Room.objects.filter(hotel_id=hotel_pk, is_deleted=False).order_by('number')
    room_data = RoomSerializer(rooms, many=True).data
    reservation_data = CalendarSerializer(reservations, many=True).data

    return Response({
        'rooms': room_data,
        'reservations': reservation_data,
        'date_from': date_from,
        'date_to': date_to,
    })


# --- IMAP test (standalone, no hotel needed) ---

@api_view(['POST'])
def test_imap_standalone(request):
    host = request.data.get('imap_host', '')
    port = int(request.data.get('imap_port', 993))
    ssl = request.data.get('imap_ssl', True)
    login = request.data.get('imap_login', '')
    password = request.data.get('imap_password', '')

    if not host or not login or not password:
        return Response({'status': 'error', 'message': 'Wypełnij host, login i hasło IMAP.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        if ssl:
            mail = imaplib.IMAP4_SSL(host, port)
        else:
            mail = imaplib.IMAP4(host, port)
        mail.login(login, password)
        mail.select('INBOX', readonly=True)
        _, messages = mail.search(None, 'ALL')
        count = len(messages[0].split()) if messages[0] else 0
        mail.logout()
        return Response({'status': 'ok', 'message': f'Połączenie OK. Wiadomości w skrzynce: {count}'})
    except imaplib.IMAP4.error as e:
        return Response({'status': 'error', 'message': f'Błąd logowania IMAP: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'status': 'error', 'message': f'Błąd połączenia: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


# --- Weather proxy ---

@api_view(['GET'])
@permission_classes([AllowAny])
def weather(request):
    import urllib.request
    import json

    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        return Response({'error': 'API key not configured'}, status=503)

    lat = request.query_params.get('lat', '52.2297')
    lon = request.query_params.get('lon', '21.0122')
    url = f'https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=metric&lang=pl'

    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        return Response({
            'temp': data['main']['temp'],
            'description': data['weather'][0]['description'],
            'icon': data['weather'][0]['icon'],
        })
    except Exception:
        return Response({'error': 'Weather unavailable'}, status=503)
