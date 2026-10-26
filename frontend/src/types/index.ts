export type SubsystemStatus = 'healthy' | 'degraded' | 'unavailable' | 'checking_available' | 'configured';

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  environment: string;
  uptime_seconds: number;
  subsystems: {
    backend: SubsystemStatus;
    kubernetes: SubsystemStatus;
    prometheus: SubsystemStatus;
    database: SubsystemStatus;
  };
}

export interface KubernetesHealth {
  status: string;
  message: string;
  in_cluster: boolean;
  metrics_server?: boolean;
}

export interface PrometheusHealth {
  status: string;
  url: string;
  message: string;
}

export interface DatabaseHealth {
  status: string;
  type: string;
  message: string;
}

export interface NodeCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  kubelet_version: string;
  os_image: string;
  container_runtime: string;
  internal_ip: string;
  cpu_capacity: string;
  cpu_allocatable: string;
  memory_capacity: string;
  memory_allocatable: string;
  pods_count: number;
  conditions: NodeCondition[];
  labels: Record<string, string>;
  taints: Array<{ key: string; value: string; effect: string }>;
  created_at: string;
}

export interface ContainerStatusInfo {
  name: string;
  image: string;
  ready: boolean;
  restart_count: number;
  state: string;
  reason?: string;
  last_termination_reason?: string;
  last_exit_code?: number;
  last_termination_at?: string;
  started_at?: string;
}

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node_name?: string;
  pod_ip?: string;
  cpu_usage?: string;
  memory_usage?: string;
  age: string;
  created_at: string;
  labels: Record<string, string>;
  containers: ContainerStatusInfo[];
  controller?: string;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  desired_replicas: number;
  available_replicas: number;
  ready_replicas: number;
  updated_replicas: number;
  status: string;
  strategy: string;
  match_labels: Record<string, string>;
  created_at: string;
  images: string[];
}

export interface ServicePort {
  name?: string;
  protocol: string;
  port: number;
  target_port: any;
  node_port?: number;
}

export interface ServiceInfo {
  name: string;
  namespace: string;
  service_type: string;
  cluster_ip: string;
  external_ip?: string;
  ports: ServicePort[];
  selector: Record<string, string>;
  created_at: string;
}

export interface NamespaceInfo {
  name: string;
  status: string;
  pod_count: number;
  service_count: number;
  created_at: string;
}

export interface EventInfo {
  timestamp: string;
  namespace: string;
  event_type: string;
  reason: string;
  object_kind: string;
  object_name: string;
  message: string;
  count: number;
}

export interface ClusterOverview {
  cluster_name: string;
  server_version: string;
  status: string;
  node_count: number;
  ready_nodes: number;
  pod_count: number;
  running_pods: number;
  failed_pods: number;
  deployment_count: number;
  service_count: number;
  namespace_count: number;
  cpu_cores_total: number;
  cpu_cores_used: number;
  cpu_percent: number;
  memory_bytes_total: number;
  memory_bytes_used: number;
  memory_percent: number;
  restart_count_24h: number;
  usage_source: 'metrics-server' | 'requests';
}

export interface PodLogsResponse {
  namespace: string;
  pod_name: string;
  container_name?: string;
  logs: string[];
  total_lines: number;
}

export interface ClusterMetricsOverview {
  timestamps: string[];
  // null = no Prometheus sample for that time bucket
  cpu_usage_percent: (number | null)[];
  memory_usage_percent: (number | null)[];
  network_rx_kbps: (number | null)[];
  network_tx_kbps: (number | null)[];
  pod_restarts: (number | null)[];
  total_cpu_cores: number;
  used_cpu_cores: number;
  total_memory_gb: number;
  used_memory_gb: number;
  available: boolean;
  network_available: boolean;
  message: string | null;
}

export interface AlertRule {
  id: number;
  name: string;
  metric_type: string;
  condition: string;
  threshold: number;
  severity: string;
  duration_seconds: number;
  is_enabled: boolean;
  created_at: string;
}

export interface AlertEvent {
  id: number;
  rule_id?: number;
  rule_name: string;
  severity: string;
  message: string;
  target_resource: string;
  triggered_at: string;
  resolved_at?: string;
  is_resolved: boolean;
}

export interface AIAnalysisResponse {
  title: string;
  severity: string;
  summary: string;
  root_cause_analysis: string;
  recommendations: string[];
  suggested_commands: string[];
  model_used: string;
  timestamp: string;
}
