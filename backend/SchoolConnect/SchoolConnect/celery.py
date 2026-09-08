import os

import django
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SchoolConnect.settings')

# Le worker ne passe jamais par manage.py, qui est ce qui applique normalement
# settings.LOGGING : sans ce setup explicite, logger.exception() dans les tasks/services
# ne va nulle part (cf. CELERY_WORKER_HIJACK_ROOT_LOGGER = False dans settings.py, qui
# empêche Celery d'écraser cette config avec la sienne juste après).
django.setup()
from django.conf import settings  # noqa: E402
from django.utils.log import configure_logging  # noqa: E402

configure_logging(settings.LOGGING_CONFIG, settings.LOGGING)

app = Celery('SchoolConnect')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
