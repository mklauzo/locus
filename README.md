# Locus

System zarządzania rezerwacjami hotelowymi z integracją poczty e-mail i asystentem AI.

## Do czego służy Locus?

Locus to wielodostępna aplikacja webowa przeznaczona dla hoteli i obiektów noclegowych. Umożliwia kompleksowe zarządzanie rezerwacjami, pokojami i korespondencją z gośćmi — z poziomu przeglądarki, bez instalacji dodatkowego oprogramowania.

## Funkcje

### Zarządzanie rezerwacjami
- Tworzenie, edytowanie i usuwanie rezerwacji (miękkie usuwanie)
- Dane gościa: imię, nazwisko, liczba towarzyszących, zwierzęta
- Śledzenie wpłat: zaliczka (kwota, data, status), pozostała kwota
- Notatki, kontaktowy e-mail i telefon
- Oznaczanie rezerwacji jako rozliczone
- Dziennik zmian (audit log) — historia edycji każdej rezerwacji

### Zarządzanie pokojami i hotelami
- Wiele hoteli w jednej instalacji (multi-tenant)
- Pokoje z numerem i pojemnością, walidacja dostępności przy rezerwacji
- Widok kalendarza — zajętość pokoi w wybranym miesiącu

### Integracja e-mail (IMAP)
- Automatyczne pobieranie wiadomości powiązanych z rezerwacją (po nazwisku gościa)
- Historia korespondencji przy każdej rezerwacji
- Zapis szkiców odpowiedzi do folderu Robocze (Drafts) na skrzynce IMAP

### Wysyłanie e-maili (SMTP)
- Bezpośrednie wysyłanie odpowiedzi ze skonfigurowanej skrzynki hotelowej
- Obsługa SSL (port 465) i STARTTLS (port 587)
- Test połączenia SMTP z poziomu ustawień hotelu

### Asystent AI
- Konfigurowalny asystent dla każdego hotelu z własnym promptem systemowym
- Obsługiwane modele LLM:
  - **OpenAI**: GPT-4o, GPT-4o mini, GPT-4 Turbo, o1, o3 i inne
  - **Anthropic**: Claude 3.5 Sonnet/Haiku, Claude 3 Opus
  - **Google Gemini**: Gemini 1.5 Pro/Flash, Gemini 2.0 Flash
  - **Ollama** (lokalny, bez opłat): llama3.2, mistral, phi3 i inne — działa offline
- Baza wiedzy: wgrywanie dokumentów (TXT, MD, PDF, DOCX), treść dołączana do kontekstu AI
- Generowanie odpowiedzi na e-maile: jedno kliknięcie przy wiadomości → AI pisze odpowiedź → zapis do Roboczych lub wysyłka przez SMTP
- Odświeżanie listy dostępnych modeli bezpośrednio z panelu konfiguracji

### Użytkownicy i uprawnienia
- Role: Administrator (pełny dostęp) i Użytkownik (dostęp do przypisanych hoteli)
- Blokowanie i usuwanie kont użytkowników
- Zmiana hasła, wybór motywu (jasny/ciemny) per użytkownik

### Inne
- Widget pogody w pasku nawigacji (OpenWeather API)
- Polska lokalizacja, strefa czasowa Europe/Warsaw
- Responsywny interfejs oparty na Material-UI

## Stos technologiczny

| Warstwa | Technologie |
|---------|------------|
| Backend | Python 3.12, Django 5.1, Django REST Framework, Celery 5.4 |
| Baza danych | PostgreSQL 15 |
| Cache / kolejka | Redis 7 |
| Frontend | React 18, TypeScript 5.5, Vite 5, Material-UI v6 |
| LLM lokalny | Ollama |
| Infrastruktura | Docker Compose, Nginx |

## Szybki start

Zobacz [quick_start.md](quick_start.md) po pełną instrukcję instalacji.

## Licencja

Projekt prywatny.
