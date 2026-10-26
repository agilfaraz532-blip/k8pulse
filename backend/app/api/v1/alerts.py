import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.v1.auth import require_operator
from app.models.database import get_db, AlertRule, AlertEvent, User
from app.schemas.alerts import AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse, AlertEventResponse
from app.services.alerting import METRIC_TYPES, alert_engine

router = APIRouter(prefix="/alerts", tags=["Alert Rules & Anomaly Engine"])


def _rule_response(r: AlertRule) -> AlertRuleResponse:
    return AlertRuleResponse(
        id=r.id,
        name=r.name,
        metric_type=r.metric_type,
        condition=r.condition,
        threshold=r.threshold,
        severity=r.severity,
        duration_seconds=r.duration_seconds,
        is_enabled=r.is_enabled,
        created_at=str(r.created_at),
    )


def _event_response(e: AlertEvent) -> AlertEventResponse:
    return AlertEventResponse(
        id=e.id,
        rule_id=e.rule_id,
        rule_name=e.rule_name,
        severity=e.severity,
        message=e.message,
        target_resource=e.target_resource,
        triggered_at=str(e.triggered_at),
        resolved_at=str(e.resolved_at) if e.resolved_at else None,
        is_resolved=e.is_resolved,
    )


def _validate_rule(metric_type: str, condition: str, severity: str) -> None:
    if metric_type not in METRIC_TYPES:
        raise HTTPException(status_code=422, detail=f"metric_type must be one of {', '.join(METRIC_TYPES)}")
    if condition not in ("gt", "lt", "eq"):
        raise HTTPException(status_code=422, detail="condition must be gt, lt or eq")
    if severity not in ("critical", "warning", "info"):
        raise HTTPException(status_code=422, detail="severity must be critical, warning or info")


async def _get_rule(rule_id: int, db: AsyncSession) -> AlertRule:
    rule = (await db.execute(select(AlertRule).where(AlertRule.id == rule_id))).scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule


@router.get("/rules", response_model=List[AlertRuleResponse])
async def list_alert_rules(db: AsyncSession = Depends(get_db)):
    rules = (await db.execute(select(AlertRule).order_by(AlertRule.id))).scalars().all()
    return [_rule_response(r) for r in rules]


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(rule_in: AlertRuleCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_operator)):
    _validate_rule(rule_in.metric_type, rule_in.condition, rule_in.severity)
    rule = AlertRule(**rule_in.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_response(rule)


@router.patch("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(rule_id: int, rule_in: AlertRuleUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_operator)):
    rule = await _get_rule(rule_id, db)
    for field, value in rule_in.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    _validate_rule(rule.metric_type, rule.condition, rule.severity)
    await db.commit()
    await db.refresh(rule)
    return _rule_response(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(rule_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_operator)):
    rule = await _get_rule(rule_id, db)
    await db.delete(rule)
    await db.commit()


@router.post("/evaluate")
async def evaluate_alert_rules():
    """Run the alert engine immediately instead of waiting for the next interval."""
    opened = await alert_engine.evaluate_once()
    return {"opened_events": opened}


@router.get("/events", response_model=List[AlertEventResponse])
async def list_alert_events(db: AsyncSession = Depends(get_db)):
    events = (await db.execute(select(AlertEvent).order_by(AlertEvent.triggered_at.desc()).limit(200))).scalars().all()
    return [_event_response(e) for e in events]


@router.post("/events/{event_id}/resolve", response_model=AlertEventResponse)
async def resolve_alert_event(event_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_operator)):
    event = (await db.execute(select(AlertEvent).where(AlertEvent.id == event_id))).scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Alert event not found")

    event.is_resolved = True
    event.resolved_at = datetime.datetime.utcnow()
    await db.commit()
    await db.refresh(event)
    return _event_response(event)
