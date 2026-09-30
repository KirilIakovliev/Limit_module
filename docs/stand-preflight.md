# Стенд t-lmts1-app51: что снять до Helm-чартов

Запускать **на хосте развёртывания** `t-lmts1-app51.base.akbars.ru`.  
Часть команд нужна `sudo` (nerdctl в namespace `k8s.io`).

Скопируйте блоки «ответ» в конец файла (раздел «Ответы со стенда») или пришлите выводом целиком.

Образ приложения **не пуллим из интернета**: его соберём на этой машине (`nerdctl --namespace k8s.io build`) и повесим тег так, чтобы kubelet видел его локально — как в LifecycleML: registry = имя хоста, `imagePullPolicy: IfNotPresent`, без pullSecret в Artifactory из кластера.

---

## 1. Версии инструментов

```bash
echo "===== HOST ====="
hostname -f
uname -a

echo "===== KUBERNETES ====="
kubectl version --client --output=yaml 2>/dev/null || kubectl version --client
kubectl version --output=yaml 2>/dev/null || kubectl version
kubectl get nodes -o wide
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.nodeInfo.kubeletVersion}{"\t"}{.status.nodeInfo.containerRuntimeVersion}{"\n"}{end}'
kubectl cluster-info

echo "===== HELM ====="
helm version
helm version --short

echo "===== NERDCTL / CONTAINERD / BUILDKIT ====="
nerdctl version
sudo nerdctl version
containerd --version 2>/dev/null || true
ctr version 2>/dev/null || sudo ctr version
systemctl is-active containerd 2>/dev/null || true
systemctl is-active buildkit 2>/dev/null || systemctl is-active buildkitd 2>/dev/null || true
buildkitd --version 2>/dev/null || true
buildctl debug info 2>/dev/null || sudo buildctl debug info 2>/dev/null || true
# как nerdctl ходит в buildkit
sudo nerdctl info 2>/dev/null | head -80

echo "===== KUBECTL CONTEXT ====="
kubectl config current-context
kubectl config view --minify
```

---

## 2. Что уже есть в кластере (компоненты для входа и сети)

Нам нужны: рабочий API Kubernetes, Helm 3, возможность собрать образ в `k8s.io`, Ingress (скорее Traefik, как в LifecycleML).  
Не нужны в чарте лимитного модуля: Redis, nginx, Postgres в кластере, Camunda, Grafana, Loki.

```bash
echo "===== INGRESS ====="
kubectl get ingressclass
kubectl get ns | grep -Ei 'traefik|ingress|kube-system'
kubectl -n kube-system get deploy,ds,svc 2>/dev/null | grep -Ei 'traefik|ingress|coredns' || true
kubectl get deploy,ds,svc -A 2>/dev/null | grep -Ei 'traefik|ingress' || true
# версия Traefik, если под есть
kubectl get pods -A -l app.kubernetes.io/name=traefik -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.spec.containers[0].image}{"\n"}{end}' 2>/dev/null
kubectl get pods -A | grep -i traefik

echo "===== CNI / NetworkPolicy ====="
kubectl get pods -n kube-system -o wide
ls /etc/cni/net.d 2>/dev/null || sudo ls /etc/cni/net.d 2>/dev/null || true

echo "===== StorageClass (нам PVC не обязателен: БД снаружи) ====="
kubectl get storageclass
```

---

## 3. Образы, которые нужны приложению

Сборка: `k8s/Dockerfile.prod` — сейчас `FROM python:3.12-slim`, pip из Artifactory, внутрь кладутся `api/` + `web/` + Alembic.

| Зачем | Что искать в Artifactory | Обязательно? |
|---|---|---|
| База сборки приложения (Python 3.12) | trustedimages, по образцу `.../trustedimages/alpine/node:20-abdt` | **да** |
| Зеркало PyPI (fastapi, uvicorn, psycopg, alembic, sqlalchemy) | `.../api/pypi/pypi/simple` или соседний pypi-репозиторий | **да** |
| Init-контейнер с `psql`/`pg_isready` (ждёт БД и `app.load_log`) | `postgres:16-alpine` или аналог в trustedimages | нет, если в чарте wait сделаем тем же образом приложения |
| Postgres в кластере | — | **нет** (БД `t-lmts1-pdb51`, пользователь `limitmodule_test`) |
| Redis / nginx | — | **нет** |

Ниже — кандидаты путей. Сработавший `pull` — тот, с которым потом соберём образ. Неуспешные оставьте в логе, не страшно.

Префикс банка (подставьте свой, если у вас другой репозиторий):

```text
artifactory.akbars.tech/common-docker-local/trustedimages/
```

Пример, который вы дали: `artifactory.akbars.tech/common-docker-local/trustedimages/alpine/node:20-abdt`

### 3.1. Логин в Artifactory (если pull без логина даёт 401)

```bash
# логин/пароль не коммитить; на стенде ввести вручную
sudo nerdctl login artifactory.akbars.tech
```

### 3.2. Проверка Python-образа (база Dockerfile)

```bash
NS=(sudo nerdctl --namespace k8s.io)

try_pull() {
  img="$1"
  echo "----- pull $img -----"
  sudo nerdctl --namespace k8s.io pull "$img" && echo "OK $img" || echo "FAIL $img"
}

# 1) как node, но python (самый вероятный стиль банка)
try_pull artifactory.akbars.tech/common-docker-local/trustedimages/alpine/python:3.12-abdt
try_pull artifactory.akbars.tech/common-docker-local/trustedimages/alpine/python:3.12
try_pull artifactory.akbars.tech/common-docker-local/trustedimages/python:3.12-slim-abdt
try_pull artifactory.akbars.tech/common-docker-local/trustedimages/python:3.12-slim
try_pull artifactory.akbars.tech/common-docker-local/trustedimages/python:3.12-abdt

# 2) docker-прокси Artifactory (как служебные образы в LifecycleML)
try_pull artifactory.akbars.tech/docker/library/python:3.12-slim
try_pull artifactory.akbars.tech/docker/python:3.12-slim

# если 3.12 нет — какие python теги вообще видны (нужен curl + логин, может 404)
echo "----- catalog hint (может не открыться без API-ключа) -----"
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://artifactory.akbars.tech/artifactory/api/docker/common-docker-local/v2/trustedimages/alpine/python/tags/list
```

Если ни один Python не ушёл: пришлите вывод `FAIL` и любой рабочий python-тег из UI Artifactory (как `node:20-abdt`).

### 3.3. Опционально: образ с клиентом Postgres (только если оставим initContainer как сейчас)

```bash
try_pull artifactory.akbars.tech/common-docker-local/trustedimages/alpine/postgres:16-abdt
try_pull artifactory.akbars.tech/docker/library/postgres:16-alpine
try_pull artifactory.akbars.tech/docker/postgres:16-alpine
```

### 3.4. Зеркало pip (сборка зависимостей внутри Dockerfile)

```bash
echo "----- pip index -----"
for u in \
  "https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple/fastapi/" \
  "https://artifactory.akbars.tech/artifactory/api/pypi/pypi-remote/simple/fastapi/" \
  "https://artifactory.akbars.tech/artifactory/api/pypi/pypi-virtual/simple/fastapi/"
do
  echo -n "$u -> "
  curl -sS -o /dev/null -w "%{http_code}\n" --max-time 15 "$u"
done
```

Рабочий URL (код 200) потом пойдёт в `--build-arg PIP_INDEX_URL=...`.

### 3.5. nerdctl видит namespace k8s.io (как LifecycleML)

```bash
echo "----- images in k8s.io (фрагмент) -----"
sudo nerdctl --namespace k8s.io images | head -40
```

После успешного pull Python:

```bash
# пример, подставьте тот образ, который OK
# sudo nerdctl --namespace k8s.io tag \
#   artifactory.akbars.tech/common-docker-local/trustedimages/alpine/python:3.12-abdt \
#   t-lmts1-app51/python:3.12
```

(Тег `t-lmts1-app51/...` — по той же схеме, что `p-lcml-app01/lifecycleml` в Helm LifecycleML. Точное имя registry в values согласуем после ваших ответов.)

---

## 4. Сеть до базы (с этой же машины)

```bash
echo "----- DNS / TCP до Postgres -----"
getent hosts t-lmts1-pdb51.base.akbars.ru || nslookup t-lmts1-pdb51.base.akbars.ru
nc -zv t-lmts1-pdb51.base.akbars.ru 5432 || timeout 5 bash -c 'echo >/dev/tcp/t-lmts1-pdb51.base.akbars.ru/5432' && echo "tcp 5432 open" || echo "tcp 5432 FAIL"
```

Пароль в эти команды не кладите.

---

## Что ещё нужно иметь (не версии, а факты)

- Доступ `kubectl` к кластеру **на этом хосте** (не «чистый кубер с нуля» — кластер уже есть).
- Helm 3, которым вы уже ставили LifecycleML (или тот же бинарь).
- nerdctl + buildkitd, сборка в `--namespace k8s.io`.
- IngressClass (ожидаем `traefik`) и как заходить снаружи: DNS на `t-lmts1-app51` / TLS secret / только HTTP.
- Кто создаёт namespace (мы или `helm --create-namespace`).
- Права на Artifactory **чтение** docker + pypi.
- Пароль `limitmodule_test` — в Secret, не в git.
- Домен или hostname Ingress для лимитного модуля (если ещё нет — напишите, сделаем как у LCML: hostname машины + additionalHosts).

Для чарта **не** планирую тащить: in-cluster Postgres, Redis, nginx, Camunda, Loki/Grafana.

---

## Ответы со стенда

Вставьте сюда сырой вывод или коротко по пунктам.

```
hostname:

kubectl server version:
kubectl client version:
kubelet / runtime на ноде:

helm version:

nerdctl version:
containerd version:
buildkitd / buildctl:

ingressclass:
traefik image (если есть):
CNI:

какой Python-образ OK (полная строка):
какой pip URL дал HTTP 200:
postgres-клиент образ OK (или «не тянули»):

nerdctl namespace k8s.io работает? (да/нет):
TCP 5432 до t-lmts1-pdb51: (да/нет):

Ingress hostname, который хотите для ЛМ:
TLS нужен? (да/нет, имя Secret если уже есть):

прочее:
```
