# Kubernetes Deployment

Deploy ihub server, Prometheus, and Grafana to a Kubernetes cluster.

## Prerequisites

- A Kubernetes cluster (1.24+)
- `kubectl` configured
- The `ihub-server` Docker image built and pushed to a registry

## Quick deploy

```bash
# Build and push the image
docker build -t ghcr.io/your-org/ihub-server:latest ..
docker push ghcr.io/your-org/ihub-server:latest

# Edit the deployment image
# k8s/deployment.yaml → spec.template.spec.containers[0].image

# Edit the secret
# k8s/secret.yaml → change admin password, add Slack/Auth0 keys

# Edit the ingress
# k8s/ingress.yaml → change host to your domain

# Deploy everything
kubectl apply -k .
```

## What gets deployed

| Resource | Description |
|----------|-------------|
| `Namespace` | `ihub` namespace |
| `ConfigMap` | Server config (`ihub.config.json`) |
| `Secret` | Admin credentials, Slack/Auth0 keys |
| `PVC` | 5Gi for SQLite database |
| `Deployment` | ihub server (1 replica, Recreate strategy) |
| `Service` | ClusterIP on port 80 |
| `Ingress` | External access (configure your domain) |
| `CronJob` | Daily backup at 2 AM (7-day retention) |
| `Prometheus` | Scrapes `/api/metrics` every 15s |
| `Grafana` | Dashboard auto-provisioned |

## Architecture notes

- **Single replica** — SQLite requires single-writer, so the deployment uses `Recreate` strategy
- **Persistent storage** — database lives on a PVC, survives pod restarts
- **Health checks** — liveness and readiness probes hit `/api/ping`
- **Prometheus annotations** — auto-discovered if your cluster has Prometheus Operator
- **Backups** — CronJob copies the DB file daily, keeps last 7

## Customization

### Enable TLS

Uncomment the `tls` section in `ingress.yaml` and ensure cert-manager is installed.

### Enable Slack

Add `SLACK_WEBHOOK_URL` to `secret.yaml` and set `slack.enabled: true` in `configmap.yaml`.

### Enable Auth0

Add `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID` to `secret.yaml` and set `auth0.enabled: true` in `configmap.yaml`.

### Scale monitoring

For production, consider using Prometheus Operator (ServiceMonitor) and a dedicated Grafana instance instead of the in-cluster ones.

## Teardown

```bash
kubectl delete -k .
```
