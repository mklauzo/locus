from django.contrib import admin
from .models import User, Hotel, Room, Reservation, MailCorrespondence, AuditLog

admin.site.register(User)
admin.site.register(Hotel)
admin.site.register(Room)
admin.site.register(Reservation)
admin.site.register(MailCorrespondence)
admin.site.register(AuditLog)
