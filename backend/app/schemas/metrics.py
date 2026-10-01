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
    cpu_usage_percent: List[float]
    memory_usage_percent: List[float]
    network_rx_kbps: List[float]
    network_tx_kbps: List[float]
    pod_restarts: List[int]
    total_cpu_cores: float
    used_cpu_cores: float
    total_memory_gb: float
    used_memory_gb: float
