# Kubernetes: образ и чарт

Выкат стенда и сборка образа: [docs/run-stand.md](../docs/run-stand.md). Сырых манифестов нет — Helm.

```
k8s/
├── Dockerfile.prod          Python 3.12-slim из Artifactory, pip оттуда же
└── scripts/04-smoke-test.sh health и поиск через kubectl exec в namespace limitmodule
```

Чарт: [`helm-chart/limitmodule/`](../helm-chart/limitmodule/). Стенд: `values-stand.yaml` (hostAliases на pdb51, Ingress Traefik без Middleware и без TLS).

```bash
helm lint helm-chart/limitmodule
helm template lm helm-chart/limitmodule -f helm-chart/limitmodule/values-stand.yaml --set postgresql.password=dummy
```
