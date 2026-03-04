# Szybki start — Locus

## Wymagania

- [Docker](https://docs.docker.com/engine/install/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+ (plugin `docker compose`, nie stary `docker-compose`)
- Wolny port **8088** na hoście

## 1. Pobierz repozytorium

```bash
git clone <url-repozytorium> locus
cd locus
```

## 2. Skonfiguruj zmienne środowiskowe

```bash
cp .env.example .env
```

Otwórz `.env` i ustaw co najmniej:

| Zmienna | Opis | Przykład |
|---------|------|---------|
| `DJANGO_SECRET_KEY` | Losowy klucz Django | `openssl rand -hex 50` |
| `ADMIN_USERNAME` | Login pierwszego administratora | `admin` |
| `ADMIN_PASSWORD` | Hasło administratora | `zmień_to_hasło` |
| `POSTGRES_PASSWORD` | Hasło bazy danych | `mocne_haslo_db` |
| `DJANGO_ALLOWED_HOSTS` | Dozwolone hosty/IP (domyślnie `*`) | `ip-serwera,moja-domena.pl` |
| `OPENWEATHER_API_KEY` | Klucz API do widgetu pogody (opcjonalny) | — |

Pozostałe zmienne mają sensowne wartości domyślne i nie wymagają zmian przy instalacji lokalnej.

> **Instalacja na serwerze:** ustaw `DJANGO_ALLOWED_HOSTS` na publiczny adres IP lub domenę serwera, np. `DJANGO_ALLOWED_HOSTS=46.242.128.121`. Możesz podać wiele wartości oddzielonych przecinkiem. Domyślna wartość `*` zezwala na wszystkie hosty.

## 3. Uruchom aplikację

```bash
docker compose up -d
```

Docker pobierze obrazy, zbuduje kontenery i uruchomi wszystkie usługi:

| Kontener | Rola |
|----------|------|
| `locus_db` | PostgreSQL 15 |
| `locus_redis` | Redis 7 (cache i kolejka Celery) |
| `locus_backend` | Django + DRF (API) |
| `locus_worker` | Celery worker (zadania IMAP) |
| `locus_beat` | Celery beat (harmonogram) |
| `locus_frontend` | React (Vite dev server) |
| `locus_nginx` | Nginx — reverse proxy, port 8088 |
| `locus_ollama` | Ollama — lokalny serwer LLM |
| `locus_ollama_init` | Jednorazowe pobranie modelu llama3.2 |

> **Pierwsze uruchomienie trwa dłużej** — Ollama pobiera model llama3.2 (~2 GB). Możesz śledzić postęp: `docker compose logs -f ollama-init`

## 4. Otwórz aplikację

Po tym jak wszystkie kontenery będą zdrowe (zazwyczaj 1–3 min):

```
http://localhost:8088
```

Zaloguj się danymi z `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

## 5. Konfiguracja hotelu

### IMAP (odbieranie poczty)
1. Przejdź do **Hotele** → **dodaj hotel** lub edytuj istniejący
2. Wypełnij sekcję **Poczta (IMAP)**: host, port (993), login, hasło
3. Kliknij **Testuj połączenie IMAP** — powinno pojawić się potwierdzenie

### SMTP (wysyłanie poczty)
1. W formularzu hotelu wypełnij sekcję **Poczta (SMTP)**: host, port (587 dla STARTTLS lub 465 dla SSL), login, hasło
2. Kliknij **Testuj połączenie SMTP**

## 6. Konfiguracja Asystenta AI

### Opcja A — Ollama (lokalny, bezpłatny, działa offline)

1. Wejdź w szczegóły hotelu → kafelek **Asystent AI**
2. Kliknij **Dodaj asystenta AI**
3. Wybierz model z grupy **Ollama (lokalny)** np. `ollama:llama3.2`
4. URL serwera Ollama: `http://ollama:11434` (wartość domyślna — nie zmieniaj przy instalacji Docker)
5. Kliknij ikonę odświeżania obok listy modeli, żeby pobrać aktualną listę zainstalowanych modeli
6. Wpisz prompt systemowy opisujący hotel i styl komunikacji
7. Opcjonalnie wgraj dokumenty (regulamin, cennik, FAQ) jako pliki TXT/MD/PDF/DOCX

### Opcja B — OpenAI

1. Utwórz klucz API na [platform.openai.com](https://platform.openai.com)
2. W konfiguracji asystenta wybierz model z grupy **OpenAI** (np. `gpt-4o-mini`)
3. Wpisz klucz API

### Opcja C — Anthropic / Google Gemini

Analogicznie — wybierz model z odpowiedniej grupy i podaj klucz API.

## 7. Generowanie odpowiedzi AI na e-maile

1. Otwórz rezerwację → zakładka **Historia korespondencji**
2. Przy każdej wiadomości kliknij ikonę **odpowiedz** (strzałka)
3. Wybierz tryb: **Wyślij emailem (SMTP)** lub **Zapisz do roboczych (IMAP)**
4. Kliknij **Generuj i wyślij** / **Generuj i zapisz**

AI odczyta kontekst rezerwacji i korespondencji, wygeneruje odpowiedź i — zależnie od trybu — wyśle ją lub zapisze jako szkic.

## Typowe problemy

### Aplikacja nie ładuje się po `docker compose up -d`

Sprawdź logi:
```bash
docker compose logs -f backend
docker compose logs -f nginx
```

Backend musi ukończyć migracje (`python manage.py migrate`) zanim nginx zacznie obsługiwać ruch.

### Ollama nie widzi wgranych modeli

```bash
# Sprawdź listę modeli w kontenerze Ollama
docker compose exec ollama ollama list

# Ręczne pobranie dodatkowego modelu
docker compose exec ollama ollama pull mistral
```

### Zmiany w pliku `.env` nie są widoczne

Zmiany w `env_file` wymagają pełnego restartu:
```bash
docker compose down && docker compose up -d
```

### Przebudowanie po aktualizacji kodu

```bash
docker compose up --build -d
```

### Logi w czasie rzeczywistym

```bash
docker compose logs -f backend worker beat
```

## Zatrzymanie i usunięcie danych

```bash
# Zatrzymaj (zachowuje dane)
docker compose down

# Zatrzymaj i usuń wszystkie dane (baza, Redis, modele Ollama)
docker compose down -v
```

## Zmiana hasła użytkownika admin

**Opcja 1 — management command (zalecana):**
```bash
docker compose exec backend python manage.py changepassword admin
```

**Opcja 2 — Django shell:**
```bash
docker compose exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
u = get_user_model().objects.get(username='admin')
u.set_password('nowe_haslo')
u.save()
"
```

**Opcja 3 — panel admina:**

Wejdź na `http://localhost:8088/admin/` → **Users** → **admin** → zmień hasło.

### Błąd logowania: „Invalid HTTP_HOST header" / Bad Request 400

Backend zwraca błąd 400 przy próbie logowania, a w logach widać:
```
Invalid HTTP_HOST header: '1.2.3.4'. You may need to add '1.2.3.4' to ALLOWED_HOSTS.
```

Adres IP lub domena serwera nie jest na liście dozwolonych hostów Django. Otwórz `.env` i dodaj:

```
DJANGO_ALLOWED_HOSTS=1.2.3.4,mójdomain.pl
```

Następnie pełny restart (zmiana `.env` wymaga `down` + `up`):
```bash
docker compose down && docker compose up -d
```

---

### Błąd migracji: „NodeNotFoundError — dependencies reference nonexistent parent node"

```
NodeNotFoundError: Migration hotels.0009_room_pricing dependencies reference nonexistent parent node ('hotels', '0008_reservation_has_new_mail')
```

Brakuje pliku migracji w katalogu `backend/hotels/migrations/`. Upewnij się, że klonujesz repozytorium w całości i nie brakuje żadnego pliku migracji. Sprawdź:

```bash
ls backend/hotels/migrations/
```

Powinny być wszystkie pliki od `0001_initial.py` do ostatniego kolejno po sobie. Jeśli brakuje któregoś — pobierz go z repozytorium (`git pull`) i zrestartuj backend:

```bash
docker compose restart backend
```

---

### Błąd migracji: „Conflicting migrations detected"

Pojawia się gdy nowa migracja z repozytorium ma ten sam numer co migracja już istniejąca w kontenerze (np. dwie migracje `0004_*`).

**Rozwiązanie:** usuń duplikat i zrestartuj backend:

```bash
# Sprawdź które migracje kolidują (np. 0004_room_pricing i 0004_ai_assistant)
ls /root/docker/locus/backend/hotels/migrations/

# Usuń plik który NIE jest w repozytorium (pozostaw ten z repo)
rm /root/docker/locus/backend/hotels/migrations/0004_room_pricing.py   # przykład

docker compose restart backend
```

> Jeśli nie wiadomo który plik usunąć, sprawdź zawartość repozytorium lub uruchom:
> ```bash
> docker compose exec backend python manage.py showmigrations hotels
> ```
