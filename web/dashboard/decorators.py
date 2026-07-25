from functools import wraps

from django.contrib import messages
from django.shortcuts import redirect

from .api_client import APIError, client_from_request


def api_login_required(view):
    @wraps(view)
    def _wrapped(request, *args, **kwargs):
        if not request.session.get("api_token"):
            return redirect("login")
        return view(request, *args, **kwargs)

    return _wrapped


def role_required(*roles):
    def decorator(view):
        @wraps(view)
        @api_login_required
        def _wrapped(request, *args, **kwargs):
            if request.session.get("role") not in roles:
                messages.error(request, "You do not have access to this page.")
                return redirect("dashboard")
            return view(request, *args, **kwargs)

        return _wrapped

    return decorator


def safe_api(request, fn):
    try:
        return fn(client_from_request(request))
    except APIError as exc:
        messages.error(request, f"API error: {exc}")
        return None
