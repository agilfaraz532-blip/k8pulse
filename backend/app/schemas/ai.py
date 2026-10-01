from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class AIClusterAnalysisRequest(BaseModel):
    include_metrics: bool = True
    include_events: bool = True
    include_unhealthy_pods: bool = True
    custom_question: Optional[str] = None


class AIPodIncidentRequest(BaseModel):
    namespace: str
    pod_name: str
    container_name: Optional[str] = None
    tail_lines: int = 100


class AIAnalysisResponse(BaseModel):
    title: str
    severity: str  # Normal, Warning, Critical
    summary: str
    root_cause_analysis: str
    recommendations: List[str]
    suggested_commands: List[str]
    model_used: str
    timestamp: str
