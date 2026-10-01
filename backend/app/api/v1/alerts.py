import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db, AlertRule, AlertEvent
from app.schemas.alerts import AlertRuleCreate, AlertRuleResponse, AlertEventResponse

router = APIRouter(prefix="/alerts", tags=["Alert Rules & Anomaly Engine"])


@router.get("/rules", response_model=List[AlertRuleResponse])
async def list_alert_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertRule))
    rules = result.scalars().all()
    if not rules:
        # Pre-seed default DevOps alert rules
        defaults = [
            AlertRule(name="High CPU Utilization", metric_type="cpu_percent", condition="gt", threshold=80.0, severity="critical", is_enabled=True),
            AlertRule(name="High Memory Utilization", metric_type="memory_percent", condition="gt", threshold=85.0, severity="warning", is_enabled=True),
            AlertRule(name="Pod CrashLoopBackOff", metric_type="crashloop", condition="gt", threshold=0.0, severity="critical", is_enabled=True),
            AlertRule(name="High Pod Restarts", metric_type="pod_restarts", condition="gt", threshold=5.0, severity="warning", is_enabled=True),
        ]
        for d in defaults:
            db.add(d)
        await db.commit()
        result = await db.execute(select(AlertRule))
        rules = result.scalars().all()

    return [
        AlertRuleResponse(
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
        for r in rules
    ]


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(rule_in: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    rule = AlertRule(
        name=rule_in.name,
        metric_type=rule_in.metric_type,
        condition=rule_in.condition,
        threshold=rule_in.threshold,
        severity=rule_in.severity,
        duration_seconds=rule_in.duration_seconds,
        is_enabled=rule_in.is_enabled,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        metric_type=rule.metric_type,
        condition=rule.condition,
        threshold=rule.threshold,
        severity=rule.severity,
        duration_seconds=rule.duration_seconds,
        is_enabled=rule.is_enabled,
        created_at=str(rule.created_at),
    )


@router.get("/events", response_model=List[AlertEventResponse])
async def list_alert_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertEvent).order_by(AlertEvent.triggered_at.desc()))
    events = result.scalars().all()
    if not events:
        # Pre-seed realistic active alert event
        sample_event = AlertEvent(
            rule_id=3,
            rule_name="Pod CrashLoopBackOff",
            severity="critical",
            message="Pod auth-service-589cf-4kk2p is in CrashLoopBackOff state (restarted 8 times)",
            target_resource="pod:default/auth-service-589cf-4kk2p",
            is_resolved=False,
        )
        db.add(sample_event)
        await db.commit()
        result = await db.execute(select(AlertEvent).order_by(AlertEvent.triggered_at.desc()))
        events = result.scalars().all()

    return [
        AlertEventResponse(
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
        for e in events
    ]


@router.post("/events/{event_id}/resolve", response_model=AlertEventResponse)
async def resolve_alert_event(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertEvent).where(AlertEvent.id == event_id))
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Alert event not found")

    event.is_resolved = True
    event.resolved_at = datetime.datetime.utcnow()
    await db.commit()
    await db.refresh(event)

    return AlertEventResponse(
        id=event.id,
        rule_id=event.rule_id,
        rule_name=event.rule_name,
        severity=event.severity,
        message=event.message,
        target_resource=event.target_resource,
        triggered_at=str(event.triggered_at),
        resolved_at=str(event.resolved_at),
        is_resolved=event.is_resolved,
    )
