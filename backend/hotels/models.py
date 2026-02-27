from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrator'
        USER = 'USER', 'User'

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.USER)
    is_trashed = models.BooleanField(default=False)
    is_blocked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    class Meta:
        db_table = 'users'


class Hotel(models.Model):
    name = models.CharField(max_length=255)
    address = models.TextField()
    email = models.EmailField()
    imap_host = models.CharField(max_length=255, blank=True)
    imap_port = models.IntegerField(default=993)
    imap_ssl = models.BooleanField(default=True)
    imap_login = models.CharField(max_length=255, blank=True)
    imap_password = models.CharField(max_length=255, blank=True)
    smtp_host = models.CharField(max_length=255, blank=True)
    smtp_port = models.IntegerField(default=587)
    smtp_ssl = models.BooleanField(default=False)
    smtp_login = models.CharField(max_length=255, blank=True)
    smtp_password = models.CharField(max_length=255, blank=True)
    users = models.ManyToManyField(User, related_name='hotels', blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_hotels')
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'hotels'


class Room(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='rooms')
    number = models.CharField(max_length=20)
    capacity = models.IntegerField(validators=[MinValueValidator(1)])
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.hotel.name} - {self.number}"

    class Meta:
        db_table = 'rooms'
        unique_together = ['hotel', 'number']


class Reservation(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='reservations')
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='reservations')
    guest_first_name = models.CharField(max_length=127)
    guest_last_name = models.CharField(max_length=127)
    companions = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    animals = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    check_in = models.DateField()
    check_out = models.DateField()
    deposit_paid = models.BooleanField(default=False)
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deposit_date = models.DateField(null=True, blank=True)
    remaining_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    is_settled = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    edited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='edited_reservations')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def guest_name(self):
        return f"{self.guest_last_name} {self.guest_first_name}".strip()

    @property
    def days_count(self):
        if self.check_in and self.check_out:
            return (self.check_out - self.check_in).days
        return 0

    def __str__(self):
        return f"{self.guest_name} @ {self.room} ({self.check_in} - {self.check_out})"

    class Meta:
        db_table = 'reservations'
        indexes = [
            models.Index(fields=['hotel', 'check_in', 'check_out']),
        ]


class MailCorrespondence(models.Model):
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='correspondence')
    date = models.DateTimeField()
    subject = models.CharField(max_length=500)
    body = models.TextField()
    message_id = models.CharField(max_length=500, unique=True)
    sender_email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.subject} ({self.date})"

    class Meta:
        db_table = 'mail_correspondence'
        ordering = ['-date']


class AIAssistant(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='ai_assistants')
    name = models.CharField(max_length=255)
    llm_model = models.CharField(max_length=100, default='gpt-4o-mini')
    llm_api_key = models.CharField(max_length=500, blank=True)
    ollama_url = models.CharField(max_length=500, blank=True, default='http://ollama:11434')
    system_prompt = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.hotel.name})"

    class Meta:
        db_table = 'ai_assistants'


class AIAssistantDocument(models.Model):
    assistant = models.ForeignKey(AIAssistant, on_delete=models.CASCADE, related_name='documents')
    name = models.CharField(max_length=255)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'ai_assistant_documents'
        ordering = ['name']


class AuditLog(models.Model):
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='audit_logs')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=50)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
