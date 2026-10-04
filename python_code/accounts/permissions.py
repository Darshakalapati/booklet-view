from rest_framework.permissions import BasePermission


class IsBookletAdmin(BasePermission):
    """Only admins may use the endpoint."""

    message = "Only an admin can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_booklet_admin)
