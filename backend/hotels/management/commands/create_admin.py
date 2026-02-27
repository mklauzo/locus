import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create initial admin user if no users exist'

    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write('Users already exist, skipping admin creation.')
            return

        username = os.environ.get('ADMIN_USERNAME', 'admin')
        password = os.environ.get('ADMIN_PASSWORD', 'admin123')
        email = os.environ.get('ADMIN_EMAIL', 'admin@locus.local')

        User.objects.create_superuser(
            username=username,
            password=password,
            email=email,
            role='ADMIN',
        )
        self.stdout.write(self.style.SUCCESS(f'Admin user "{username}" created.'))
