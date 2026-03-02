import re
import imaplib
import email
from email.header import decode_header
from datetime import datetime, timedelta, timezone as dt_timezone
from celery import shared_task


def decode_mime_header(header):
    parts = decode_header(header or '')
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or 'utf-8', errors='replace'))
        else:
            decoded.append(part)
    return ' '.join(decoded)


def extract_email_from_header(from_header):
    """Extract email address from the From header (e.g. 'Jan Kowalski <jan@example.com>')."""
    decoded = decode_mime_header(from_header)
    match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', decoded)
    return match.group(0) if match else ''


def extract_phone_from_text(text):
    """Extract phone number from email body. Handles Polish formats like +48 123 456 789, 123-456-789, etc."""
    patterns = [
        r'\+48[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}',
        r'\+48[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}',
        r'(?<!\d)\d{3}[\s.-]\d{3}[\s.-]\d{3}(?!\d)',
        r'(?<!\d)\d{2}[\s.-]\d{3}[\s.-]\d{2}[\s.-]\d{2}(?!\d)',
        r'(?<!\d)\d{9}(?!\d)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0).strip()
    return ''


def _get_message_body(msg):
    """Extract plain text body from an email.Message object."""
    body = ''
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == 'text/plain':
                payload = part.get_payload(decode=True)
                if payload:
                    body = payload.decode(part.get_content_charset() or 'utf-8', errors='replace')
                    break
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            body = payload.decode(msg.get_content_charset() or 'utf-8', errors='replace')
    return body


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def search_mail_for_reservation(self, reservation_id, search_term):
    from hotels.models import Reservation, MailCorrespondence

    try:
        reservation = Reservation.objects.select_related('hotel').get(id=reservation_id)
    except Reservation.DoesNotExist:
        return

    hotel = reservation.hotel
    if not hotel.imap_host or not hotel.imap_login:
        return

    try:
        if hotel.imap_ssl:
            mail = imaplib.IMAP4_SSL(hotel.imap_host, hotel.imap_port)
        else:
            mail = imaplib.IMAP4(hotel.imap_host, hotel.imap_port)

        mail.login(hotel.imap_login, hotel.imap_password)
        mail.select('INBOX', readonly=True)

        # Search last 12 months
        since_date = (datetime.now() - timedelta(days=365)).strftime('%d-%b-%Y')

        existing_ids = set(
            MailCorrespondence.objects.filter(reservation=reservation).values_list('message_id', flat=True)
        )

        found_email = ''
        found_phone = ''
        new_count = 0

        def process_message(msg_id):
            """Fetch and process a single message. Returns (sender_email, phone) or None if skipped."""
            nonlocal found_email, found_phone, new_count

            _, msg_data = mail.fetch(msg_id, '(RFC822)')
            msg = email.message_from_bytes(msg_data[0][1])

            message_id_header = msg.get('Message-ID', f'<{msg_id.decode()}@{hotel.imap_host}>')
            if message_id_header in existing_ids:
                return None

            subject = decode_mime_header(msg.get('Subject', ''))
            date_str = msg.get('Date', '')
            try:
                msg_date = email.utils.parsedate_to_datetime(date_str)
            except Exception:
                msg_date = datetime.now()

            body = _get_message_body(msg)

            from_header = msg.get('From', '')
            sender_email = extract_email_from_header(from_header)

            MailCorrespondence.objects.create(
                reservation=reservation,
                date=msg_date,
                subject=subject,
                body=body,
                message_id=message_id_header,
                sender_email=sender_email,
            )
            existing_ids.add(message_id_header)
            new_count += 1

            # Extract contact info
            if not found_email and sender_email and sender_email.lower() != hotel.email.lower():
                found_email = sender_email
            if not found_phone:
                found_phone = extract_phone_from_text(body)

            return sender_email

        # Phase 1: Search by name/term in subject and body
        _, message_ids = mail.search(None, f'SINCE {since_date} OR SUBJECT "{search_term}" BODY "{search_term}"')

        sender_emails = set()
        for msg_id in message_ids[0].split():
            try:
                result = process_message(msg_id)
                if result and result.lower() != hotel.email.lower():
                    sender_emails.add(result.lower())
            except Exception:
                pass

        # Phase 2: Search by discovered sender email addresses
        # Also search by contact_email if already set on reservation
        if reservation.contact_email:
            sender_emails.add(reservation.contact_email.lower())

        for sender_addr in sender_emails:
            _, email_msg_ids = mail.search(None, f'SINCE {since_date} FROM "{sender_addr}"')
            for msg_id in email_msg_ids[0].split():
                try:
                    process_message(msg_id)
                except Exception:
                    pass

        mail.logout()

        # Update reservation contact info and new mail flag
        update_fields = []
        if found_email and not reservation.contact_email:
            reservation.contact_email = found_email
            update_fields.append('contact_email')
        if found_phone and not reservation.contact_phone:
            reservation.contact_phone = found_phone
            update_fields.append('contact_phone')
        if new_count > 0 and not reservation.has_new_mail:
            reservation.has_new_mail = True
            update_fields.append('has_new_mail')
        if update_fields:
            reservation.save(update_fields=update_fields)

    except Exception as exc:
        self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def poll_hotel_mail(self, hotel_id):
    """Check a hotel's IMAP inbox for new emails and match them to reservations by sender address."""
    from hotels.models import Hotel, Reservation, MailCorrespondence

    try:
        hotel = Hotel.objects.get(id=hotel_id, is_deleted=False)
    except Hotel.DoesNotExist:
        return

    if not hotel.imap_host or not hotel.imap_login or not hotel.imap_password:
        return

    try:
        if hotel.imap_ssl:
            mail = imaplib.IMAP4_SSL(hotel.imap_host, hotel.imap_port)
        else:
            mail = imaplib.IMAP4(hotel.imap_host, hotel.imap_port)

        mail.login(hotel.imap_login, hotel.imap_password)
        mail.select('INBOX', readonly=True)

        # IMAP SINCE only supports day precision — search last 2 days, filter by time in Python
        since_date = (datetime.now() - timedelta(days=2)).strftime('%d-%b-%Y')
        _, message_ids = mail.search(None, f'SINCE {since_date}')

        if not message_ids[0]:
            mail.logout()
            return

        # Build sender-email → reservation map for active reservations of this hotel
        cutoff_date = datetime.now().date() - timedelta(days=60)
        reservations = Reservation.objects.filter(
            hotel=hotel,
            is_deleted=False,
            check_out__gte=cutoff_date,
        )
        email_to_res = {}
        for res in reservations:
            if res.contact_email:
                email_to_res[res.contact_email.lower()] = res

        if not email_to_res:
            mail.logout()
            return

        # Already-known message IDs for this hotel (avoid duplicates)
        existing_ids = set(
            MailCorrespondence.objects.filter(
                reservation__hotel=hotel
            ).values_list('message_id', flat=True)
        )

        # Only process emails from the last 10 minutes
        recent_cutoff = datetime.now(tz=dt_timezone.utc) - timedelta(minutes=10)

        updated_reservations = {}

        for msg_id in message_ids[0].split():
            try:
                # Fetch only headers first (faster than full RFC822)
                _, header_data = mail.fetch(msg_id, '(BODY[HEADER.FIELDS (DATE FROM MESSAGE-ID)])')
                header_msg = email.message_from_bytes(header_data[0][1])

                message_id_header = header_msg.get('Message-ID', f'<{msg_id.decode()}@{hotel.imap_host}>')
                if message_id_header in existing_ids:
                    continue

                # Parse date — skip emails older than 10 minutes
                date_str = header_msg.get('Date', '')
                try:
                    msg_date = email.utils.parsedate_to_datetime(date_str)
                    if msg_date.tzinfo is None:
                        msg_date = msg_date.replace(tzinfo=dt_timezone.utc)
                except Exception:
                    continue

                if msg_date < recent_cutoff:
                    continue

                # Match to reservation by sender email
                from_header = header_msg.get('From', '')
                sender_email = extract_email_from_header(from_header)
                if not sender_email:
                    continue

                reservation = email_to_res.get(sender_email.lower())
                if not reservation:
                    continue

                # Fetch full message body
                _, msg_data = mail.fetch(msg_id, '(RFC822)')
                full_msg = email.message_from_bytes(msg_data[0][1])

                subject = decode_mime_header(full_msg.get('Subject', ''))
                body = _get_message_body(full_msg)

                MailCorrespondence.objects.create(
                    reservation=reservation,
                    date=msg_date,
                    subject=subject,
                    body=body,
                    message_id=message_id_header,
                    sender_email=sender_email,
                )
                existing_ids.add(message_id_header)
                updated_reservations[reservation.id] = reservation

            except Exception:
                pass

        mail.logout()

        # Mark reservations that received new mail
        for reservation in updated_reservations.values():
            if not reservation.has_new_mail:
                reservation.has_new_mail = True
                reservation.save(update_fields=['has_new_mail'])

    except Exception as exc:
        self.retry(exc=exc)


@shared_task
def poll_all_hotels_mail():
    """Dispatch poll_hotel_mail for every hotel that has IMAP configured."""
    from hotels.models import Hotel

    hotel_ids = Hotel.objects.filter(
        is_deleted=False,
    ).exclude(imap_host='').exclude(imap_login='').values_list('id', flat=True)

    for hotel_id in hotel_ids:
        poll_hotel_mail.delay(hotel_id)


def _call_llm_api(llm_model, api_key, system_prompt, user_message, ollama_url='http://ollama:11434'):
    """Call LLM API (OpenAI, Anthropic, Google Gemini or Ollama) and return generated text."""
    import urllib.request
    import urllib.error
    import json as json_lib

    if llm_model.startswith('claude'):
        url = 'https://api.anthropic.com/v1/messages'
        headers = {
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        }
        payload = {
            'model': llm_model,
            'max_tokens': 1024,
            'system': system_prompt,
            'messages': [{'role': 'user', 'content': user_message}],
        }
    elif llm_model.startswith('gemini'):
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{llm_model}:generateContent?key={api_key}'
        headers = {'Content-Type': 'application/json'}
        full_message = f'{system_prompt}\n\n{user_message}' if system_prompt else user_message
        payload = {
            'contents': [{'role': 'user', 'parts': [{'text': full_message}]}],
            'generationConfig': {'maxOutputTokens': 4096},
        }
    elif llm_model.startswith('ollama:'):
        actual_model = llm_model[len('ollama:'):]
        base_url = (ollama_url or 'http://ollama:11434').rstrip('/')
        url = f'{base_url}/api/chat'
        headers = {'Content-Type': 'application/json'}
        messages = []
        if system_prompt:
            messages.append({'role': 'system', 'content': system_prompt})
        messages.append({'role': 'user', 'content': user_message})
        payload = {'model': actual_model, 'messages': messages, 'stream': False}
    else:
        url = 'https://api.openai.com/v1/chat/completions'
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }
        payload = {
            'model': llm_model,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message},
            ],
            'max_tokens': 1024,
        }

    req = urllib.request.Request(
        url,
        data=json_lib.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            result = json_lib.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        raise Exception(f'Błąd API ({e.code}) [{url}]: {error_body[:500]}')
    except Exception as e:
        raise Exception(f'Błąd połączenia z {url}: {str(e)}')

    if llm_model.startswith('claude'):
        return result['content'][0]['text']
    if llm_model.startswith('gemini'):
        candidates = result.get('candidates') or []
        if not candidates:
            prompt_feedback = result.get('promptFeedback', {})
            block_reason = prompt_feedback.get('blockReason', 'brak kandydatów w odpowiedzi')
            raise Exception(f'Gemini nie zwrócił odpowiedzi: {block_reason}')
        candidate = candidates[0]
        content = candidate.get('content') or {}
        parts = content.get('parts') or []
        if parts:
            return parts[0].get('text', '')
        finish_reason = candidate.get('finishReason', 'nieznany powód')
        raise Exception(f'Gemini zwrócił pustą odpowiedź (finishReason: {finish_reason})')
    if llm_model.startswith('ollama:'):
        return result['message']['content']
    return result['choices'][0]['message']['content']


def _build_confirmation_template(reservation, hotel):
    """Fallback plain-text confirmation when no AI assistant is configured."""
    deposit_line = (
        f'Zaliczka: {reservation.deposit_amount} zł'
        + (f' (wpłacona dnia {reservation.deposit_date})' if reservation.deposit_date else '')
    )
    return (
        f'Szanowny/a {reservation.guest_name},\n\n'
        f'Potwierdzamy przyjęcie zaliczki i rejestrację Państwa rezerwacji w {hotel.name}.\n\n'
        f'Szczegóły rezerwacji:\n'
        f'  Pokój: {reservation.room.number}\n'
        f'  Przyjazd: {reservation.check_in}\n'
        f'  Wyjazd: {reservation.check_out}\n'
        f'  Liczba dni: {reservation.days_count}\n'
        f'  {deposit_line}\n'
        f'  Pozostała kwota do zapłaty: '
        f'{float(reservation.remaining_amount) - float(reservation.deposit_amount):.2f} zł\n\n'
        f'W razie pytań prosimy o kontakt.\n\n'
        f'Z poważaniem,\n{hotel.name}'
    )


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_deposit_confirmation(self, reservation_id):
    """Generate and send a reservation confirmation email after deposit is recorded."""
    import smtplib
    import email as email_lib
    from email.mime.text import MIMEText
    from hotels.models import Reservation, AIAssistant

    try:
        reservation = Reservation.objects.select_related('hotel', 'room').get(id=reservation_id)
    except Reservation.DoesNotExist:
        return

    hotel = reservation.hotel
    to_email = reservation.contact_email
    if not to_email:
        return
    if not hotel.smtp_host or not hotel.smtp_login or not hotel.smtp_password:
        return

    # Try AI-generated confirmation
    body = None
    assistant = AIAssistant.objects.prefetch_related('documents').filter(
        hotel=hotel, is_active=True,
    ).first()

    if assistant and (assistant.llm_api_key or assistant.llm_model.startswith('ollama:')):
        docs_context = ''
        for doc in assistant.documents.all():
            docs_context += f'\n\n--- Dokument: {doc.name} ---\n{doc.content[:2000]}'

        system = (assistant.system_prompt or
                  'Jesteś pomocnym asystentem hotelowym. Piszesz emaile do gości w imieniu hotelu. '
                  'Bądź uprzejmy, profesjonalny i pomocny.')
        if docs_context:
            system += f'\n\nDodatkowe informacje o hotelu:\n{docs_context}'

        deposit_line = (
            f'{reservation.deposit_amount} zł'
            + (f', wpłacona dnia {reservation.deposit_date}' if reservation.deposit_date else '')
        )
        remaining = float(reservation.remaining_amount) - float(reservation.deposit_amount)

        user_message = (
            f'Napisz email z potwierdzeniem rezerwacji do gościa. Napisz tylko treść emaila bez tematu.\n\n'
            f'Dane rezerwacji:\n'
            f'Hotel: {hotel.name}\n'
            f'Gość: {reservation.guest_name}\n'
            f'Pokój: {reservation.room.number}\n'
            f'Przyjazd: {reservation.check_in}\n'
            f'Wyjazd: {reservation.check_out}\n'
            f'Liczba dni: {reservation.days_count}\n'
            f'Zaliczka: {deposit_line}\n'
            f'Pozostała kwota do zapłaty: {remaining:.2f} zł\n'
        )
        try:
            body = _call_llm_api(
                assistant.llm_model, assistant.llm_api_key, system, user_message,
                ollama_url=assistant.ollama_url or 'http://ollama:11434',
            )
        except Exception as e:
            print(f'[CONFIRMATION LLM ERROR] reservation={reservation_id}: {e}', flush=True)

    if not body:
        body = _build_confirmation_template(reservation, hotel)

    # Send via SMTP
    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['From'] = hotel.email
        msg['To'] = to_email
        msg['Subject'] = f'Potwierdzenie rezerwacji – {hotel.name}'
        msg['Date'] = email_lib.utils.formatdate(localtime=True)

        if hotel.smtp_ssl:
            server = smtplib.SMTP_SSL(hotel.smtp_host, hotel.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(hotel.smtp_host, hotel.smtp_port, timeout=30)
            server.starttls()

        server.login(hotel.smtp_login, hotel.smtp_password)
        server.sendmail(hotel.email, [to_email], msg.as_string())
        server.quit()
        print(f'[CONFIRMATION SENT] reservation={reservation_id} → {to_email}', flush=True)
    except Exception as exc:
        self.retry(exc=exc)
