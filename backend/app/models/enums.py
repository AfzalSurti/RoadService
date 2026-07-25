from enum import Enum


class UserRole(str, Enum):
    GOVERNMENT = "government"
    ADMIN = "admin"
    CONTRACTOR = "contractor"
    SURVEYOR = "surveyor"


class IssueStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    VERIFICATION_PENDING = "verification_pending"
    UNDER_REVIEW = "under_review"  # Rework required
    CLOSED = "closed"


class IssuePriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Explicit allowed transitions (from_status -> set of to_status)
STATUS_TRANSITIONS: dict[IssueStatus, set[IssueStatus]] = {
    IssueStatus.OPEN: {IssueStatus.IN_PROGRESS},
    IssueStatus.IN_PROGRESS: {IssueStatus.COMPLETED},
    IssueStatus.COMPLETED: {
        IssueStatus.CLOSED,
        IssueStatus.UNDER_REVIEW,
        IssueStatus.VERIFICATION_PENDING,  # scheduler only
    },
    IssueStatus.VERIFICATION_PENDING: {
        IssueStatus.CLOSED,
        IssueStatus.UNDER_REVIEW,
    },
    IssueStatus.UNDER_REVIEW: {IssueStatus.IN_PROGRESS},
    IssueStatus.CLOSED: set(),
}
