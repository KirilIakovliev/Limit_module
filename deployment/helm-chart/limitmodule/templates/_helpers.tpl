{{- define "limitmodule.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "limitmodule.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "limitmodule.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "limitmodule.labels" -}}
helm.sh/chart: {{ include "limitmodule.chart" . }}
app.kubernetes.io/name: {{ include "limitmodule.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "limitmodule.selectorLabels" -}}
app.kubernetes.io/name: {{ include "limitmodule.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app: {{ include "limitmodule.name" . }}
{{- end }}

{{- define "limitmodule.image" -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end }}
