from django.urls import path
from . import views

urlpatterns = [
    path("api/users/", views.get_users, name="get_users"),
    path("api/users/create/", views.create_user, name="create_user"),
    path("api/users/<int:user_id>/", views.get_user, name="get_user"),
    path("api/users/<int:user_id>/delete/", views.delete_user, name="delete_user"),
    path("api/products/", views.get_products, name="get_products"),
]