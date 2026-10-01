from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.services.ai import AIUnavailableError, gemini_service
from app.schemas.ai import AIClusterAnalysisRequest, AIPodIncidentRequest, AIAnalysisResponse

router = APIRouter(prefix="/ai", tags=["AI Observability Copilot (Ollama / Gemini)"])

# Disable proxy buffering so tokens reach the browser as soon as they are generated
STREAM_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@router.post("/explain-cluster", response_model=AIAnalysisResponse)
async def explain_cluster(req: AIClusterAnalysisRequest):
    """
    Synthesize cluster health metrics, unready nodes, and warning events
    into human-readable AI diagnosis and proactive recommendations.
    """
    try:
        return await gemini_service.explain_cluster_health(req)
    except AIUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/explain-cluster/stream")
async def explain_cluster_stream(req: AIClusterAnalysisRequest):
    """Same as /explain-cluster, streamed as NDJSON events (meta, token..., done)."""
    return StreamingResponse(
        gemini_service.stream_cluster_health(req), media_type="application/x-ndjson", headers=STREAM_HEADERS
    )


@router.post("/analyze-incident", response_model=AIAnalysisResponse)
async def analyze_incident(req: AIPodIncidentRequest):
    """
    Perform deep incident root-cause analysis on failing or crashed pods
    combining container logs, events, and termination exit codes.
    """
    try:
        return await gemini_service.analyze_incident(req)
    except AIUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/analyze-incident/stream")
async def analyze_incident_stream(req: AIPodIncidentRequest):
    """Same as /analyze-incident, streamed as NDJSON events (meta, token..., done)."""
    return StreamingResponse(
        gemini_service.stream_incident(req), media_type="application/x-ndjson", headers=STREAM_HEADERS
    )
