from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("", views.dashboard, name="dashboard"),
    path("issues/", views.issues_list, name="issues"),
    path("issues/<int:issue_id>/", views.issue_detail, name="issue_detail"),
    path("issues/<int:issue_id>/start/", views.contractor_start, name="contractor_start"),
    path("map/", views.map_view, name="map"),
    path("users/", views.users_list, name="users"),
    path("projects/", views.projects_manage, name="projects"),
    path("export/excel/", views.export_excel, name="export_excel"),
    path("export/pdf/", views.export_pdf, name="export_pdf"),
]
