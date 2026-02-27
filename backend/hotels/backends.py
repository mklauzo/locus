from django.contrib.auth.backends import ModelBackend


class BlockedUserBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        user = super().authenticate(request, username=username, password=password, **kwargs)
        if user and (user.is_blocked or user.is_trashed):
            return None
        return user
