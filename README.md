
[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA Scroogebank Enterprise CRM
![AWS](https://img.shields.io/badge/AWS-Cloud%20Native-orange)
![Microservices](https://img.shields.io/badge/Architecture-Microservices-yellow)
![K8s](https://img.shields.io/badge/K8s-Kubernetes-blue)
![React](https://img.shields.io/badge/Frontend-React-63e5ff)
![Java](https://img.shields.io/badge/Backend-Springboot-green)
![Python](https://img.shields.io/badge/Backend-FastAPI-006666)
![Terraform](https://img.shields.io/badge/IaC-Terraform-purple)
--- 
> A cloud-native, microservices-based, and enterprise Customer Relationship Management (CRM) system for Scrooge Global Bank - developed as the flagship project for CS301 IT Solution Architecture (ITSA).

# Tech Stack (Simplified)
- Kubernetes (local kind, target AWS EKS)
- Terraform (IaC)
- React (frontend) + TypeScript + TailwindCSS
- Spring Boot (Java 21) + FastAPI (Python 3.12+)
- PostgreSQL, Helm, Docker

# Quickstart
```bash
python scripts/pipelines/setup_dev_env.py
```

# Prerequisites
- Docker Desktop (or Docker Engine)
- Git
- Java 21
- Node.js 22+
- Python 3.12+
- Make

# Local Access (Kind + NodePort)
- UI (ingress): `http://localhost:18080`
- API (ingress): `http://localhost:18080/api`
- Grafana: `http://localhost:18082` (admin/admin)
- Prometheus: `http://localhost:18083`
- Kubeview: `http://localhost:18081`
- Weave Scope: `http://localhost:18084`

# Observability (Local K8s)
Prometheus + Grafana + Weave Scope + Kubeview are installed during infra deploy.

# Database (Local Postgres)
- Host: `postgres-postgresql.dev.svc.cluster.local:5432`
- Database: `cs301`
- User: `cs301`
- Password: `cs301_local_dev_pw`
- Shared DB/User (project-wide): `crm` / `crm_app` / `crm_local_dev_pw`

# Docs
- Frontend overview: `docs/frontend/README.md`
