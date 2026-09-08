from rest_framework import serializers

from . import services
from .models import AnneeScolaire, Classe, CustomFieldDefinition, Eleve, Inscription


class CustomFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFieldDefinition
        fields = ['id', 'name', 'slug', 'created_at']
        read_only_fields = ['id', 'slug', 'created_at']


class AnneeScolaireSerializer(serializers.ModelSerializer):
    classes_count = serializers.SerializerMethodField()
    eleves_count = serializers.SerializerMethodField()

    class Meta:
        model = AnneeScolaire
        fields = [
            'id', 'school', 'label', 'start_date', 'end_date', 'is_current',
            'classes_count', 'eleves_count', 'created_at',
        ]
        # `is_current` ne se change pas par PATCH : la bascule passe par l'action
        # `definir-courante`, seule à respecter l'unicité de l'année courante.
        read_only_fields = ['id', 'school', 'is_current', 'created_at']

    def get_classes_count(self, obj):
        return obj.classes.count()

    def get_eleves_count(self, obj):
        return obj.inscriptions.filter(statut=Inscription.Statut.INSCRIT).count()


class ClasseSerializer(serializers.ModelSerializer):
    # Effectif de la classe pour son année : compté sur les inscriptions, pas sur le
    # cache `Eleve.classe`, qui ne vaut que pour l'année courante.
    eleves_count = serializers.SerializerMethodField()
    annee_label = serializers.CharField(source='annee.label', read_only=True)

    class Meta:
        model = Classe
        fields = ['id', 'school', 'annee', 'annee_label', 'name', 'level', 'eleves_count', 'created_at']
        read_only_fields = ['id', 'school', 'created_at']

    def get_eleves_count(self, obj):
        return obj.inscriptions.filter(statut=Inscription.Statut.INSCRIT).count()

    def validate_annee(self, annee):
        school_id = self.context['request'].user.school_id
        if school_id and annee.school_id != school_id:
            raise serializers.ValidationError("Cette année scolaire n'appartient pas à votre école.")
        return annee


class EleveSerializer(serializers.ModelSerializer):
    classe_name = serializers.CharField(source='classe.name', read_only=True, default=None)
    parents = serializers.SerializerMethodField()
    parcours = serializers.SerializerMethodField()

    class Meta:
        model = Eleve
        fields = [
            'id', 'school', 'classe', 'classe_name', 'first_name', 'last_name', 'sexe',
            'date_of_birth', 'matricule', 'extra_data', 'parents', 'parcours', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'school', 'created_at', 'updated_at']

    def get_parcours(self, obj):
        """Historique de scolarité, année la plus récente d'abord."""
        return [
            {
                'annee': i.annee_id,
                'annee_label': i.annee.label,
                'classe': i.classe_id,
                'classe_name': i.classe.name,
                'statut': i.statut,
            }
            for i in sorted(obj.inscriptions.all(), key=lambda i: i.annee.label, reverse=True)
        ]

    def to_representation(self, instance):
        """`classe` est le cache de l'année courante. Quand une autre année est consultée,
        il ne décrit pas la bonne scolarité : on le remplace par l'inscription de l'année
        demandée, sinon la liste afficherait la classe d'aujourd'hui sur un écran d'archive."""
        data = super().to_representation(instance)
        annee = self.context.get('annee')
        if annee is not None and not annee.is_current:
            classe = instance.classe_pour(annee)
            data['classe'] = classe.id if classe else None
            data['classe_name'] = classe.name if classe else None
        return data

    def validate_classe(self, classe):
        if classe is None:
            return classe
        school_id = self.context['request'].user.school_id
        if school_id and classe.school_id != school_id:
            raise serializers.ValidationError("Cette classe n'appartient pas à votre école.")
        return classe

    def create(self, validated_data):
        """L'affectation de classe passe par `inscrire()` : créer l'élève puis écrire
        `classe` directement laisserait l'inscription — la source de vérité — manquante."""
        classe = validated_data.pop('classe', None)
        eleve = super().create(validated_data)
        if classe is not None:
            services.inscrire(eleve, classe)
        return eleve

    def update(self, instance, validated_data):
        classe = validated_data.pop('classe', serializers.empty)
        eleve = super().update(instance, validated_data)
        if classe is not serializers.empty and classe is not None:
            services.inscrire(eleve, classe)
        elif classe is None:
            annee = self.context.get('annee') or services.get_current_year(eleve.school)
            if annee is not None:
                services.cloturer_inscription(eleve, annee, Inscription.Statut.PARTI)
        return eleve

    def get_parents(self, obj):
        """Liens parent/élève, contact prioritaire d'abord. Construit à la main plutôt
        qu'avec le serializer de l'app `parents` : `academics` ne doit pas dépendre
        d'une app qui dépend déjà d'elle."""
        links = sorted(obj.studentguardian_set.all(), key=lambda sg: not sg.is_primary_contact)
        return [
            {
                'id': sg.id,
                'parent': sg.parent_id,
                'parent_name': f'{sg.parent.last_name} {sg.parent.first_name}',
                'phone_number': sg.parent.phone_number,
                'relationship': sg.relationship,
                'is_primary_contact': sg.is_primary_contact,
            }
            for sg in links
        ]
