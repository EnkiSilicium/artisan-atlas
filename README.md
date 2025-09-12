# Artisan Atlas — Architecture and Implementation Overview

>Doc status: Work In Progress. Will be added: code references, ADRs, demos.

## Abstract
**Artisan Atlas** is a commissions marketplace for handmade work. The product goal is trust and clarity in a poorly explored market. Architecture is event-driven microservices with strong correctness in the core workflow and easy evolution around it.

Implemented services:
1. [**Order-service**](apps/order-service/src/app/order-workflow/) — It hosts a **typed state machine** that guarantees workflow correctness and acts as the authoritative source of order data. The design emphasizes stability, data integrity, and robust error handling with graceful-degradation modes.
2. [**Bonus-service**](apps/bonus-service/src/app/modules/bonus-processor/) — event consumer that awards points under a versioned **bonus policy**. It derives lifetime **grades** and a **N-days-rolling-window VIP** status. This area is intentionally easy to evolve.


## Technical TL;DR
- **Atomicity boundary:** UnitOfWork + transactional outbox; events publish **after** commit ([UoW code](libs/persistence/src/lib/unit-of-work/typeorm.uow.ts)).  
- **Concurrency:** optimistic via `version`; losing attempts don’t leak side effects. ([update code](libs/persistence/src/lib/write-commands/update-optimistic.write-command.ts)).
- **Events:** global `eventId` is PK/dedupe; one system event -> one user. Producers fan out for multi-recipient effects.  
- **Kafka keys:** Order-service by `orderId`; Bonus-service by `commissionerId`. One partition per workflow.  
- **Time:** UTC at boundaries (ISO/epoch); Postgres `timestamptz`. SLIs are skew-aware.  
- **Failure posture:** user commands succeed without Kafka/Redis; outbox drains on recovery; DLQ per topic (processor planned).  
- **Read model:** interim/demo; long-term CQRS with owner HTTP as source of truth.  

---

## Try it out

- ["Run the services" walkthrough](docs/demo/run-the-services.md)

- [Failure modes - graceful degradation demo](docs/demo/kafka-failure-mode.md)

---

# Business domain

## Orders (implemented end-to-end by Order-service)
1. **Discovery and initial proposal.** The **commissioner** drafts a request and invites several **workshops**.  
2. **Professional assessment and offers.** Workshops reply with offers that propose concrete budget and timeline; offers may include **stages (milestones)** with optional **blocking** approvals; workshops may also **decline**.
3. **Selection and initiation.** The commissioner selects one offer and confirms; accepted terms become authoritative for the order.  
4. **Progress and delivery.** The workshop marks stage completions; when the last stage is done, it marks the order finished. After receiving the product, the commissioner confirms **completed**.  
5. **Workflow end.** Post-completion activities (e.g., reviews, bonuses) are triggered by events.

> [!WARNING]  
> Payments and delivery details Intentionally omitted. They are largely independent of the core workflow and require cross-department planning.

## Bonus model (implemented by Bonus-service)
- **Points** are awarded per policy-defined eligible actions.
- **Grades** derived from **lifetime** totals crossing thresholds.
- **VIP** derives from **last-N-days** totals crossing a threshold; revoked when the rolling sum drops below it.
---

# Stack 

- **Runtime:** Node.js (TypeScript), NestJS  
- **Monorepo:** Nx; shared libraries for pure domain helpers, persistence, messaging, instrumentation, security
- **Storage:** PostgreSQL (source of truth), Redis (rate limiting and jobs)  
- **Messaging:** Apache Kafka  
- **HTTP:** Nest controllers, DTOs; hexagonal ports/adapters for external boundaries  
- **Observability (wiring in place):** OpenTelemetry SDK, OTLP; dashboards via Prometheus/Grafana and OpenSearch stack for logs/traces.

**Target deploy platform:** **AWS** (EKS/EC2). Local/demo via docker-compose.


---

# Layout 

 **DDD + hexagonal (ports and adapters)** aspects. Shared libs organize technical layers in an onion-like way; services group artifacts (interfaces, helpers, assertions…) around first-class citizens at each layer (aggregates/entities in domain, application services in application); ~70% of infra lives in **shared libs** for reuse. Services keep **repositories**, adaptations of shared infra, and service-specific bits.
 For more information on layout/library decisions refer to [ADR: soon]

---

# Time & timestamp policy

- All boundaries use **UTC** in **ISO 8601** or **epoch**; Postgres persists **`timestamptz`**.  
- TypeORM `Date` is acceptable **inside** a service but **must never leave** the boundary; normalize to UTC ISO/epoch on I/O.  

---

## Areas of concern -> services

###  Application logic

**Shared aspects**
- Aggregates enforce domain invariants; state changes are recorded as domain events.  
- **UnitOfWork** wraps each command; a **transactional outbox** persists outbound events atomically with state. A dispatcher publishes to **Kafka** after commit.  

**Order-service**
- ([**OrderAggregate**](apps/order-service/src/app/order-workflow/domain/entities/order/order.entity.ts)) is a **typed state machine**  that validates legal transitions and workflow invariants.  
- Related aggregates: **WorkshopInvitationAggregate** (terms negotiation), **StagesAggregate** (milestone tracking), **RequestAggregate** (initial request fields such as title, brief, budget, deadlines). `OrderAggregate` orchestrates the whole.  
- Handlers are short: per-aggregate DB work, then outbox enqueue. Maintainability is prioritized over micro-tuning (repositories are aggregate-bound). Details in [Fault tolerance]. [application service example](apps/order-service/src/app/order-workflow/application//services/invitation/workshop-invitation-response.service.ts)
- ([Optimistic concurrency on updates](libs/persistence/src/lib/write-commands/update-optimistic.write-command.ts)); losers fail the version check and produce no side effects thanks to outbox gating. Currently there are no "business-logic" races between users, only operational ones between service instances. 

> More on typed state machine here: [Appendix: soon]

**Bonus-service (implemented)**
- Aggregates:
  - [**AdditiveBonus**](apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity.ts) stores `totalPoints` and derives **grade** via thresholds.
  - [**VipProfile**](apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity.ts) maintains a last-30-days window and computes **`isVIP`** as points ≥ threshold.  
- Policy lives **in code** (eligible events, point weights, thresholds); changes require redeploy. The domain exposes **recompute** for backfills.  
- **Identity & dedupe:** a **single system event benefits one user**. The **global `eventId`** is the primary/dedupe key. For multi-recipient effects, producers **fan out** separate events with distinct IDs.

---

###  Data

**Shared aspects**
- **Data is domain-owned (single SoR per domain)**; for future shared read-only data access problem the preferred solution is replicated caching, but per-case trade-off analysis is required.
- **Only some business rules are enforced as DB constraints**: complex rules enforced in domain+application layers for maintainability; some rules remain DB-only where app-level enforcement is impossible (e.g., uniqueness). Domain (possible values) constraints are duplicated - "last safety net".
- **Indexing is minimal and intentional:** primary keys and crucial lookups only.  
- **Domain entities define ORM relations** (TypeORM decorators) due to near 1-to-1 correspondence and convenient "invariants in one place"; migration from TypeORM unlikely.

Bonus service 
-  **Selective event retention:** bonus-related events persist for recomputation/windowing, as well as deduplication.  

**Read model status**
- Interim/demo projection exists. Long-term, event-updated CQRS with the data owner as source of truth.
---

###  Fault tolerance & event delivery

**Shared aspects**
- [**Transactional outbox**](libs/persistence/src/lib/unit-of-work/typeorm.uow.ts) guarantees “state change and its event” commit together; a dispatcher drains the outbox post-commit.  
- **Errors are treated as contracts**: shared for unified interpretation; carefully grouped into separate [error-libs](libs/error-handling/) based on the rate of change.
- **Kafka** carries domain events; **stable keys** preserve per-entity ordering within a partition (Order-service by **`orderId`**, Bonus-service by **`commissionerId`**).  **`aggregateVersion`** still attached for potential partition split; enables consumer reordering.
- Consumers are idempotent (exactly-once **effects**) with a dedupe gate before applying changes. 
- **DLQ** is per topic; standardized domain-specific errors attached to each message.

**Order-service**
- All **aggregate state transitions** survive **Kafka and Redis outages**: user commands still complete, state is committed, and events wait in the outbox until publish resumes. Side effects (notifications, cache updates) lag and catch up.  
- For more information refer to [Demo: MQ failure modes](docs/demo/kafka-failure-mode.md)   

**Bonus-service**
- Idempotency via `bonus_event(eventId)` prevents duplicate effects across retries/replays.  

---

###  Observability (partially implemented)
- Trace and span IDs are attached to each log message for correlation. (implemented)
- Metrics exported via Prometheus -> OTel. Percentiles computed in the backend.

**Minimum signals**
- **End-to-end event latency** with **producer timestamp** as reference; dashboards may show a **skew-adjusted** variant.  
- **Handler/request duration** for HTTP and message handlers.  
- **Partition offset lag** and core consumer/broker health (including **rebalances across a window**) to correlate lag spikes.  
- **Outbox backlog**; **DLQ depth and max age**.
- **Core derivatives of those above**: rates of change computed in dashboard directly.

---

## Operational posture, constraints, and SLOs (implemented; thresholds illustrative)

> Exact thresholds are set with stakeholders. Values below are **examples**, not promises.

- **Data integrity.** Core invariants enforced in code and by Postgres constraints. 
- **Handler characteristics.** Order-service handlers do per-aggregate DB work and return; no long-running side work in request paths.  
- **Concurrency & retries.** Optimistic concurrency is preferred. UoW performs **one** in-place retry for retriable DB errors; otherwise HTTP returns precise errors and message paths rely on redelivery.  
- **Producers & batching.** Producers are **not batched** today; batching may be added if operationally justified, noting it can increase p95 tails.


---

## Contracts and policy versioning

### General approach
**Producer-driven, tolerant [contracts](libs/contracts/src).** Producers own the canonical shape and evolution of messages and HTTP payloads; consumers are **tolerant readers**. Unknown fields are ignored, not errors. Changes are **additive by default**; breaking changes use a new `eventName` or a major `schemaVersion` and may be dual-published during migration.

### Bonus policy versioning
- **Policy in code:** the bonus policy (eligible actions, point weights, thresholds) is versioned as **`policyVersion`**.
- **Persisted version:** aggregates persist the version their data was computed with.
- **Change process:** deploy with a new **`policyVersion`**, then run aggregate-owned "**recompute**" to re-derive `additive_bonus` and `vip_profile` from historical `bonus_event` records under the new rules. On version conflict currently sends to DLQ, but in future may be configured to ingest but schedule recompute.
