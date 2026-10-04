from django.contrib.auth import authenticate, get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()


def check_password_rules(password, user=None):
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as error:
        raise serializers.ValidationError(list(error.messages))
    return password


class UserSerializer(serializers.ModelSerializer):
    """What the API shows about a user, and what an admin may change."""

    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "is_active", "date_joined", "password"]
        read_only_fields = ["id", "date_joined"]

    def validate(self, attrs):
        request = self.context.get("request")
        editing_self = self.instance is not None and request and self.instance.pk == request.user.pk
        if editing_self:
            # Stops the last admin from locking themselves out by mistake.
            if attrs.get("role", self.instance.role) != User.Role.ADMIN and self.instance.is_booklet_admin:
                raise serializers.ValidationError({"role": "You cannot remove your own admin role."})
            if attrs.get("is_active", True) is False:
                raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A password is required for a new user."})
        if attrs.get("password"):
            try:
                check_password_rules(attrs["password"], self.instance)
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"password": error.detail})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={"input_type": "password"}, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("The username or password is not correct.")
        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("The current password is not correct.")
        return value

    def validate_new_password(self, value):
        return check_password_rules(value, self.context["request"].user)
