from django.db.models import Count
from rest_framework import permissions, viewsets

from .models import School
from .serializers import SchoolSerializer


class SchoolViewSet(viewsets.ModelViewSet):
    serializer_class = SchoolSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            # Compteurs annotés uniquement pour le panneau admin AfriLab — distinct=True
            # est nécessaire : sans lui, annoter trois relations inversées dans le même
            # appel produit un produit croisé qui fausse chaque count.
            return School.objects.annotate(
                eleves_count=Count('eleves', distinct=True),
                parents_count=Count('parents', distinct=True),
                messages_count=Count('messages', distinct=True),
            ).order_by('name')
        return School.objects.filter(pk=user.school_id)
