from rest_framework import serializers

from .models import Message, MessageRecipient, MessageTemplate

CASCADE_CHANNELS = [Message.Channel.SMS, Message.Channel.WHATSAPP, Message.Channel.EMAIL]


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = ['id', 'name', 'category', 'subject', 'body', 'created_at']
        read_only_fields = ['id', 'created_at']


class MessageRecipientSerializer(serializers.ModelSerializer):
    parent_name = serializers.SerializerMethodField()
    eleve_name = serializers.SerializerMethodField()
    eleve_classe = serializers.SerializerMethodField()
    eleve_classe_name = serializers.SerializerMethodField()
    skip_reason_display = serializers.CharField(source='get_skip_reason_display', read_only=True)

    def _classe(self, obj):
        """Classe de l'élève à l'année du message, pas celle d'aujourd'hui : consulter
        un envoi de l'an dernier doit montrer la classe qu'il avait alors."""
        if not obj.eleve_id:
            return None
        annee = obj.message.annee
        return obj.eleve.classe_pour(annee) if annee is not None else obj.eleve.classe

    def get_eleve_classe(self, obj):
        classe = self._classe(obj)
        return classe.id if classe else None

    def get_eleve_classe_name(self, obj):
        classe = self._classe(obj)
        return classe.name if classe else None

    class Meta:
        model = MessageRecipient
        fields = [
            'id', 'parent', 'parent_name', 'eleve', 'eleve_name', 'eleve_classe', 'eleve_classe_name',
            'eleves_count', 'channel_used', 'rendered_body', 'attempts', 'status', 'skip_reason',
            'skip_reason_display', 'cost', 'sent_at',
        ]

    def get_parent_name(self, obj):
        return str(obj.parent) if obj.parent_id else None

    def get_eleve_name(self, obj):
        return str(obj.eleve) if obj.eleve_id else None


class MessageRetrySummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'status', 'recipient_count', 'cost', 'created_at', 'sent_at']


class MessageSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True, default=None)
    annee_label = serializers.CharField(source='annee.label', read_only=True, default=None)
    scope_classe_name = serializers.CharField(source='scope_classe.name', read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    recipients = MessageRecipientSerializer(many=True, read_only=True)
    retries = MessageRetrySummarySerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'school', 'annee', 'annee_label', 'template', 'template_name',
            'subject', 'body', 'scope_type', 'scope_classe',
            'scope_classe_name', 'scope_level', 'scope_eleves', 'channel', 'channel_order',
            'notify_all_parents', 'status',
            'recipient_count', 'cost', 'created_by_name', 'created_at', 'sent_at', 'recipients',
            'retry_of', 'retries',
        ]
        read_only_fields = [
            'id', 'school', 'status', 'recipient_count', 'cost', 'created_at', 'sent_at', 'retry_of',
        ]

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by_id else None

    def validate(self, attrs):
        channel = attrs.get('channel', Message.Channel.AUTO)
        order = attrs.get('channel_order') or []

        if channel != Message.Channel.CASCADE:
            attrs['channel_order'] = []
            return attrs

        if not isinstance(order, list) or any(c not in CASCADE_CHANNELS for c in order):
            raise serializers.ValidationError(
                {'channel_order': f'Canaux autorisés : {", ".join(CASCADE_CHANNELS)}.'},
            )
        if len(set(order)) != len(order):
            raise serializers.ValidationError({'channel_order': 'Un canal ne peut apparaître deux fois.'})
        return attrs
