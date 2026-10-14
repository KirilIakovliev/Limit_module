# Сборка React для стенда. Контекст — корень Limit_module.
# Образ только собирает /app/dist. Nginx на стенде уже стоит на хосте.
# Токен Artifactory в git не хранится. Если репозиторий закрыт, передать
# пользовательский ~/.npmrc секретом: --secret id=npmrc,src=$HOME/.npmrc
FROM artifactory.akbars.tech/common-docker-local/trustedimages/alpine/node:20-abdt
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN --mount=type=secret,id=npmrc,required=false,target=/root/.npmrc npm ci
COPY frontend/ ./
RUN npm run build
