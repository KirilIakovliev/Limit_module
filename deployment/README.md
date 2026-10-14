# Deployment

Выкладка тестового стенда. Nginx в Kubernetes не добавляется: он уже стоит на хосте.

```
deployment/
├── helm-chart/limitmodule       Helm: один контейнер API, Service, Ingress, Job Alembic
└── nginx/limitmodule.conf       host nginx, sites-available
```

```
browser :80
  → nginx на хосте (limitmodule.conf)
       /api /docs /redoc /openapi.json → Traefik :30080 → pod API :8000
       /old-prototype/* → /var/www/limitmodule/old-prototype
       /* → /var/www/limitmodule/app
  → Postgres на t-lmts1-pdb51, не в кластере
```

Backend: [`Dockerfile.prod`](../Dockerfile.prod). Base image и pip — Artifactory. В образе нет React, legacy и nginx.

Frontend: [`frontend/Dockerfile`](../frontend/Dockerfile). Node image Artifactory, `npm ci` через Artifactory, результат `/app/dist`. На стенд копируется в `/var/www/limitmodule/app`. Legacy — в `/var/www/limitmodule/old-prototype`.

Сборка и выкат: [docs/run-stand.md](../docs/run-stand.md).

```bash
helm lint deployment/helm-chart/limitmodule
helm template lm deployment/helm-chart/limitmodule \
  -f deployment/helm-chart/limitmodule/values-stand.yaml \
  --set postgresql.password=dummy
```
