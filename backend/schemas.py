from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    plan: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PlanUpdate(BaseModel):
    plan: str = Field(pattern="^(free|pro|business)$")


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_jobs: int
    failed_jobs: int
    processing_jobs: int


class BillingPlanResponse(BaseModel):
    id: str
    name: str
    label: str
    description: str
    price_label: str
    price_monthly: int
    currency: str
    daily_jobs_limit: int
    batch_pdf_limit: int
    features: list[str]
    is_current: bool = False
    checkout_enabled: bool = False


class BillingCheckoutRequest(BaseModel):
    plan: str = Field(pattern="^(pro|business)$")


class BillingCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class BillingPortalResponse(BaseModel):
    portal_url: str


class JobResponse(BaseModel):
    id: int
    operation: str
    original_filename: str
    output_filename: str | None
    status: str
    file_size_bytes: int
    result_size_bytes: int | None
    error_message: str | None
    metadata_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
