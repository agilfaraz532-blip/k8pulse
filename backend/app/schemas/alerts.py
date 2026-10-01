from typing import Optional
from pydantic import BaseModel


class AlertRuleCreate(BaseModel):
    name: str
    metric_type: str  # cpu_percent, memory_percent, pod_restarts, node_unready, crashloop
    condition: str = "gt"  # gt, lt, eq
    threshold: float
    severity: str = "warning"  # critical, warning, info
    duration_seconds: int = 60
    is_enabled: bool = True


class AlertRuleResponse(AlertRuleCreate):
    id: int
    created_at: str

    class Config:
        from_attributes = True


class AlertEventResponse(BaseModel):
    id: int
    rule_id: Optional[int]
    rule_name: str
    severity: str
    message: str
    target_resource: str
    triggered_at: str
    resolved_at: Optional[str] = None
    is_resolved: bool

    class Config:
        from_attributes = True
