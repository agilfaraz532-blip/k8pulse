from fastapi import APIRouter
from app.services.ai import gemini_service
from app.schemas.ai import AIClusterAnalysisRequest, AIPodIncidentRequest, AIAnalysisResponse

router = APIRouter(prefix="/ai", tags=["Google Gemini AI Observability Copilot"])


@router.post("/explain-cluster", response_model=AIAnalysisResponse)
async def explain_cluster(req: AIClusterAnalysisRequest):
    """
    Synthesize cluster health metrics, unready nodes, and warning events
    into human-readable AI diagnosis and proactive recommendations.
    """
    return await gemini_service.explain_cluster_health(req)


@router.post("/analyze-incident", response_model=AIAnalysisResponse)
async def analyze_incident(req: AIPodIncidentRequest):
    """
    Perform deep incident root-cause analysis on failing or crashed pods
    combining container logs, events, and termination exit codes.
    """
    return await gemini_service.analyze_incident(req)
