import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'locus.settings')

app = Celery('locus')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Europe/Warsaw',
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    beat_schedule={
        'poll-all-hotels-mail-every-5-minutes': {
            'task': 'hotels.tasks.poll_all_hotels_mail',
            'schedule': 300.0,
        },
    },
)
