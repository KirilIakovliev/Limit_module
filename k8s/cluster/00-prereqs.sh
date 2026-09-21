#!/usr/bin/env bash
# ============================================================
# Подготовка узла перед kubeadm. Выполняется на КАЖДОМ узле.
# Всё, что здесь делается, kubeadm проверяет при запуске и
# отказывается работать, если что-то не так.
# ============================================================
set -euo pipefail

echo "== 1. swap выключить: kubelet не запускается при включённом swap"
swapoff -a
sed -i '/ swap / s/^/#/' /etc/fstab

echo "== 2. модули ядра для сети подов"
cat > /etc/modules-load.d/k8s.conf <<'MOD'
overlay
br_netfilter
MOD
modprobe overlay
modprobe br_netfilter

echo "== 3. параметры sysctl: трафик через мост должен проходить iptables"
cat > /etc/sysctl.d/k8s.conf <<'SYS'
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
SYS
sysctl --system >/dev/null

echo "== 4. containerd: SystemdCgroup обязателен"
# kubelet использует systemd-драйвер cgroup. Если containerd настроен
# иначе, поды будут падать с невнятной ошибкой при старте.
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
systemctl restart containerd
systemctl enable containerd

echo "== 5. проверка"
sysctl net.ipv4.ip_forward net.bridge.bridge-nf-call-iptables
grep -c 'SystemdCgroup = true' /etc/containerd/config.toml
systemctl is-active containerd
free -h | grep -i swap
echo "== узел готов к kubeadm"
