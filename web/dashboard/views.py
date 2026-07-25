from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from .api_client import APIError, FastAPIClient, client_from_request
from .decorators import api_login_required, role_required


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.session.get("api_token"):
        return redirect("dashboard")
    if request.method == "POST":
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")
        try:
            data = FastAPIClient().login(email, password)
            request.session["api_token"] = data["access_token"]
            request.session["role"] = data["role"]
            request.session["user_id"] = data["user_id"]
            request.session["full_name"] = data["full_name"]
            return redirect("dashboard")
        except APIError as exc:
            messages.error(request, str(exc))
    return render(request, "dashboard/login.html")


def logout_view(request):
    request.session.flush()
    return redirect("login")


@api_login_required
def dashboard(request):
    client = client_from_request(request)
    try:
        stats = client.get("/api/v1/analytics/dashboard")
        projects = client.get("/api/v1/projects")
    except APIError as exc:
        messages.error(request, str(exc))
        stats, projects = None, []
    return render(
        request,
        "dashboard/home.html",
        {"stats": stats, "projects": projects, "readonly": request.session.get("role") == "government"},
    )


@api_login_required
def issues_list(request):
    client = client_from_request(request)
    status = request.GET.get("status") or None
    params = {"status": status} if status else None
    try:
        issues = client.get("/api/v1/issues", params=params)
        projects = client.get("/api/v1/projects")
    except APIError as exc:
        messages.error(request, str(exc))
        issues, projects = [], []
    return render(
        request,
        "dashboard/issues.html",
        {
            "issues": issues,
            "projects": projects,
            "current_status": status or "all",
            "readonly": request.session.get("role") == "government",
        },
    )


@api_login_required
def issue_detail(request, issue_id: int):
    client = client_from_request(request)
    try:
        issue = client.get(f"/api/v1/issues/{issue_id}")
    except APIError as exc:
        messages.error(request, str(exc))
        return redirect("issues")
    return render(
        request,
        "dashboard/issue_detail.html",
        {"issue": issue, "readonly": request.session.get("role") == "government"},
    )


@api_login_required
def map_view(request):
    client = client_from_request(request)
    try:
        issues = client.get("/api/v1/issues")
    except APIError as exc:
        messages.error(request, str(exc))
        issues = []
    return render(request, "dashboard/map.html", {"issues": issues})


@role_required("admin")
def users_list(request):
    client = client_from_request(request)
    try:
        users = client.get("/api/v1/users")
    except APIError as exc:
        messages.error(request, str(exc))
        users = []
    return render(request, "dashboard/users.html", {"users": users})


@role_required("admin")
def projects_manage(request):
    client = client_from_request(request)
    try:
        projects = client.get("/api/v1/projects")
    except APIError as exc:
        messages.error(request, str(exc))
        projects = []
    return render(request, "dashboard/projects.html", {"projects": projects})


@api_login_required
def export_excel(request):
    client = client_from_request(request)
    try:
        content, content_type = client.download("/api/v1/analytics/export/excel")
    except APIError as exc:
        messages.error(request, str(exc))
        return redirect("dashboard")
    resp = HttpResponse(content, content_type=content_type)
    resp["Content-Disposition"] = 'attachment; filename="issues.xlsx"'
    return resp


@api_login_required
def export_pdf(request):
    client = client_from_request(request)
    try:
        content, content_type = client.download("/api/v1/analytics/export/pdf")
    except APIError as exc:
        messages.error(request, str(exc))
        return redirect("dashboard")
    resp = HttpResponse(content, content_type=content_type)
    resp["Content-Disposition"] = 'attachment; filename="issues.pdf"'
    return resp


@api_login_required
def contractor_start(request, issue_id: int):
    if request.session.get("role") != "contractor":
        messages.error(request, "Contractors only")
        return redirect("issue_detail", issue_id=issue_id)
    client = client_from_request(request)
    try:
        client.post(f"/api/v1/issues/{issue_id}/start")
        messages.success(request, "Marked In Progress")
    except APIError as exc:
        messages.error(request, str(exc))
    return redirect("issue_detail", issue_id=issue_id)
