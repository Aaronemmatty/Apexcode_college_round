"""API endpoints for tool and permission auditing."""

from fastapi import APIRouter
from app.sandbox.audit import get_permission_audit_report

router = APIRouter()


@router.get("/audit/permissions")
def get_permissions_audit():
    """Return static capability vs task policy audit and attack abuse mappings for all tools."""
    return get_permission_audit_report()