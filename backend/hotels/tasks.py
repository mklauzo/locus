import re
import imaplib
import email
from email.header import decode_header
from datetime import datetime, timedelta
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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def search_mail_for_reservation(self, reservation_id, search_term):
    from hotels.models import Reservation, MailCorrespondence, Hotel

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

        def process_message(msg_id):
            """Fetch and process a single message. Returns (sender_email, phone) or None if skipped."""
            nonlocal found_email, found_phone

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

            # Extract contact info
            if not found_email and sender_email and sender_email.lower() != hotel.email.lower():
                found_email = sender_email
            if not found_phone:
                found_phone = extract_phone_from_text(body)

            return sender_email

        # Phase 1: Search by name/term in subject and body
        _, message_ids = mail.search(None, f'(SINCE {since_date} OR SUBJECT "{search_term}" BODY "{search_term}")')

        sender_emails = set()
        for msg_id in message_ids[0].split():
            result = process_message(msg_id)
            if result and result.lower() != hotel.email.lower():
                sender_emails.add(result.lower())

        # Phase 2: Search by discovered sender email addresses
        # Also search by contact_email if already set on reservation
        if reservation.contact_email:
            sender_emails.add(reservation.contact_email.lower())

        for sender_addr in sender_emails:
            _, email_msg_ids = mail.search(None, f'(SINCE {since_date} FROM "{sender_addr}")')
            for msg_id in email_msg_ids[0].split():
                process_message(msg_id)

        mail.logout()

        # Update reservation contact info if found and not already set
        update_fields = []
        if found_email and not reservation.contact_email:
            reservation.contact_email = found_email
            update_fields.append('contact_email')
        if found_phone and not reservation.contact_phone:
            reservation.contact_phone = found_phone
            update_fields.append('contact_phone')
        if update_fields:
            reservation.save(update_fields=update_fields)

    except Exception as exc:
        self.retry(exc=exc)
