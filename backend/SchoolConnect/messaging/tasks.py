from celery import shared_task

from .models import Message
from .services import send_message


@shared_task
def send_message_task(message_id):
    try:
        message = Message.objects.get(id=message_id)
    except Message.DoesNotExist:
        return
    try:
        send_message(message)
    except Exception:
        message.status = Message.Status.ECHEC
        message.save(update_fields=['status'])
        raise
