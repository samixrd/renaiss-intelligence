"""Pydantic models for Renaiss Index API responses."""

from pydantic import BaseModel, Field


class GradedEstimate(BaseModel):
    """Response model for the graded-cert lookup."""

    best_estimate: float = Field(
        ..., description="Best estimated market value for the graded item"
    )
    confidence_tier: str = Field(
        ..., description="Confidence level of the estimate (e.g. high, medium, low)"
    )
    freshness_days: int = Field(
        ..., description="Number of days since the underlying data was last refreshed"
    )


class CardIndex(BaseModel):
    """Response model for the card index lookup by item number."""

    # The full upstream payload is returned as-is; callers can extend
    # this model once the exact schema is documented.
    data: dict = Field(
        ..., description="Raw payload returned by the Renaiss Index item-by-no endpoint"
    )
