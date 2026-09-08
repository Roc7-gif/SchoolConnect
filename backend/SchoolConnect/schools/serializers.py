from rest_framework import serializers

from .models import School


class SchoolSerializer(serializers.ModelSerializer):
    """`*_count` ne sont peuplés que pour un superuser (panneau admin AfriLab) : le
    ViewSet ne les annote sur la queryset que dans ce cas, ils restent `None` sinon."""

    eleves_count = serializers.IntegerField(read_only=True, default=None)
    parents_count = serializers.IntegerField(read_only=True, default=None)
    messages_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = School
        fields = [
            'id', 'name', 'country', 'city', 'address',
            'phone_number', 'email', 'is_active', 'created_at', 'updated_at',
            'eleves_count', 'parents_count', 'messages_count',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
