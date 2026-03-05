import re
import imaplib
from datetime import date
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db.models import Q, Sum
from django.db.models.functions import ExtractYear
from django.utils import timezone
from .models import Hotel, Room, RoomPricing, Reservation, MailCorrespondence, AuditLog, AIAssistant, AIAssistantDocument
from .serializers import (
    UserSerializer, UserMeSerializer, HotelSerializer, RoomSerializer,
    ReservationSerializer, ReservationListSerializer, CalendarSerializer,
    MailCorrespondenceSerializer, AIAssistantSerializer, AIAssistantDocumentSerializer,
)
from .tasks import (
    search_mail_for_reservation, send_deposit_confirmation, _call_llm_api,
    decode_mime_header, extract_email_from_header, _get_message_body,
)

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
    def test_smtp(self, request, pk=None):
        hotel = self.get_object()
        host = request.data.get('smtp_host', hotel.smtp_host)
        port = int(request.data.get('smtp_port', hotel.smtp_port))
        ssl = request.data.get('smtp_ssl', hotel.smtp_ssl)
        login = request.data.get('smtp_login', hotel.smtp_login)
        password = request.data.get('smtp_password', hotel.smtp_password)

        if not host or not login or not password:
            return Response({'status': 'error', 'message': 'Brak danych SMTP.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            import smtplib
            if ssl:
                server = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                server = smtplib.SMTP(host, port, timeout=15)
                server.starttls()
            server.login(login, password)
            server.quit()
            return Response({'status': 'ok', 'message': 'Połączenie SMTP OK.'})
        except smtplib.SMTPAuthenticationError as e:
            return Response({'status': 'error', 'message': f'Błąd logowania SMTP ({login}@{host}:{port}): {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'status': 'error', 'message': f'Błąd połączenia SMTP ({host}:{port}): {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

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

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.has_new_mail:
            instance.has_new_mail = False
            instance.save(update_fields=['has_new_mail'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

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

        deposit_paid = self.request.query_params.get('deposit_paid')
        if deposit_paid is not None:
            qs = qs.filter(deposit_paid=deposit_paid.lower() in ('true', '1', 'yes'))

        is_settled = self.request.query_params.get('is_settled')
        if is_settled is not None:
            qs = qs.filter(is_settled=is_settled.lower() in ('true', '1', 'yes'))

        has_new_mail = self.request.query_params.get('has_new_mail')
        if has_new_mail is not None:
            qs = qs.filter(has_new_mail=has_new_mail.lower() in ('true', '1', 'yes'))

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

        # Send confirmation email when deposit is first recorded
        deposit_just_paid = (
            not old_data.get('deposit_paid') and new_data.get('deposit_paid')
        )
        if deposit_just_paid and reservation.contact_email:
            send_deposit_confirmation.delay(reservation.id)

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


# --- AI Assistant ---

class AIAssistantViewSet(viewsets.ModelViewSet):
    serializer_class = AIAssistantSerializer

    def get_queryset(self):
        return AIAssistant.objects.filter(
            hotel_id=self.kwargs['hotel_pk']
        ).prefetch_related('documents')

    def perform_create(self, serializer):
        serializer.save(hotel_id=self.kwargs['hotel_pk'])


def _extract_file_content(uploaded_file):
    """Extract text content from uploaded file (TXT, MD, PDF, DOCX)."""
    name = uploaded_file.name.lower()
    raw = uploaded_file.read()

    if name.endswith('.txt') or name.endswith('.md'):
        return raw.decode('utf-8', errors='replace')

    if name.endswith('.pdf'):
        try:
            from pdfminer.high_level import extract_text
            import io
            text = extract_text(io.BytesIO(raw))
            return text or f'[Pusty PDF: {uploaded_file.name}]'
        except ImportError:
            pass
        return f'[Nie można odczytać PDF (brak biblioteki): {uploaded_file.name}]'

    if name.endswith('.docx'):
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(raw))
            return '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            pass
        return f'[Nie można odczytać DOCX (brak biblioteki): {uploaded_file.name}]'

    try:
        return raw.decode('utf-8', errors='replace')
    except Exception:
        return f'[Plik: {uploaded_file.name}]'




@api_view(['POST'])
def fetch_llm_models(request):
    """Fetch available models from a given LLM provider."""
    import urllib.request
    import urllib.error
    import json as json_lib

    provider = request.data.get('provider', '')
    api_key = request.data.get('api_key', '')
    ollama_url = (request.data.get('ollama_url', '') or 'http://ollama:11434').rstrip('/')

    try:
        if provider == 'openai':
            req = urllib.request.Request(
                'https://api.openai.com/v1/models',
                headers={'Authorization': f'Bearer {api_key}'},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json_lib.loads(resp.read())
            models = sorted(
                [m for m in data['data'] if m['id'].startswith(('gpt-', 'o1', 'o3', 'o4'))],
                key=lambda m: m.get('created', 0),
                reverse=True,
            )
            return Response([{'value': m['id'], 'label': m['id']} for m in models])

        elif provider == 'anthropic':
            # Anthropic has no public list API — return known models
            return Response([
                {'value': 'claude-opus-4-6', 'label': 'Claude Opus 4.6'},
                {'value': 'claude-sonnet-4-6', 'label': 'Claude Sonnet 4.6'},
                {'value': 'claude-haiku-4-5-20251001', 'label': 'Claude Haiku 4.5'},
                {'value': 'claude-3-5-sonnet-20241022', 'label': 'Claude 3.5 Sonnet'},
                {'value': 'claude-3-5-haiku-20241022', 'label': 'Claude 3.5 Haiku'},
                {'value': 'claude-3-opus-20240229', 'label': 'Claude 3 Opus'},
            ])

        elif provider == 'gemini':
            if not api_key:
                return Response({'detail': 'Wymagany klucz API Google (AIza...).'}, status=status.HTTP_400_BAD_REQUEST)
            req = urllib.request.Request(
                f'https://generativelanguage.googleapis.com/v1beta/models?key={api_key}',
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json_lib.loads(resp.read())
            models = [
                m for m in data.get('models', [])
                if 'gemini' in m.get('name', '') and 'generateContent' in m.get('supportedGenerationMethods', [])
            ]
            return Response([
                {'value': m['name'].replace('models/', ''), 'label': m.get('displayName', m['name'].replace('models/', ''))}
                for m in models
            ])

        elif provider == 'ollama':
            req = urllib.request.Request(f'{ollama_url}/api/tags')
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json_lib.loads(resp.read())
            models = data.get('models', [])
            return Response([
                {'value': f'ollama:{m["name"]}', 'label': m['name']}
                for m in models
            ])

        else:
            return Response({'detail': 'Nieznany dostawca.'}, status=status.HTTP_400_BAD_REQUEST)

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        return Response({'detail': f'Błąd API ({e.code}): {error_body[:300]}'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        return Response({'detail': str(e)}, status=status.HTTP_502_BAD_GATEWAY)


def _save_draft_to_imap(hotel, correspondence, reply_text, to_email):
    """Append a draft reply to the hotel's IMAP Drafts folder."""
    import imaplib
    import time
    from email.mime.text import MIMEText
    import email as email_lib

    msg = MIMEText(reply_text, 'plain', 'utf-8')
    msg['From'] = hotel.email
    msg['To'] = to_email
    subject = correspondence.subject
    if not subject.lower().startswith('re:'):
        subject = f'Re: {subject}'
    msg['Subject'] = subject
    msg['Date'] = email_lib.utils.formatdate(localtime=True)
    msg['In-Reply-To'] = correspondence.message_id
    msg['References'] = correspondence.message_id

    if hotel.imap_ssl:
        mail = imaplib.IMAP4_SSL(hotel.imap_host, hotel.imap_port)
    else:
        mail = imaplib.IMAP4(hotel.imap_host, hotel.imap_port)
    mail.login(hotel.imap_login, hotel.imap_password)

    # Find Drafts folder
    drafts_folder = 'Drafts'
    _, folders = mail.list()
    for folder_bytes in (folders or []):
        decoded = folder_bytes.decode('utf-8', errors='replace')
        if 'draft' in decoded.lower():
            # Format: (\Flags) "/" "Folder Name"
            parts = decoded.rsplit('"', 2)
            if len(parts) >= 2:
                candidate = parts[-2].strip('"').strip()
                if candidate and 'draft' in candidate.lower():
                    drafts_folder = candidate
                    break
            # Unquoted format
            parts2 = decoded.rsplit(' ', 1)
            if len(parts2) == 2:
                candidate2 = parts2[-1].strip().strip('"')
                if candidate2 and 'draft' in candidate2.lower():
                    drafts_folder = candidate2
                    break

    try:
        mail.append(
            drafts_folder,
            '(\\Draft)',
            imaplib.Time2Internaldate(time.time()),
            msg.as_bytes(),
        )
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def _send_via_smtp(hotel, correspondence, reply_text, to_email):
    """Send reply email via hotel's SMTP configuration."""
    import smtplib
    from email.mime.text import MIMEText
    import email as email_lib

    msg = MIMEText(reply_text, 'plain', 'utf-8')
    msg['From'] = hotel.email
    msg['To'] = to_email
    subject = correspondence.subject
    if not subject.lower().startswith('re:'):
        subject = f'Re: {subject}'
    msg['Subject'] = subject
    msg['Date'] = email_lib.utils.formatdate(localtime=True)
    msg['In-Reply-To'] = correspondence.message_id
    msg['References'] = correspondence.message_id

    if hotel.smtp_ssl:
        server = smtplib.SMTP_SSL(hotel.smtp_host, hotel.smtp_port, timeout=30)
    else:
        server = smtplib.SMTP(hotel.smtp_host, hotel.smtp_port, timeout=30)
        server.starttls()

    server.login(hotel.smtp_login, hotel.smtp_password)
    server.sendmail(hotel.email, [to_email], msg.as_string())
    server.quit()


@api_view(['POST'])
def upload_ai_document(request, hotel_pk, assistant_pk):
    try:
        assistant = AIAssistant.objects.get(pk=assistant_pk, hotel_id=hotel_pk)
    except AIAssistant.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        return Response({'detail': 'Brak pliku.'}, status=status.HTTP_400_BAD_REQUEST)

    if uploaded_file.size > 10 * 1024 * 1024:
        return Response({'detail': 'Plik jest zbyt duży (max 10 MB).'}, status=status.HTTP_400_BAD_REQUEST)

    content = _extract_file_content(uploaded_file)
    doc = AIAssistantDocument.objects.create(
        assistant=assistant,
        name=uploaded_file.name,
        content=content,
    )
    return Response(AIAssistantDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


@api_view(['DELETE', 'PATCH'])
def ai_document_detail(request, hotel_pk, assistant_pk, pk):
    try:
        doc = AIAssistantDocument.objects.get(pk=pk, assistant_id=assistant_pk, assistant__hotel_id=hotel_pk)
    except AIAssistantDocument.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — update name and/or content
    if 'name' in request.data:
        doc.name = request.data['name'].strip() or doc.name
    if 'content' in request.data:
        doc.content = request.data['content']
    doc.save()
    return Response(AIAssistantDocumentSerializer(doc).data)


@api_view(['POST'])
def generate_email_reply(request, hotel_pk, reservation_pk, pk):
    """Generate AI reply for a correspondence email and save to IMAP Drafts."""
    try:
        correspondence = MailCorrespondence.objects.select_related(
            'reservation__hotel', 'reservation__room'
        ).get(pk=pk, reservation_id=reservation_pk, reservation__hotel_id=hotel_pk)
    except MailCorrespondence.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    reservation = correspondence.reservation
    hotel = reservation.hotel

    assistant = AIAssistant.objects.prefetch_related('documents').filter(
        hotel=hotel, is_active=True
    ).first()
    if not assistant:
        return Response(
            {'detail': 'Brak aktywnego asystenta AI dla tego hotelu.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not assistant.llm_api_key and not assistant.llm_model.startswith('ollama:'):
        return Response(
            {'detail': 'Asystent AI nie ma skonfigurowanego klucza API.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    to_email = request.data.get('to_email', '') or correspondence.sender_email or reservation.contact_email or ''
    send_via_smtp = request.data.get('send_via_smtp', False)
    generate_only = request.data.get('generate_only', False)
    # If caller provides pre-edited text, skip LLM generation
    provided_reply = request.data.get('reply_text', '').strip()

    # Build context from documents
    docs_context = ''
    for doc in assistant.documents.all():
        docs_context += f'\n\n--- Dokument: {doc.name} ---\n{doc.content[:3000]}'

    system = (assistant.system_prompt or
              'Jesteś pomocnym asystentem hotelowym. Odpowiadaj na emaile gości w imieniu hotelu. '
              'Bądź uprzejmy, profesjonalny i pomocny.')
    if docs_context:
        system += f'\n\nDodatkowe informacje o hotelu:\n{docs_context}'

    deposit_status = (
        f'wpłacona ({reservation.deposit_amount} zł, dnia {reservation.deposit_date})'
        if reservation.deposit_paid and reservation.deposit_date
        else f'wpłacona ({reservation.deposit_amount} zł)'
        if reservation.deposit_paid
        else 'nie wpłacona'
    )
    reservation_info = (
        f'Hotel: {hotel.name}\n'
        f'Gość: {reservation.guest_name}\n'
        f'Pokój: {reservation.room.number}\n'
        f'Przyjazd: {reservation.check_in}\n'
        f'Wyjazd: {reservation.check_out}\n'
        f'Liczba dni: {reservation.days_count}\n'
        f'Zaliczka: {deposit_status}\n'
        f'Kwota do zapłaty łącznie: {reservation.remaining_amount} zł\n'
        f'Status rozliczenia: {"rozliczona" if reservation.is_settled else "nierozliczona"}\n'
    )

    user_message = (
        f'Informacje o rezerwacji:\n{reservation_info}\n\n'
        f'Email gościa wymagający odpowiedzi:\n'
        f'Temat: {correspondence.subject}\n'
        f'Treść:\n{correspondence.body[:3000]}\n\n'
        f'Napisz odpowiedź na powyższy email w imieniu hotelu.'
    )

    if provided_reply:
        reply_text = provided_reply
    else:
        try:
            reply_text = _call_llm_api(
                assistant.llm_model, assistant.llm_api_key, system, user_message,
                ollama_url=assistant.ollama_url or 'http://ollama:11434',
            )
        except Exception as e:
            import traceback
            print(f'[AI REPLY ERROR] model={assistant.llm_model} url={assistant.ollama_url}: {e}\n{traceback.format_exc()}', flush=True)
            return Response({'detail': f'Błąd generowania odpowiedzi: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    if generate_only:
        return Response({'reply_text': reply_text})

    # Send via SMTP or save to IMAP Drafts
    if send_via_smtp:
        if not hotel.smtp_host or not hotel.smtp_login or not hotel.smtp_password:
            return Response({'reply_text': reply_text, 'smtp_sent': False,
                             'smtp_error': 'Brak konfiguracji SMTP dla tego hotelu.'})
        try:
            _send_via_smtp(hotel, correspondence, reply_text, to_email)
            return Response({'reply_text': reply_text, 'smtp_sent': True})
        except Exception as e:
            return Response({'reply_text': reply_text, 'smtp_sent': False, 'smtp_error': str(e)})
    else:
        if hotel.imap_host and hotel.imap_login and hotel.imap_password:
            try:
                _save_draft_to_imap(hotel, correspondence, reply_text, to_email)
                return Response({'reply_text': reply_text, 'imap_saved': True})
            except Exception as e:
                return Response({'reply_text': reply_text, 'imap_saved': False, 'imap_error': str(e)})
        return Response({'reply_text': reply_text, 'imap_saved': False})


# --- Compose & send new message ---

@api_view(['POST'])
def send_message(request, hotel_pk, pk):
    """Compose and send a new outbound email to the guest via hotel SMTP."""
    import smtplib
    import email as email_lib
    import uuid
    from email.mime.text import MIMEText
    from datetime import datetime

    try:
        reservation = Reservation.objects.select_related('hotel').get(pk=pk, hotel_id=hotel_pk)
    except Reservation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    hotel = reservation.hotel
    to_email = request.data.get('to_email', '').strip()
    subject = request.data.get('subject', '').strip()
    body = request.data.get('body', '').strip()

    if not to_email or not subject or not body:
        return Response({'detail': 'Wypełnij adres e-mail, temat i treść.'}, status=status.HTTP_400_BAD_REQUEST)

    if not hotel.smtp_host or not hotel.smtp_login or not hotel.smtp_password:
        return Response({'detail': 'Hotel nie ma skonfigurowanego SMTP — skonfiguruj go w ustawieniach hotelu.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['From'] = hotel.email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg['Date'] = email_lib.utils.formatdate(localtime=True)
        msg['Message-ID'] = f'<sent-{uuid.uuid4()}@locus>'

        if hotel.smtp_ssl:
            server = smtplib.SMTP_SSL(hotel.smtp_host, hotel.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(hotel.smtp_host, hotel.smtp_port, timeout=30)
            server.starttls()

        server.login(hotel.smtp_login, hotel.smtp_password)
        server.sendmail(hotel.email, [to_email], msg.as_string())
        server.quit()

        # Save to correspondence history
        MailCorrespondence.objects.create(
            reservation=reservation,
            date=datetime.now(),
            subject=subject,
            body=body,
            message_id=msg['Message-ID'],
            sender_email=hotel.email,
        )

        return Response({'status': 'sent'})

    except smtplib.SMTPAuthenticationError as e:
        return Response({'detail': f'Błąd logowania SMTP: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        return Response({'detail': f'Błąd wysyłania: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(['POST'])
def generate_outbound_message(request, hotel_pk, pk):
    """Generate an AI draft for a new outbound message to the guest."""
    try:
        reservation = Reservation.objects.select_related('hotel', 'room').get(pk=pk, hotel_id=hotel_pk)
    except Reservation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    hotel = reservation.hotel
    assistant = AIAssistant.objects.prefetch_related('documents').filter(
        hotel=hotel, is_active=True
    ).first()

    if not assistant:
        return Response({'detail': 'Brak aktywnego asystenta AI dla tego hotelu.'}, status=status.HTTP_400_BAD_REQUEST)
    if not assistant.llm_api_key and not assistant.llm_model.startswith('ollama:'):
        return Response({'detail': 'Asystent AI nie ma skonfigurowanego klucza API.'}, status=status.HTTP_400_BAD_REQUEST)

    purpose = request.data.get('purpose', '').strip()

    docs_context = ''
    for doc in assistant.documents.all():
        docs_context += f'\n\n--- Dokument: {doc.name} ---\n{doc.content[:2000]}'

    system = (assistant.system_prompt or
              'Jesteś pomocnym asystentem hotelowym. Piszesz emaile do gości w imieniu hotelu. '
              'Bądź uprzejmy, profesjonalny i pomocny.')
    if docs_context:
        system += f'\n\nDodatkowe informacje o hotelu:\n{docs_context}'

    deposit_status = (
        f'wpłacona ({reservation.deposit_amount} zł)'
        if reservation.deposit_paid else 'nie wpłacona'
    )
    reservation_info = (
        f'Hotel: {hotel.name}\n'
        f'Gość: {reservation.guest_name}\n'
        f'Pokój: {reservation.room.number}\n'
        f'Przyjazd: {reservation.check_in}\n'
        f'Wyjazd: {reservation.check_out}\n'
        f'Liczba dni: {reservation.days_count}\n'
        f'Zaliczka: {deposit_status}\n'
        f'Kwota do zapłaty: {reservation.remaining_amount} zł\n'
    )

    user_message = (
        f'Napisz nową wiadomość email do gościa. Napisz tylko treść emaila, bez tematu.\n\n'
        f'Informacje o rezerwacji:\n{reservation_info}\n'
        + (f'Cel wiadomości: {purpose}\n' if purpose else 'Cel: ogólna informacja lub powitanie.\n')
    )

    try:
        draft = _call_llm_api(
            assistant.llm_model, assistant.llm_api_key, system, user_message,
            ollama_url=assistant.ollama_url or 'http://ollama:11434',
        )
        return Response({'draft': draft})
    except Exception as e:
        return Response({'detail': f'Błąd generowania: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)


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


# --- Room price calculation ---

@api_view(['GET'])
def calculate_room_price(request, hotel_pk, room_pk):
    """Return total price for a room stay based on monthly pricing."""
    from datetime import date as date_type, timedelta
    from decimal import Decimal

    check_in_str = request.query_params.get('check_in', '')
    check_out_str = request.query_params.get('check_out', '')
    if not check_in_str or not check_out_str:
        return Response({'detail': 'Wymagane parametry check_in i check_out.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        check_in = date_type.fromisoformat(check_in_str)
        check_out = date_type.fromisoformat(check_out_str)
    except ValueError:
        return Response({'detail': 'Nieprawidłowy format daty.'}, status=status.HTTP_400_BAD_REQUEST)

    if check_out <= check_in:
        return Response({'total': '0.00', 'breakdown': []})

    pricing = {p.month: p.price_per_night for p in RoomPricing.objects.filter(room_id=room_pk)}
    if not pricing:
        return Response({'total': '0.00', 'breakdown': []})

    # Sum per month
    monthly = {}
    current = check_in
    while current < check_out:
        m = current.month
        price = pricing.get(m, Decimal('0'))
        monthly[m] = monthly.get(m, Decimal('0')) + price
        current += timedelta(days=1)

    MONTH_NAMES = ['', 'Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru']
    breakdown = [
        {'month': m, 'month_name': MONTH_NAMES[m], 'amount': str(monthly[m])}
        for m in sorted(monthly)
    ]
    total = sum(monthly.values())
    return Response({'total': str(total), 'breakdown': breakdown})


# --- New inquiries search ---

@api_view(['POST'])
def search_inquiries(request, hotel_pk):
    """Search hotel IMAP inbox for emails from senders not linked to any existing reservation."""
    import email as email_lib
    from datetime import datetime, timedelta

    try:
        if request.user.is_admin:
            hotel = Hotel.objects.get(pk=hotel_pk, is_deleted=False)
        else:
            hotel = Hotel.objects.get(pk=hotel_pk, users=request.user, is_deleted=False)
    except Hotel.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not hotel.imap_host or not hotel.imap_login or not hotel.imap_password:
        return Response({'detail': 'Brak konfiguracji IMAP dla tego hotelu.'}, status=status.HTTP_400_BAD_REQUEST)

    # Build set of known sender emails from existing reservations
    known_emails = set()
    for addr in Reservation.objects.filter(
        hotel=hotel, is_deleted=False,
    ).exclude(contact_email='').values_list('contact_email', flat=True):
        known_emails.add(addr.lower())

    # Also ignore the hotel's own addresses (sent items landing in inbox)
    for addr in [hotel.email, hotel.imap_login]:
        if addr:
            known_emails.add(addr.lower())

    days_back = int(request.data.get('days_back', 30))

    try:
        if hotel.imap_ssl:
            mail = imaplib.IMAP4_SSL(hotel.imap_host, hotel.imap_port)
        else:
            mail = imaplib.IMAP4(hotel.imap_host, hotel.imap_port)

        mail.login(hotel.imap_login, hotel.imap_password)
        mail.select('INBOX', readonly=True)

        since_date = (datetime.now() - timedelta(days=days_back)).strftime('%d-%b-%Y')
        _, message_ids = mail.search(None, f'SINCE {since_date}')

        inquiries = []

        if message_ids[0]:
            for msg_id in message_ids[0].split():
                try:
                    _, header_data = mail.fetch(msg_id, '(BODY[HEADER.FIELDS (DATE FROM SUBJECT MESSAGE-ID)])')
                    header_msg = email_lib.message_from_bytes(header_data[0][1])

                    from_header = header_msg.get('From', '')
                    sender_email = extract_email_from_header(from_header)

                    if not sender_email or sender_email.lower() in known_emails:
                        continue

                    message_id_header = header_msg.get('Message-ID', f'<{msg_id.decode()}@local>')
                    subject = decode_mime_header(header_msg.get('Subject', ''))
                    date_str = header_msg.get('Date', '')

                    try:
                        msg_date = email_lib.utils.parsedate_to_datetime(date_str)
                    except Exception:
                        msg_date = datetime.now()

                    # Fetch full message for body preview
                    _, msg_data = mail.fetch(msg_id, '(RFC822)')
                    full_msg = email_lib.message_from_bytes(msg_data[0][1])
                    body = _get_message_body(full_msg)

                    from_name = re.sub(r'<.*?>', '', decode_mime_header(from_header)).strip().strip('"').strip("'")

                    inquiries.append({
                        'message_id': message_id_header,
                        'from_name': from_name or sender_email,
                        'from_email': sender_email,
                        'subject': subject,
                        'date': msg_date.isoformat() if hasattr(msg_date, 'isoformat') else str(msg_date),
                        'body_preview': body[:400].strip(),
                    })
                except Exception:
                    pass

        mail.logout()
        inquiries.sort(key=lambda x: x['date'], reverse=True)
        return Response(inquiries)

    except imaplib.IMAP4.error as e:
        return Response({'detail': f'Błąd IMAP: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'detail': f'Błąd połączenia: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


# --- Delete inquiry from IMAP ---

@api_view(['POST'])
def delete_inquiry(request, hotel_pk):
    """Mark an inquiry email as deleted in the IMAP inbox and expunge it."""
    try:
        if request.user.is_admin:
            hotel = Hotel.objects.get(pk=hotel_pk, is_deleted=False)
        else:
            hotel = Hotel.objects.get(pk=hotel_pk, users=request.user, is_deleted=False)
    except Hotel.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not hotel.imap_host or not hotel.imap_login or not hotel.imap_password:
        return Response({'detail': 'Brak konfiguracji IMAP dla tego hotelu.'}, status=status.HTTP_400_BAD_REQUEST)

    message_id = request.data.get('message_id', '').strip()
    if not message_id:
        return Response({'detail': 'Brak identyfikatora wiadomości.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        if hotel.imap_ssl:
            mail = imaplib.IMAP4_SSL(hotel.imap_host, hotel.imap_port)
        else:
            mail = imaplib.IMAP4(hotel.imap_host, hotel.imap_port)

        mail.login(hotel.imap_login, hotel.imap_password)
        mail.select('INBOX')

        _, result = mail.search(None, f'HEADER Message-ID "{message_id}"')

        if result[0]:
            for msg_uid in result[0].split():
                mail.store(msg_uid, '+FLAGS', '\\Deleted')
            mail.expunge()

        mail.logout()
        return Response({'status': 'deleted'})

    except imaplib.IMAP4.error as e:
        return Response({'detail': f'Błąd IMAP: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'detail': f'Błąd połączenia: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


# --- Standalone inquiry reply ---

@api_view(['POST'])
def send_inquiry_reply(request, hotel_pk):
    """Send a standalone email reply to an inquiry (no reservation required)."""
    import smtplib
    import email as email_lib
    import uuid
    from email.mime.text import MIMEText

    hotel = get_object_or_404(Hotel, pk=hotel_pk)
    to_email = request.data.get('to_email', '').strip()
    subject = request.data.get('subject', '').strip()
    body = request.data.get('body', '').strip()

    if not to_email or not subject or not body:
        return Response({'detail': 'Wypełnij adres e-mail, temat i treść.'}, status=status.HTTP_400_BAD_REQUEST)
    if not hotel.smtp_host or not hotel.smtp_login or not hotel.smtp_password:
        return Response({'detail': 'Hotel nie ma skonfigurowanego SMTP — skonfiguruj go w ustawieniach hotelu.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['From'] = hotel.email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg['Date'] = email_lib.utils.formatdate(localtime=True)
        msg['Message-ID'] = f'<inquiry-reply-{uuid.uuid4()}@locus>'

        if hotel.smtp_ssl:
            server = smtplib.SMTP_SSL(hotel.smtp_host, hotel.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(hotel.smtp_host, hotel.smtp_port, timeout=30)
            server.starttls()

        server.login(hotel.smtp_login, hotel.smtp_password)
        server.sendmail(hotel.email, [to_email], msg.as_string())
        server.quit()
        return Response({'status': 'sent'})

    except smtplib.SMTPAuthenticationError as e:
        return Response({'detail': f'Błąd logowania SMTP: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        return Response({'detail': f'Błąd wysyłania: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(['POST'])
def generate_inquiry_reply(request, hotel_pk):
    """Generate an AI draft reply to an inquiry (no reservation required)."""
    hotel = get_object_or_404(Hotel, pk=hotel_pk)
    assistant = AIAssistant.objects.prefetch_related('documents').filter(
        hotel=hotel, is_active=True
    ).first()

    if not assistant:
        return Response({'detail': 'Brak aktywnego asystenta AI dla tego hotelu.'}, status=status.HTTP_400_BAD_REQUEST)
    if not assistant.llm_api_key and not assistant.llm_model.startswith('ollama:'):
        return Response({'detail': 'Asystent AI nie ma skonfigurowanego klucza API.'}, status=status.HTTP_400_BAD_REQUEST)

    from_name = request.data.get('from_name', '').strip()
    from_email = request.data.get('from_email', '').strip()
    original_subject = request.data.get('subject', '').strip()
    original_body = request.data.get('body_preview', '').strip()
    purpose = request.data.get('purpose', '').strip()

    docs_context = ''
    for doc in assistant.documents.all():
        docs_context += f'\n\n--- Dokument: {doc.name} ---\n{doc.content[:2000]}'

    system = (assistant.system_prompt or
              'Jesteś pomocnym asystentem hotelowym. Piszesz emaile do gości w imieniu hotelu. '
              'Bądź uprzejmy, profesjonalny i pomocny.')
    if docs_context:
        system += f'\n\nDodatkowe informacje o hotelu:\n{docs_context}'

    user_message = (
        f'Napisz odpowiedź na poniższe zapytanie. Napisz tylko treść emaila, bez tematu.\n\n'
        f'Nadawca: {from_name} <{from_email}>\n'
        f'Temat: {original_subject}\n'
        f'Treść zapytania:\n{original_body}\n'
        + (f'\nWskazówki dotyczące odpowiedzi: {purpose}\n' if purpose else '')
    )

    try:
        draft = _call_llm_api(
            assistant.llm_model, assistant.llm_api_key, system, user_message,
            ollama_url=assistant.ollama_url or 'http://ollama:11434',
        )
        return Response({'draft': draft})
    except Exception as e:
        return Response({'detail': f'Błąd generowania: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)


# --- Calendar ---

@api_view(['GET'])
def revenue_by_year(request, hotel_pk):
    rows = (
        Reservation.objects
        .filter(hotel_id=hotel_pk, is_settled=True, is_deleted=False)
        .values(year=ExtractYear('check_in'))
        .annotate(total=Sum('remaining_amount'))
        .order_by('year')
    )
    return Response([{'year': r['year'], 'total': float(r['total'] or 0)} for r in rows])


@api_view(['GET'])
def archive_years(request, hotel_pk):
    current_year = timezone.now().year
    years = (
        Reservation.objects
        .filter(hotel_id=hotel_pk, is_settled=True, is_deleted=False, check_in__year__lt=current_year)
        .values_list('check_in__year', flat=True)
        .distinct()
        .order_by('-check_in__year')
    )
    return Response(list(years))


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


# --- SMTP test (standalone) ---

@api_view(['POST'])
def test_smtp_standalone(request):
    import smtplib
    host = request.data.get('smtp_host', '')
    port = int(request.data.get('smtp_port', 587))
    ssl = request.data.get('smtp_ssl', False)
    login = request.data.get('smtp_login', '')
    password = request.data.get('smtp_password', '')

    if not host or not login or not password:
        return Response({'status': 'error', 'message': 'Wypełnij host, login i hasło SMTP.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        if ssl:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()
        server.login(login, password)
        server.quit()
        return Response({'status': 'ok', 'message': 'Połączenie SMTP OK.'})
    except smtplib.SMTPAuthenticationError as e:
        return Response({'status': 'error', 'message': f'Błąd logowania SMTP ({login}@{host}:{port}): {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'status': 'error', 'message': f'Błąd połączenia SMTP ({host}:{port}): {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


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
