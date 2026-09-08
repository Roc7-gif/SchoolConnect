"""Fabriques de colonnes list_display pour naviguer entre modèles liés dans Django Admin.

Deux directions, symétriques :
- `related_count_link` : vers le bas (un objet → ses N enfants), ex. une école → ses classes.
  Le compte doit être annoté sur le queryset par `get_queryset()` (voir chaque ModelAdmin) :
  une jointure agrégée en base plutôt qu'un `.count()` par ligne affichée.
- `fk_change_link` : vers le haut (un objet → son parent), ex. une classe → son école.
"""

from django.urls import reverse
from django.utils.html import format_html


def related_count_link(model, param, count_attr, label):
    opts = model._meta
    changelist_url = f'admin:{opts.app_label}_{opts.model_name}_changelist'

    def _link(self, obj):
        count = getattr(obj, count_attr)
        url = reverse(changelist_url) + f'?{param}={obj.pk}'
        return format_html('<a href="{}">{} {}</a>', url, count, label)

    _link.short_description = label[0].upper() + label[1:]
    _link.admin_order_field = count_attr
    return _link


def fk_change_link(attr, empty='—'):
    def _link(self, obj):
        related = getattr(obj, attr)
        if related is None:
            return empty
        opts = related._meta
        url = reverse(f'admin:{opts.app_label}_{opts.model_name}_change', args=[related.pk])
        return format_html('<a href="{}">{}</a>', url, related)

    _link.short_description = attr
    _link.admin_order_field = attr
    return _link
