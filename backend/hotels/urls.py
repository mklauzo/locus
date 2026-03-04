from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'hotels', views.HotelViewSet, basename='hotel')

urlpatterns = [
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', views.me, name='me'),
    path('auth/change-password/', views.change_password, name='change_password'),
    path('', include(router.urls)),
    path('hotels/<int:hotel_pk>/rooms/', views.RoomViewSet.as_view({
        'get': 'list', 'post': 'create',
    })),
    path('hotels/<int:hotel_pk>/rooms/<int:pk>/', views.RoomViewSet.as_view({
        'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
    })),
    path('hotels/<int:hotel_pk>/reservations/', views.ReservationViewSet.as_view({
        'get': 'list', 'post': 'create',
    })),
    path('hotels/<int:hotel_pk>/reservations/<int:pk>/', views.ReservationViewSet.as_view({
        'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
    })),
    path('hotels/<int:hotel_pk>/reservations/<int:pk>/search_mail/', views.ReservationViewSet.as_view({
        'post': 'search_mail',
    })),
    path('hotels/<int:hotel_pk>/reservations/<int:pk>/settle/', views.ReservationViewSet.as_view({
        'post': 'settle',
    })),
    path('hotels/<int:hotel_pk>/reservations/<int:pk>/send-message/', views.send_message, name='send_message'),
    path('hotels/<int:hotel_pk>/reservations/<int:pk>/generate-message/', views.generate_outbound_message, name='generate_outbound_message'),
    path('hotels/<int:hotel_pk>/reservations/<int:reservation_pk>/correspondence/<int:pk>/',
         views.delete_correspondence, name='delete_correspondence'),
    path('hotels/<int:hotel_pk>/reservations/<int:reservation_pk>/correspondence/<int:pk>/reply/',
         views.generate_email_reply, name='generate_email_reply'),
    path('hotels/<int:hotel_pk>/rooms/<int:room_pk>/calculate-price/', views.calculate_room_price, name='calculate_room_price'),
    path('hotels/<int:hotel_pk>/search-inquiries/', views.search_inquiries, name='search_inquiries'),
    path('hotels/<int:hotel_pk>/send-inquiry-reply/', views.send_inquiry_reply, name='send_inquiry_reply'),
    path('hotels/<int:hotel_pk>/generate-inquiry-reply/', views.generate_inquiry_reply, name='generate_inquiry_reply'),
    path('hotels/<int:hotel_pk>/calendar/', views.calendar_view, name='calendar'),
    path('hotels/<int:hotel_pk>/ai-assistant/', views.AIAssistantViewSet.as_view({
        'get': 'list', 'post': 'create',
    })),
    path('hotels/<int:hotel_pk>/ai-assistant/<int:pk>/', views.AIAssistantViewSet.as_view({
        'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
    })),
    path('hotels/<int:hotel_pk>/ai-assistant/<int:assistant_pk>/documents/',
         views.upload_ai_document, name='upload_ai_document'),
    path('hotels/<int:hotel_pk>/ai-assistant/<int:assistant_pk>/documents/<int:pk>/',
         views.ai_document_detail, name='ai_document_detail'),
    path('fetch-llm-models/', views.fetch_llm_models, name='fetch_llm_models'),
    path('test-smtp/', views.test_smtp_standalone, name='test_smtp'),
    path('test-imap/', views.test_imap_standalone, name='test_imap'),
    path('weather/', views.weather, name='weather'),
]
