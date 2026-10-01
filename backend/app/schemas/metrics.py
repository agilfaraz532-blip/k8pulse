from typing import List, Optional
from pydantic import BaseModel


class MetricDataPoint(BaseModel):
    timestamp: float
    value: float


class MetricSeries(BaseModel):
    metric_name: str
    labels: dict = {}
    values: List[MetricDataPoint]


class ClusterMetricsOverview(BaseModel):
    timestamps: List[str]
    # None marks a gap where Prometheus has no sample
    cpu_usage_percent: List[Optional[float]]
    memory_usage_percent: List[Optional[float]]
    network_rx_kbps: List[Optional[float]]
    network_tx_kbps: List[Optional[float]]
    pod_restarts: List[Optional[int]]
    total_cpu_cores: float
    used_cpu_cores: float
    total_memory_gb: float
    used_memory_gb: float
    available: bool = True
    network_available: bool = True
    message: Optional[str] = None
