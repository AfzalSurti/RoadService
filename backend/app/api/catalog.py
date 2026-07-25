from typing import Annotated

from fastapi import APIRouter, Depends

from app.catalog.defects import catalog_payload
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/defects")
async def get_defect_catalog(_: Annotated[User, Depends(get_current_user)]):
    """Categories + issue types with IDs (ATMS-n, S-n, letter codes)."""
    return catalog_payload()
