from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Hotel, Room, RoomPricing, Reservation, MailCorrespondence, AuditLog, AIAssistant, AIAssistantDocument

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'is_blocked', 'is_trashed', 'password', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserMeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role']


class RoomPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomPricing
        fields = ['month', 'price_per_night']


class RoomSerializer(serializers.ModelSerializer):
    pricing = RoomPricingSerializer(many=True, required=False)

    class Meta:
        model = Room
        fields = ['id', 'hotel', 'number', 'capacity', 'pricing', 'is_deleted', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        pricing_data = validated_data.pop('pricing', [])
        room = Room.objects.create(**validated_data)
        for p in pricing_data:
            if float(p['price_per_night']) > 0:
                RoomPricing.objects.create(room=room, **p)
        return room

    def update(self, instance, validated_data):
        pricing_data = validated_data.pop('pricing', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if pricing_data is not None:
            instance.pricing.all().delete()
            for p in pricing_data:
                if float(p['price_per_night']) > 0:
                    RoomPricing.objects.create(room=instance, **p)
        return instance


class RoomSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ['id', 'number', 'capacity']


class HotelSerializer(serializers.ModelSerializer):
    rooms = RoomSimpleSerializer(many=True, read_only=True)
    users = UserMeSerializer(many=True, read_only=True)
    user_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, write_only=True, source='users', required=False
    )

    class Meta:
        model = Hotel
        fields = ['id', 'name', 'address', 'email', 'imap_host', 'imap_port',
                  'imap_ssl', 'imap_login', 'imap_password',
                  'smtp_host', 'smtp_port', 'smtp_ssl', 'smtp_login', 'smtp_password',
                  'users', 'user_ids', 'rooms', 'is_deleted', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'imap_password': {'write_only': True},
            'smtp_password': {'write_only': True},
        }


class MailCorrespondenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailCorrespondence
        fields = ['id', 'date', 'subject', 'body', 'message_id', 'sender_email', 'created_at']


class AIAssistantDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIAssistantDocument
        fields = ['id', 'name', 'content', 'created_at']
        read_only_fields = ['id', 'created_at']


class AIAssistantSerializer(serializers.ModelSerializer):
    documents = AIAssistantDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = AIAssistant
        fields = ['id', 'hotel', 'name', 'llm_model', 'llm_api_key', 'ollama_url',
                  'system_prompt', 'is_active', 'documents', 'created_at', 'updated_at']
        read_only_fields = ['id', 'hotel', 'created_at', 'updated_at']


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'action', 'changes', 'created_at']


class ReservationSerializer(serializers.ModelSerializer):
    days_count = serializers.IntegerField(read_only=True)
    guest_name = serializers.CharField(read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True)
    correspondence = MailCorrespondenceSerializer(many=True, read_only=True)
    audit_logs = AuditLogSerializer(many=True, read_only=True)

    class Meta:
        model = Reservation
        fields = ['id', 'hotel', 'room', 'room_number', 'guest_first_name',
                  'guest_last_name', 'guest_name', 'companions',
                  'animals', 'check_in', 'check_out', 'days_count', 'deposit_paid',
                  'deposit_amount', 'deposit_date', 'remaining_amount', 'notes',
                  'contact_email', 'contact_phone', 'is_settled', 'has_new_mail', 'is_deleted',
                  'created_by', 'edited_by', 'correspondence', 'audit_logs',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by', 'edited_by', 'created_at', 'updated_at']

    def validate(self, data):
        check_in = data.get('check_in', getattr(self.instance, 'check_in', None))
        check_out = data.get('check_out', getattr(self.instance, 'check_out', None))
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError("Data wymeldowania musi być po dacie zameldowania.")

        room = data.get('room', getattr(self.instance, 'room', None))
        companions = data.get('companions', getattr(self.instance, 'companions', 0))
        if room and companions is not None:
            # 1 (main guest) + companions cannot exceed room capacity
            max_companions = room.capacity - 1
            if companions > max_companions:
                raise serializers.ValidationError(
                    f"Liczba osób towarzyszących ({companions}) przekracza pojemność pokoju ({room.capacity} os., max towarzyszących: {max_companions})."
                )

        hotel = data.get('hotel', getattr(self.instance, 'hotel', None))
        if room and hotel and check_in and check_out:
            overlapping = Reservation.objects.filter(
                room=room,
                hotel=hotel,
                is_deleted=False,
                check_in__lt=check_out,
                check_out__gt=check_in,
            )
            if self.instance:
                overlapping = overlapping.exclude(pk=self.instance.pk)
            if overlapping.exists():
                raise serializers.ValidationError("Pokój jest zajęty w wybranym terminie.")

        # Reject dates where room has no price for a given month (missing price = closed)
        if room and check_in and check_out:
            from datetime import timedelta
            priced_months = set(
                RoomPricing.objects.filter(room=room, price_per_night__gt=0).values_list('month', flat=True)
            )
            pl_months = ['', 'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
                         'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
            current = check_in
            while current < check_out:
                if current.month not in priced_months:
                    raise serializers.ValidationError(
                        f"Pokój niedostępny w {pl_months[current.month]} — brak cennika dla tego miesiąca."
                    )
                current += timedelta(days=1)

        return data


class ReservationListSerializer(serializers.ModelSerializer):
    days_count = serializers.IntegerField(read_only=True)
    guest_name = serializers.CharField(read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True)

    class Meta:
        model = Reservation
        fields = ['id', 'hotel', 'room', 'room_number', 'guest_first_name',
                  'guest_last_name', 'guest_name', 'companions',
                  'animals', 'check_in', 'check_out', 'days_count', 'deposit_paid',
                  'deposit_amount', 'remaining_amount', 'contact_email', 'contact_phone',
                  'is_settled', 'has_new_mail', 'is_deleted', 'created_at']


class CalendarSerializer(serializers.ModelSerializer):
    guest_name = serializers.CharField(read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True)
    room_capacity = serializers.IntegerField(source='room.capacity', read_only=True)

    class Meta:
        model = Reservation
        fields = ['id', 'room', 'room_number', 'room_capacity', 'guest_first_name',
                  'guest_last_name', 'guest_name',
                  'check_in', 'check_out', 'companions', 'deposit_paid', 'is_settled']
