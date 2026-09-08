from rest_framework import permissions, serializers, viewsets

from schools.search import filter_search

from .models import Parent, StudentGuardian
from .serializers import ParentSerializer, StudentGuardianSerializer


class ParentViewSet(viewsets.ModelViewSet):
    serializer_class = ParentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Parent.objects.prefetch_related('studentguardian_set__student').order_by('last_name', 'first_name')
        if not user.is_superuser:
            # Filtre sur la fiche elle-même plutôt que sur l'école des enfants : c'est
            # direct, et un parent sans enfant reste visible de son établissement.
            qs = qs.filter(school_id=user.school_id)
        # On cherche aussi sur le nom des enfants : « le parent de Kone Ama » est
        # souvent la seule chose que le directeur a en tête.
        return filter_search(
            qs,
            self.request.query_params.get('search'),
            ['first_name', 'last_name', 'phone_number', 'email'],
            related_fields=['students__first_name', 'students__last_name'],
        )

    def perform_create(self, serializer):
        serializer.save(school_id=self.request.user.school_id)


class StudentGuardianViewSet(viewsets.ModelViewSet):
    serializer_class = StudentGuardianSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = StudentGuardian.objects.select_related('student', 'parent')
        if user.is_superuser:
            return qs
        return qs.filter(student__school_id=user.school_id)

    def _check_schools(self, student, parent):
        """L'élève et le parent doivent appartenir à l'école de l'utilisateur. Vérifier
        aussi le parent empêche de rattacher un enfant à la fiche d'un autre
        établissement — ce qui exposerait ses coordonnées."""
        user = self.request.user
        if user.is_superuser:
            return
        if student.school_id != user.school_id:
            raise serializers.ValidationError({'student': "Cet élève n'appartient pas à votre établissement."})
        if parent.school_id != user.school_id:
            raise serializers.ValidationError({'parent': "Ce parent n'appartient pas à votre établissement."})

    def perform_create(self, serializer):
        self._check_schools(serializer.validated_data['student'], serializer.validated_data['parent'])
        serializer.save()

    def perform_update(self, serializer):
        student = serializer.validated_data.get('student', serializer.instance.student)
        parent = serializer.validated_data.get('parent', serializer.instance.parent)
        self._check_schools(student, parent)
        serializer.save()
