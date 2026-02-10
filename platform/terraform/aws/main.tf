terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.29"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

###############################################################################
# Networking (VPC)
###############################################################################

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc"
  cidr = var.vpc_cidr

  azs             = var.azs
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Project = var.project_name
  }
}

###############################################################################
# EKS Cluster
###############################################################################

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  enable_irsa = true

  eks_managed_node_groups = {
    default = {
      desired_size = 2
      min_size     = 1
      max_size     = 3

      instance_types = ["t3.medium"]
      capacity_type  = "ON_DEMAND"
    }
  }

  tags = {
    Project = var.project_name
  }
}

data "aws_eks_cluster" "this" {
  name = module.eks.cluster_name
}

data "aws_eks_cluster_auth" "this" {
  name = module.eks.cluster_name
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.this.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.this.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.this.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.this.token
  }
}

###############################################################################
# Core cluster add-ons via Helm
###############################################################################

resource "helm_release" "ingress_nginx" {
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = "ingress-nginx"

  create_namespace = true

  # Reuse local values but you may want a separate values file for AWS.
  values = [
    file("${path.module}/../../k8s/infra/helm-values/ingress-nginx-values.yaml")
  ]

  depends_on = [module.eks]
}

resource "helm_release" "postgres" {
  name       = "postgres"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "postgresql"
  namespace  = "dev"

  create_namespace = true

  values = [
    file("${path.module}/../../k8s/infra/helm-values/postgresql-values.yaml")
  ]

  depends_on = [module.eks]
}

resource "helm_release" "kube_prometheus_stack" {
  name       = "kube-prometheus-stack"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  namespace  = "observability"

  create_namespace = true

  values = [
    file("${path.module}/../../k8s/infra/helm-values/kube-prometheus-stack-values.yaml")
  ]

  depends_on = [module.eks]
}

resource "helm_release" "kubeview" {
  name       = "kubeview"
  repository = "https://benc-uk.github.io/kubeview"
  chart      = "kubeview"
  namespace  = "observability"

  create_namespace = true

  values = [
    file("${path.module}/../../k8s/infra/helm-values/kubeview-values.yaml")
  ]

  depends_on = [module.eks]
}

###############################################################################
# Optional: deploy KubeDeez app manifests with kubectl
###############################################################################

resource "null_resource" "deploy_kubedez" {
  provisioner "local-exec" {
    command = <<EOT
aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region}
kubectl apply -k ${path.module}/../../k8s/apps/base
EOT
  }

  triggers = {
    cluster = module.eks.cluster_name
  }

  depends_on = [
    module.eks,
    helm_release.ingress_nginx,
    helm_release.postgres,
    helm_release.kube_prometheus_stack,
    helm_release.kubeview
  ]
}

