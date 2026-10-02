# Deployment

Здесь лежит всё, что относится к выкладке стенда.

```
deployment/
├── smoke-test.sh                health и поиск через kubectl exec
├── helm-chart/limitmodule       Helm-чарт: API, Service, Ingress, Job Alembic
└── nginx/limitmodule.conf       что положить в sites-available (вход :80)
```

Образ стенда: [`Dockerfile.prod`](../Dockerfile.prod) в корне `Limit_module/`.

Сборка и выкат: [docs/run-stand.md](../docs/run-stand.md).

```
наружный :80 -> nginx на хосте -> Traefik :30080 -> Service limitmodule -> pod :8000
```

```bash
helm lint deployment/helm-chart/limitmodule
helm template lm deployment/helm-chart/limitmodule \
  -f deployment/helm-chart/limitmodule/values-stand.yaml \
  --set postgresql.password=dummy
```

