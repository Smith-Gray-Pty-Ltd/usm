from django.http import JsonResponse


def get_users(request):
    return JsonResponse({"users": []})


def create_user(request):
    return JsonResponse({"id": 1}, status=201)


def get_user(request, user_id):
    return JsonResponse({"id": user_id})


def delete_user(request, user_id):
    return JsonResponse({"deleted": user_id})


def get_products(request):
    return JsonResponse({"products": []})