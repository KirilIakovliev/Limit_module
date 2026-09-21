# Kubernetes в закрытом контуре: пошаговое руководство

Свежий кластер v1.30.3, Traefik как ingress, перенос лимитного модуля
с Docker Compose.

Каждая команда разобрана: что делает, что должно получиться, что значит
ошибка. Скрипты в `scripts/` — для повторных развёртываний; в первый раз
имеет смысл пройти руками, чтобы понимать, где что лежит.

---

## 0. Условия задачи

| Условие | Следствие |
|---|---|
| Интернета на машине нет | базовые образы переносим файлами |
| Harbor — прав на запись нет | **свои образы никуда не публикуем**, собираем на месте и кладём прямо в containerd |
| Artifactory доступен **на чтение** | пакеты Python и Linux ставим оттуда, переносить файлами не нужно |
| Kubernetes 1.30.3 | версии образов и пакетов зафиксированы под неё |
| Helm недоступен | только `kubectl apply` с сырыми манифестами |

Отсюда схема работы:

```
машина с интернетом         закрытый контур
────────────────────        ─────────────────────────────────
docker pull 11 базовых  ──► ctr import на узлы
образов (~700 МБ)
                            kubeadm init ──► кластер
исходники проекта       ──► сборка образа приложения ЗДЕСЬ
(api/ web/ db/, 260 КБ)     (pip ставит пакеты из Artifactory)
                            kubectl apply ──► приложение
```

Образ приложения не переносится вообще — он рождается на месте. Это и требование
(в Harbor не запишешь), и удобство: правка кода не тянет за собой перенос
гигабайтных файлов.

---

## 1. Что меняется при переходе с Compose

Главная таблица. Слева — как было, справа — как стало и почему.

| Docker Compose | Kubernetes | Почему |
|---|---|---|
| `services: api` | `Deployment` + `Service` | под без состояния, реплики масштабируются |
| `services: db` | `StatefulSet` + headless `Service` | стабильное имя и привязка к тому; Deployment может поднять второй под на тот же каталог данных и повредить базу |
| `volumes: pgdata` | `PersistentVolume` + `PVC` | на свежем кластере StorageClass нет вообще — раздел 7.1 |
| `volumes: ./web`, `./db` | **вшито в образ** | узел не видит вашу рабочую папку |
| `environment:` | `ConfigMap` + `Secret` | пароли отдельно от настроек |
| `depends_on: service_healthy` | `initContainer` с `pg_isready` | в k8s нет ожидания готовности зависимости |
| `healthcheck:` | `readinessProbe` / `livenessProbe` | readiness решает про трафик, liveness про перезапуск |
| `ports: "8000:8000"` | `Service` + `Ingress` | наружу выходим только через Traefik |
| `profiles: full` (nginx) | Traefik | работу nginx делает ingress |
| `profiles: full` (redis) | **не переносим** | поиск ходит прямо в Postgres |

**В коде приложения менять ничего не нужно.** Всё читается из переменных
окружения, а `ensure_schema()` при старте приводит схему в порядок — одинаково
в Compose и в k8s. Отличается только Dockerfile.

---

## 2. Подготовка на машине с интернетом

### 2.1. Базовые образы

```bash
cd abb-limit-module
bash k8s/scripts/01-save-images.sh ./transfer
```

Скрипт тянет 11 образов из `k8s/images.txt`, режет каждый на куски по 190 МБ и
считает контрольные суммы. Ожидаемый объём — около 700 МБ:

```bash
du -sh transfer/images
ls transfer/images | head
```

В списке есть `python:3.12-slim` — он нужен как основа для сборки образа
приложения уже в контуре.

### 2.2. Манифест сети

```bash
curl -LO https://raw.githubusercontent.com/flannel-io/flannel/v0.25.5/Documentation/kube-flannel.yml
```

### 2.3. Пакеты kubeadm/kubelet/kubectl

**Скорее всего не нужны файлами.** Artifactory работает на чтение, значит
зеркала apt/dnf доступны прямо с машины — проверим в шаге 3.2. Скачивайте
пакеты заранее только если зеркала Kubernetes в Artifactory нет.

**Что перенести в контур:**

```
transfer/images/     базовые образы + SHA256SUMS
k8s/                 манифесты, скрипты, Dockerfile.prod
api/ web/ db/        исходники — из них соберётся образ приложения
kube-flannel.yml
```

---

## 3. Подготовка узлов — вручную, на каждом

### 3.1. Осмотреться

```bash
cat /etc/os-release          # какой дистрибутив
nproc                        # ядер: ≥2 на control-plane
free -h                      # памяти: ≥2 ГБ
df -h /var                   # места: ≥20 ГБ
hostname -I                  # адрес узла — понадобится в конфиге
```

Запишите адрес: он пойдёт в `advertiseAddress`, `node-ip` и `certSANs`.

Порты должны быть свободны:

```bash
ss -tlnp | grep -E ':(6443|2379|2380|10250|10259|10257)'
```

Пустой вывод — хорошо. Иначе kubeadm откажется работать на шаге 4.2.

### 3.2. Пакеты из Artifactory

Сначала убедитесь, что Artifactory отвечает:

```bash
curl -sI https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple/fastapi/ | head -1
```

`HTTP/1.1 200` — чтение работает.

Репозиторий Kubernetes обычно проксируется так (точное имя уточните у
инфраструктуры — оно зависит от настройки Artifactory):

```bash
cat <<'REPO' | sudo tee /etc/apt/sources.list.d/kubernetes.list
deb [trusted=yes] https://artifactory.akbars.tech/artifactory/kubernetes-apt/ /
REPO

sudo apt-get update
sudo apt-get install -y kubelet=1.30.3-1.1 kubeadm=1.30.3-1.1 kubectl=1.30.3-1.1 containerd.io
sudo apt-mark hold kubelet kubeadm kubectl
```

`apt-mark hold` обязателен: незапланированное обновление kubelet до версии, не
совпадающей с control-plane, ломает узел.

Проверка:

```bash
kubeadm version -o short     # v1.30.3
kubectl version --client
containerd --version
```

Зеркала Kubernetes в Artifactory нет — ставьте из перенесённых пакетов:
`sudo dpkg -i ./packages/*.deb`

### 3.3. Выключить swap

```bash
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
free -h | grep -i swap        # нули
```

**Зачем.** Kubelet отказывается стартовать при включённом swap: планировщик
исходит из того, что память у пода либо есть, либо нет, а swap делает это
различие размытым — под начинает тормозить вместо честного OOM. Правка
`/etc/fstab` нужна, чтобы swap не вернулся после перезагрузки.

### 3.4. Модули ядра

```bash
cat <<'MOD' | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
MOD

sudo modprobe overlay
sudo modprobe br_netfilter
lsmod | grep -E 'overlay|br_netfilter'     # оба в выводе
```

**Зачем.** `overlay` — файловая система, на которой containerd собирает слои
образов. `br_netfilter` пропускает трафик мостов через iptables — без него
kube-proxy не сможет управлять трафиком между подами.

### 3.5. Параметры сети

```bash
cat <<'SYS' | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
SYS

sudo sysctl --system >/dev/null
sysctl net.ipv4.ip_forward net.bridge.bridge-nf-call-iptables
```

Ожидается:

```
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
```

**Зачем.** `ip_forward` разрешает узлу пересылать чужие пакеты — без этого поды
не увидят друг друга между узлами. Два `bridge-nf-call-*` заставляют трафик
через мост проходить правила iptables, которыми kube-proxy реализует сервисы.

### 3.6. containerd: драйвер cgroup

Место, где спотыкаются чаще всего.

```bash
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml >/dev/null
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
grep -c 'SystemdCgroup = true' /etc/containerd/config.toml     # 1

sudo systemctl restart containerd
sudo systemctl enable containerd
sudo systemctl is-active containerd                            # active
sudo ctr version                                               # отвечает
```

**Зачем.** Kubelet по умолчанию использует systemd-драйвер cgroup. Если
containerd настроен на `cgroupfs`, у одних и тех же групп управления
оказывается два хозяина: поды падают при старте, а логи указывают куда угодно,
кроме настоящей причины.

---

## 4. Загрузка образов и инициализация кластера

### 4.1. Импорт базовых образов — на каждом узле

```bash
cd ~/transfer
sha256sum -c images/SHA256SUMS && echo "перенос целый"
```

Суммы не сошлись — перекладывайте файлы заново, чинить бесполезно.

```bash
cd images
for base in $(ls | sed -n 's/\.part_.*$//p' | sort -u); do
    echo "-- $base"
    cat "${base}.part_"* > "/tmp/${base}"
    sudo ctr -n k8s.io images import "/tmp/${base}"
    rm -f "/tmp/${base}"
done
```

Или одной командой: `bash k8s/scripts/02-load-images.sh ./images`

```bash
sudo ctr -n k8s.io images list -q | sort      # должны быть все 11
```

**Ключевой момент всего руководства.** Импорт идёт через `ctr -n k8s.io`, а не
`docker load`. Kubelet работает с containerd и хранилища Docker не видит:
`docker load` оставит под в `ImagePullBackOff` при формально загруженном
образе. Пространство имён `k8s.io` — именно то, откуда kubelet берёт образы.

Убедиться, что kubeadm ничего не станет тянуть:

```bash
kubeadm config images list --kubernetes-version v1.30.3
```

Каждая строка вывода должна быть в списке `ctr images list`.

### 4.2. Инициализация control-plane

Отредактируйте `k8s/cluster/kubeadm-config.yaml` — три места:
`advertiseAddress`, `node-ip`, `certSANs`.

```bash
sudo kubeadm init --config k8s/cluster/kubeadm-config.yaml --upload-certs
```

Команда идёт фазами, и по выводу видно, где она находится:

| Фаза | Что делает |
|---|---|
| `preflight` | проверяет swap, порты, драйвер cgroup, наличие образов |
| `certs` | выпускает центр сертификации кластера и сертификаты компонентов |
| `kubeconfig` | создаёт файлы доступа: `admin.conf`, `kubelet.conf` и другие |
| `kubelet-start` | пишет конфиг kubelet и запускает службу |
| `control-plane` | манифесты статических подов apiserver/controller-manager/scheduler |
| `etcd` | манифест статического пода etcd |
| `wait-control-plane` | ждёт, пока apiserver ответит |
| `upload-config` | кладёт конфигурацию в ConfigMap внутри кластера |
| `mark-control-plane` | ставит метку и taint на узел |
| `bootstrap-token` | создаёт токен для присоединения узлов |
| `addons` | CoreDNS и kube-proxy |

В конце выводится команда `kubeadm join ...` — **сохраните её**: она нужна для
рабочих узлов, а токен живёт 24 часа.

Ругань на `preflight` почти всегда из раздела 3: swap, порты, cgroup или
отсутствующий образ.

### 4.3. Доступ kubectl

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

kubectl get nodes
```

Ожидается:

```
NAME         STATUS     ROLES           AGE   VERSION
k8s-node-1   NotReady   control-plane   1m    v1.30.3
```

**`NotReady` — это правильно.** Сети ещё нет, и kubelet честно сообщает, что
принимать поды не готов.

```bash
kubectl -n kube-system get pods
```

CoreDNS будет в `Pending` — ему некуда встать без сети. Остальные `Running`.

### 4.4. Сеть

```bash
kubectl apply -f kube-flannel.yml
kubectl -n kube-flannel get pods -w        # ждём Running, затем Ctrl+C
kubectl get nodes                          # теперь Ready
kubectl -n kube-system get pods            # CoreDNS поднялся
```

Меняли `podSubnet` в kubeadm-config — поменяйте и в `kube-flannel.yml` (поле
`Network` в ConfigMap). Рассогласование даёт поды без сети, которые при этом
выглядят здоровыми: самая неприятная разновидность поломки.

### 4.5. Рабочие узлы

На каждом повторите разделы 3 и 4.1, затем выполните сохранённую команду
`kubeadm join`. Если токен истёк:

```bash
kubeadm token create --print-join-command     # на control-plane
```

### 4.6. Одноузловой кластер

По умолчанию на control-plane обычные поды не планируются. Для теста на одной
машине снимите ограничение, иначе приложение зависнет в `Pending`:

```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

### 4.7. Проверка кластера

```bash
kubectl get nodes -o wide
kubectl -n kube-system get pods
kubectl get --raw='/readyz?verbose' | tail -5
```

Проверка DNS изнутри — пригодится и при диагностике:

```bash
kubectl run dns-test --rm -it --restart=Never --image=python:3.12-slim \
  --overrides='{"spec":{"containers":[{"name":"dns-test","image":"python:3.12-slim","imagePullPolicy":"IfNotPresent","command":["getent","hosts","kubernetes.default.svc.cluster.local"]}]}}'
```

Адрес вида `10.96.0.1` — DNS работает.

---

## 5. Traefik

```bash
kubectl apply -f k8s/traefik/00-namespace.yaml
kubectl apply -f k8s/traefik/01-rbac.yaml
kubectl apply -f k8s/traefik/02-ingressclass.yaml
kubectl apply -f k8s/traefik/03-configmap.yaml
kubectl apply -f k8s/traefik/04-deployment.yaml
kubectl apply -f k8s/traefik/05-service.yaml

kubectl -n traefik rollout status deploy/traefik
kubectl -n traefik get pods,svc
```

**Решение, которое стоит понимать.** Traefik настроен на провайдер
`kubernetesIngress`, а не `kubernetesCRD`. CRD Traefik — отдельный файл на
~200 КБ, который пришлось бы переносить в контур и синхронизировать с версией
при каждом обновлении. Обычный `Ingress` покрывает задачу целиком: один хост,
один путь, никаких middleware.

Дашборд наружу не публикуется:

```bash
kubectl -n traefik port-forward deploy/traefik 9000:9000
# http://localhost:9000/dashboard/
```

---

## 6. Сборка образа приложения на месте

### 6.1. Чем собирать

```bash
command -v nerdctl docker buildah
```

| Инструмент | Комментарий |
|---|---|
| **nerdctl** | предпочтительно: работает поверх уже установленного containerd, отдельный демон не нужен, собирает сразу в namespace `k8s.io` |
| **docker** | тоже годится, но собирает в своё хранилище — нужен отдельный шаг переноса |
| **buildah** | без демона, собирает в OCI-архив |

Нет ничего — nerdctl обычно есть в Artifactory и не требует Docker.

### 6.2. Проверить зеркало пакетов

```bash
curl -sI https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple/fastapi/ | head -1
```

Точный путь зависит от имени репозитория (`pypi`, `pypi-remote`,
`pypi-virtual`). Уточните у инфраструктуры — он понадобится дальше.

### 6.3. Собрать

```bash
cd ~/abb-limit-module
PIP_INDEX_URL=https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple \
bash k8s/scripts/03-build-app-image.sh 0.2.0
```

Скрипт определит инструмент, соберёт образ и положит его в namespace `k8s.io`.
Вручную то же самое:

```bash
# nerdctl — собирает прямо туда, откуда берёт kubelet
sudo nerdctl --namespace k8s.io build \
  --build-arg PIP_INDEX_URL=https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple \
  --build-arg PIP_TRUSTED_HOST=artifactory.akbars.tech \
  -f k8s/Dockerfile.prod -t abb-limit-module:0.2.0 .

# docker — нужен перенос в containerd
docker build \
  --build-arg PIP_INDEX_URL=https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple \
  --build-arg PIP_TRUSTED_HOST=artifactory.akbars.tech \
  -f k8s/Dockerfile.prod -t abb-limit-module:0.2.0 .
docker save abb-limit-module:0.2.0 | sudo ctr -n k8s.io images import -
```

Проверка — без неё под не запустится:

```bash
sudo ctr -n k8s.io images list -q | grep abb-limit-module
```

**Если узлов несколько**, образ нужен на каждом, где может оказаться под.
Либо собрать везде, либо собрать один раз и разнести файлом:

```bash
sudo ctr -n k8s.io images export /tmp/abb.tar abb-limit-module:0.2.0
# перенести на остальные узлы
sudo ctr -n k8s.io images import /tmp/abb.tar
```

Альтернатива для многоузлового кластера — `nodeSelector` в `06-api.yaml`,
чтобы поды шли только на узел с образом. Для теста проще, для прода —
костыль.

### 6.4. Запасной вариант: без сборки вообще

Инструмента сборки нет и поставить нельзя — приложение можно поднять на
стоковом `python:3.12-slim`: исходники занимают 260 КБ и помещаются в
ConfigMap, а зависимости ставит initContainer через pip из Artifactory.

Схема рабочая, но с оговорками: старт пода дольше (pip отрабатывает при каждом
запуске), а ConfigMap приходится пересобирать после каждой правки кода. Как
временное решение годится, как постоянное — нет. Скажите, если понадобится,
подготовлю манифесты.

---

## 7. Приложение

### 7.1. Хранилище — сделать до всего остального

На свежем кластере `kubeadm` **StorageClass отсутствует**. PVC останется в
`Pending` навсегда, под с базой не запустится. Самая частая причина «ничего не
работает» при первом развёртывании.

На узле, где будет жить база:

```bash
sudo mkdir -p /var/lib/abb-pgdata
sudo chown 999:999 /var/lib/abb-pgdata    # postgres в образе — uid/gid 999
sudo chmod 700 /var/lib/abb-pgdata
```

`chown` обязателен: каталог, созданный root-ом, недоступен процессу postgres на
запись, и `initdb` падает с `could not create directory`.

Имя узла подставьте в `k8s/app/04-postgres-storage.yaml`:

```bash
kubectl get nodes -o name
```

Минус подхода честный: база привязана к одному узлу, при его потере данные
теряются. Для теста приемлемо; для прода нужен настоящий StorageClass.

### 7.2. Пароли

В `k8s/app/01-secret.yaml` заменить `ЗАМЕНИТЬ_ПЕРЕД_РАЗВЁРТЫВАНИЕМ` —
**в двух местах**: `POSTGRES_PASSWORD` и внутри `DATABASE_URL`.

Secret в Kubernetes — это base64, а не шифрование: любой, кто может читать
секреты в namespace, прочитает пароль.

### 7.3. Миграции в ConfigMap

```bash
bash k8s/app/generate-initdb.sh
```

В Compose каталог `db/` монтировался в `/docker-entrypoint-initdb.d` напрямую.
Тома с рабочей папки в кластере нет, поэтому SQL кладётся в ConfigMap: 40 КБ
при лимите etcd в 1 МиБ.

### 7.4. Применить

Порядок важен: сначала то, на что ссылаются остальные манифесты.

```bash
kubectl apply -f k8s/app/00-namespace.yaml
kubectl apply -f k8s/app/01-secret.yaml
kubectl apply -f k8s/app/02-configmap.yaml
kubectl apply -f k8s/app/03-initdb-configmap.yaml
kubectl apply -f k8s/app/04-postgres-storage.yaml
kubectl apply -f k8s/app/05-postgres.yaml

kubectl -n abb rollout status statefulset/abb-postgres --timeout=300s
```

Дождитесь базы, потом API:

```bash
kubectl apply -f k8s/app/06-api.yaml
kubectl apply -f k8s/app/07-ingress.yaml

kubectl -n abb rollout status deploy/abb-api
```

### 7.5. Проверить

```bash
bash k8s/scripts/04-smoke-test.sh
```

Шесть проверок, каждая про свой слой: поды, база, схема (28 компаний), API
изнутри, поиск с кириллицей, Traefik снаружи.

Вручную:

```bash
kubectl -n abb get pods,svc,ingress
kubectl -n abb exec statefulset/abb-postgres -- psql -U abb -d abb -tAc "SELECT count(*) FROM companies;"
curl -s http://<IP-узла>:30080/api/health
```

Браузер: `http://<IP-узла>:30080/`

Для доступа по имени добавьте в `/etc/hosts` на рабочей машине:

```
10.149.35.70   abb.local
```

---

## 8. Сетевые политики

Применять **после** того, как всё заработало.

```bash
kubectl apply -f k8s/app/08-networkpolicy.yaml
```

Flannel не поддерживает NetworkPolicy: манифесты применятся, но ничего не
ограничат. Для реального ограничения нужен Calico или Cilium — решение
принимается на шаге 4.4, менять CNI потом больно.

---

## 9. Обновление приложения

```bash
cd ~/abb-limit-module
# перенесите изменённые исходники
PIP_INDEX_URL=... bash k8s/scripts/03-build-app-image.sh 0.2.1

kubectl -n abb set image deploy/abb-api api=abb-limit-module:0.2.1
kubectl -n abb rollout status deploy/abb-api
```

**Всегда меняйте тег.** С `latest` и `imagePullPolicy: IfNotPresent` кластер
продолжит использовать старый слой, и вы будете гадать, почему правки не видны —
ровно тот же класс ошибки, что кэш браузера в Compose-версии.

Откат:

```bash
kubectl -n abb rollout undo deploy/abb-api
```

---

## 10. Резервное копирование

Данные живут только в PV.

```bash
kubectl -n abb exec statefulset/abb-postgres -- \
    pg_dump -U abb -d abb --format=custom > abb-$(date +%F).dump

kubectl -n abb exec -i statefulset/abb-postgres -- \
    pg_restore -U abb -d abb --clean --if-exists < abb-2026-09-16.dump
```

Проверьте восстановление хотя бы раз: копия, которую не восстанавливали,
копией не является.

---

## 11. Диагностика

### 11.1. Под не стартует

```bash
kubectl -n abb get pods
kubectl -n abb describe pod <имя>        # Events внизу — самое полезное
kubectl -n abb logs <имя> --previous     # логи упавшего экземпляра
```

| Статус | Причина | Что делать |
|---|---|---|
| `ImagePullBackOff` | образа нет в namespace `k8s.io` | `sudo ctr -n k8s.io images list \| grep abb`; раздел 6.3 |
| `ImagePullBackOff` на части узлов | образ собран только на одном узле | экспорт/импорт или `nodeSelector`; раздел 6.3 |
| `Pending` | нет ресурсов или PVC не связан | `kubectl get pv,pvc -n abb`; раздел 7.1 |
| `CrashLoopBackOff` | приложение падает при старте | `kubectl logs --previous`, чаще всего база |
| `CrashLoopBackOff` у Postgres | `could not create directory` | каталог PV принадлежит root — `chown 999:999`, раздел 7.1 |
| `Init:0/1` | initContainer ждёт базу | так задумано; висит дольше минуты — смотрите под базы |

### 11.2. Сборка падает на pip

```
ERROR: Could not find a version that satisfies the requirement fastapi==0.115.6
```

Зеркало недоступно или путь неверный:

```bash
curl -sI https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple/fastapi/
```

`404` — неверное имя репозитория, уточните у инфраструктуры.
Таймаут — нет сетевого доступа с этой машины до Artifactory.

### 11.3. PVC в Pending

```bash
kubectl -n abb describe pvc pgdata-abb-postgres-0
```

`no persistent volumes available` — PV не создан или не подходит по
`storageClassName`/`nodeAffinity`. Раздел 7.1.

### 11.4. Ingress не отвечает

Проверять снизу вверх:

```bash
kubectl -n abb get pods -l app=abb-api                  # 1. под жив?
kubectl -n abb get endpoints abb-api                    # 2. сервис нашёл поды?
kubectl -n traefik logs deploy/traefik | grep -i abb    # 3. Traefik увидел правило?
ss -tlnp | grep 30080                                   # 4. NodePort слушает?
```

Пустой `Endpoints` почти всегда означает несовпадение `selector` в Service и
`labels` пода.

### 11.5. Перебои DNS

В этом контуре такое уже наблюдалось. Как отличить от проблемы приложения:

```bash
kubectl -n abb exec deploy/abb-api -- getent hosts abb-postgres
kubectl -n abb exec deploy/abb-api -- getent hosts kubernetes.default.svc.cluster.local
```

Второе имя есть в любом рабочем кластере. Не резолвится — дело в DNS:

```bash
kubectl -n kube-system get pods -l k8s-app=kube-dns
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=50
```

### 11.6. База поднялась, но таблиц нет

Та же ловушка, что в Compose: скрипты из `/docker-entrypoint-initdb.d`
выполняются **только при инициализации пустого тома**.

```bash
kubectl -n abb exec statefulset/abb-postgres -- psql -U abb -d abb -c '\dt'
```

Пусто — накатите базовую схему вручную:

```bash
kubectl -n abb exec -i statefulset/abb-postgres -- psql -U abb -d abb < db/01_schema.sql
```

Миграции 03–06 применит сам API при старте (`ensure_schema`), базовую схему — нет.

---

## 12. Перед реальной эксплуатацией

1. **Аутентификация.** Её нет вообще: приложение доступно любому, кто знает
   адрес и порт.
2. **Удалить демо-данные** — `web/js/demo-data.js` и `withFallback` в `api.js`.
   В закрытом контуре подмена ошибки выдуманными цифрами опаснее, чем в
   разработке.
3. **Пароли** из Secret — в Vault или Sealed Secrets.
4. **TLS**: сейчас только HTTP.
5. **Реальный StorageClass** вместо PV на узле.
6. **Calico вместо Flannel**, если нужны NetworkPolicy.
7. **Резервное копирование по расписанию** — `CronJob` с `pg_dump`.
8. **Мониторинг** — хотя бы внешняя проверка `/api/health`.

---

## 13. Файлы

```
k8s/
├── README.md                    это руководство
├── Dockerfile.prod              образ приложения, pip из Artifactory
├── images.txt                   11 базовых образов с версиями
├── scripts/
│   ├── 01-save-images.sh        интернет: скачать и нарезать базовые образы
│   ├── 02-load-images.sh        узел: проверить суммы и импортировать
│   ├── 03-build-app-image.sh    тестовая машина: собрать образ приложения
│   └── 04-smoke-test.sh         шесть проверок после развёртывания
├── cluster/
│   ├── 00-prereqs.sh            разделы 3.3–3.6 одной командой
│   └── kubeadm-config.yaml      ПОДСТАВИТЬ адреса
├── traefik/
│   ├── 00-namespace.yaml
│   ├── 01-rbac.yaml
│   ├── 02-ingressclass.yaml
│   ├── 03-configmap.yaml        провайдер kubernetesIngress, без CRD
│   ├── 04-deployment.yaml
│   └── 05-service.yaml          NodePort 30080/30443
└── app/
    ├── 00-namespace.yaml
    ├── 01-secret.yaml           ЗАМЕНИТЬ пароль в двух местах
    ├── 02-configmap.yaml
    ├── 03-initdb-configmap.yaml СГЕНЕРИРОВАН, не править руками
    ├── 04-postgres-storage.yaml ПОДСТАВИТЬ имя узла
    ├── 05-postgres.yaml
    ├── 06-api.yaml              ПОДСТАВИТЬ тег при обновлении
    ├── 07-ingress.yaml          ПОДСТАВИТЬ хост
    ├── 08-networkpolicy.yaml    применять после отладки
    └── generate-initdb.sh
```

| Файл | Что подставить |
|---|---|
| `cluster/kubeadm-config.yaml` | `advertiseAddress`, `node-ip`, `certSANs` |
| `app/01-secret.yaml` | пароль — в двух местах |
| `app/04-postgres-storage.yaml` | имя узла в `nodeAffinity` |
| `app/07-ingress.yaml` | `host: abb.local` |
| скрипт сборки | путь к зеркалу PyPI в Artifactory |
