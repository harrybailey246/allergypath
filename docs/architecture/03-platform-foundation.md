# Platform Foundation

## Cloud Provider Selection
- **Primary Provider:** Amazon Web Services (AWS) is selected for its mature managed services, global footprint, and rich ecosystem of tooling and community knowledge.
- **Core Regions:** `us-east-1` as the primary region and `us-west-2` for disaster recovery and latency-sensitive workloads targeting the west coast.
- **Account Structure:** Landing zone with separate AWS accounts for shared services, development, staging, and production. AWS Organizations and Control Tower (or Landing Zone Accelerator) will enforce guardrails and centralized billing.

## Environment Topology
- **Development:** Ephemeral preview environments provisioned per feature branch using IaC pipelines, plus a shared dev account for integration testing. Lower cost instance classes and spot usage encouraged.
- **Staging:** Long-lived staging account mirroring production configuration for release validation, performance testing, and security scans. Feature flags allow safe toggles before production deploys.
- **Production:** Highly available multi-AZ deployments with auto-scaling groups, managed database services, and disaster recovery replication to `us-west-2`. Change management gated by automated checks and manual approval steps.

## Networking Strategy
- **VPC Design:** Hub-and-spoke model with a shared services VPC hosting transit gateway, CI/CD runners, and shared data stores. Each environment account contains application VPCs peered via Transit Gateway.
- **Segmentation:** Public subnets for ingress (ALBs, API Gateways), private subnets for app services, and isolated subnets for data tiers with strict security groups and NACLs.
- **Connectivity:** AWS Direct Connect or Site-to-Site VPN for corporate access, AWS PrivateLink for third-party SaaS integrations, and CloudFront for edge caching.
- **DNS & Certificate Management:** Amazon Route 53 for DNS, AWS Certificate Manager for TLS certificates, with automation integrated into IaC pipelines.

## Secrets Management
- **Secret Stores:** AWS Secrets Manager for application secrets and database credentials; AWS Systems Manager Parameter Store for configuration parameters.
- **Rotation:** Automated rotation via Lambda functions or native integrations (e.g., RDS). Secrets distributed to workloads through IAM roles and injected at runtime (no secrets in code or CI logs).
- **Access Control:** Least-privilege IAM policies managed through infrastructure code, enforced via service control policies and continuous audits.

## Observability Stack
- **Logging:** Centralized structured logging with AWS CloudWatch Logs and Kinesis Firehose forwarding to Amazon OpenSearch for querying and retention policies.
- **Metrics:** Amazon CloudWatch metrics augmented with Prometheus-compatible scraping (Amazon Managed Prometheus) and visualized through Amazon Managed Grafana dashboards.
- **Tracing:** AWS X-Ray for distributed tracing with integration into service frameworks.
- **Alerting:** PagerDuty/SNS integrations for critical alerts, Slack notifications for non-critical events, with runbooks maintained in the docs repository.

## Infrastructure-as-Code Approach
- **Primary Tooling:** Terraform with a modular structure adopting the AWS Cloud Control Provider and community modules vetted for security.
- **State Management:** Remote state stored in S3 with DynamoDB table for state locking. Workspaces separate environment states (dev/staging/prod).
- **Module Strategy:** `platform-modules` repository hosting reusable Terraform modules (networking, IAM baselines, observability). Service-specific modules reside with their respective codebases.
- **Pipelines:** Terraform executed via GitHub Actions runners in the shared services account using OIDC federation to assume deployment roles.

### Repository Layout
- **`infrastructure/` Monorepo:** Houses environment stacks (e.g., `env/dev`, `env/staging`, `env/prod`) referencing shared modules, along with pipeline definitions and documentation.
- **`platform-modules/`:** Dedicated repository for versioned Terraform modules consumed across environments and services.
- **Service Repositories:** Each microservice or application keeps its own repository (`services/<service-name>`). Shared application libraries live in a `libs/` organization repo with versioned releases (npm/PyPI packages as applicable).
- **Documentation:** Architectural decision records and runbooks maintained in `docs/` within the main organization knowledge base repo.

## Authentication & Authorization Baseline
- **Identity Provider:** Okta chosen for enterprise SSO, SCIM provisioning, and integration with workforce identity governance.
- **Workforce Access:** Okta groups map to AWS IAM Identity Center permission sets, granting console and CLI access via SSO. MFA enforced globally.
- **Application Auth:** Customer-facing applications integrate with Auth0 (Okta Customer Identity Cloud) for OAuth 2.0 / OIDC flows, social logins, and progressive profiling.
- **RBAC Model:** Role-based access defined via domain-specific roles (e.g., `clinic_admin`, `allergist`, `patient`). Roles map to fine-grained permissions stored in a policy service and enforced via JWT claims. Administrative APIs require scoped machine-to-machine tokens.
- **Secrets & Certificates:** IdP signing keys rotated per policy, stored in Secrets Manager, and distributed via secure channels to applications and CI/CD pipelines.

## CI/CD Requirements
- **Version Control:** GitHub with protected main branches, mandatory pull request reviews, and status checks.
- **Build & Deploy Pipelines:** GitHub Actions executing linting, unit/integration tests, IaC plans, container builds, and deployments. Production deploys require manual approval and automated change management logging.
- **Security Gates:** SAST (e.g., GitHub Advanced Security), dependency scanning (Dependabot), container image scanning (ECR), and IaC policy checks (OPA/Conftest) integrated into pipelines.
- **Artifact Management:** Docker images stored in Amazon ECR, Terraform module artifacts versioned via Git tags/releases, and application packages stored in artifact repositories (npm, PyPI, Maven).

## Blockers & Procurement Tasks
- Provisioning of AWS Organizations with Control Tower baseline (may require AWS support engagement).
- Okta/Okta CIC licensing and procurement, including dedicated sandbox tenants.
- Purchase and integration of PagerDuty accounts and alert routing policies.
- Contracting for managed logging/observability tooling (Amazon Managed Grafana/Prometheus pricing approvals).
- Establishing Direct Connect circuits or VPN agreements with corporate network providers if required.
