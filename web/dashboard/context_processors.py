def session_user(request):
    return {
        "session_user": {
            "full_name": request.session.get("full_name"),
            "role": request.session.get("role"),
            "user_id": request.session.get("user_id"),
        }
        if request.session.get("api_token")
        else None,
        "api_base": __import__("django.conf", fromlist=["settings"]).settings.FASTAPI_BASE_URL,
    }
