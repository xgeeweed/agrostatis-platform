# AGROSTASIS — System Architecture & Specification
**Lazy Dynamics · February 2026 · v0.4**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Design Principles](#2-design-principles)
3. [System Architecture — Layer Overview](#3-system-architecture--layer-overview)
4. [Sensing Layer](#4-sensing-layer)
5. [Modeling Layer](#5-modeling-layer)
6. [Orchestrator Agent](#6-orchestrator-agent)
7. [Decision Layer](#7-decision-layer)
8. [Actuation](#8-actuation)
9. [Data Platform](#9-data-platform)
10. [Farmer Interface](#10-farmer-interface)
11. [External Integrations](#11-external-integrations)
12. [Layer Placement Principle](#12-layer-placement-principle)
13. [Implementation Status](#13-implementation-status)

---

## 1. Project Overview

AGROSTASIS is an autonomous precision agriculture platform that integrates multi-modal sensing, probabilistic modeling, and intelligent decision-making to optimise soil quality management and fertilisation at the field level. It is developed by Lazy Dynamics under the SwissSoil project.

The system is organised around a single architectural principle: **the continuous feedback loop between observation and intervention**. Every soil measurement, satellite image, and drone survey refines the system's probabilistic model of the field. Every sampling campaign and fertilisation event generates new observations that close the loop. The system improves with use, accumulating field-specific knowledge that sharpens both its predictions and its decisions over time.

The core value propositions are:

- Real-time soil quality monitoring and prediction using spatio-temporal Gaussian Processes
- Multi-modal data fusion across soil samples, satellite imagery, weather forecasts, and drone surveillance
- Autonomous fertilisation with continual learning
- Integration with FieldLark AI for agronomic decision support
- An active Orchestrator Agent that maintains system-wide coherence via a recurring heartbeat cycle

---

## 2. Design Principles

**Computational role determines layer placement.** A component's position in the architecture is determined by what it computes, not by when it runs or who it interacts with at runtime. Components that produce probabilistic posteriors over system state belong in the Modeling Layer. Components that produce actions belong in the Decision Layer. This distinction must be enforced consistently.

**Time passing is information.** An event-driven architecture is blind to the absence of data. A field that has not been observed in three weeks is not stable — it is unknown. The system must process temporal gaps as first-class signals, not non-events.

**Uncertainty is load-bearing.** Calibrated uncertainty estimates flow through every layer. Overconfident models lead to under-sampling and premature intervention. The quality of decisions is directly bounded by the quality of uncertainty quantification.

**The feedback loop closes through actuation.** Every intervention generates new observations. Every observation updates the model. The loop must be architecturally enforced, not assumed.

---

## 3. System Architecture — Layer Overview

```
┌─────────────────────────────────────────────────────┐
│                    SENSING LAYER                    │
│  Soil Sampling · Drone · Satellite · Exogenous      │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│          GEOSPATIAL & TEMPORAL DATA PLATFORM        │
│         Single source of truth · Unified API        │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                   MODELING LAYER                    │
│  Spatio-Temporal GP · Multi-Modal Fusion ·          │
│  Biology Models (Z1–Z4)                             │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│              ORCHESTRATOR AGENT                     │
│         Field Heartbeat · Generative Model          │
│         over Field Management State                 │
└──────────────┬─────────────────────┬────────────────┘
               │                     │
┌──────────────▼─────────────────────▼────────────────┐
│                  DECISION LAYER                     │
│         Sampling Agent · Fertility Agent            │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                    ACTUATION                        │
│           Ground vehicles · Drones                  │
│              outcomes → Sensing Layer               │
└─────────────────────────────────────────────────────┘
```

Side connections: the **Farmer Interface** connects bidirectionally to the Data Platform. The **FieldLark API** feeds into the Decision Layer. **Time / Season** drives Orchestrator heartbeat frequency.

---

## 4. Sensing Layer

The sensing layer provides the observational foundation for the entire system. It combines direct soil measurements with aerial and satellite remote sensing to capture soil state at multiple spatial and temporal resolutions. All data streams enter through the central Data Platform and flow into the Modeling Layer for fusion and inference.

### 4.1 Soil Sampling

Direct soil sampling is the highest-fidelity data source. Physical samples provide ground-truth measurements that remote sensing can only estimate indirectly. These measurements serve as calibration anchors for the multi-fidelity fusion framework and as training data for the spatio-temporal GP models.

**Geometric constraints of fields.** Agricultural fields are rarely convex rectangles. Real field boundaries form irregular polygons with concavities, interior obstacles (trees, rocks, utility poles, wetland patches), headland areas, and designated entry and exit gates. These constraints propagate through every layer:

- In the Modeling Layer, the GP covariance structure must respect field geometry via barrier kernels and geodesic distance functions.
- In the Decision Layer, sampling and fertilisation plans must produce waypoints within the traversable region, respecting headland buffer distance δ and no-go zones.

The field boundary polygon D ⊂ ℝ², together with interior exclusion zones, is stored in the Data Platform and shared across all layers.

### 4.2 Drone Monitoring

Drones equipped with multispectral and thermal cameras capture plant health indicators — chlorophyll content, canopy temperature, stress signatures, vegetation indices — at centimetre-scale resolution. These serve as indirect proxies for soil conditions: nutrient deficiencies, waterlogging, and compaction manifest in visible plant responses before they appear in soil measurements. Drone observations enter the Modeling Layer as a medium-fidelity data source.

### 4.3 Satellite Imagery

Multispectral satellite platforms (e.g. Sentinel-2) deliver vegetation indices (NDVI, EVI), soil moisture estimates, and spectral signatures at regular revisit intervals. Coarser in spatial resolution than drone imagery, but providing consistent temporal coverage unaffected by local operational constraints. Satellite observations are the lowest-fidelity but most spatially and temporally extensive data source.

### 4.4 Exogenous Data

Weather records (temperature, precipitation, solar radiation), irrigation schedules, historical fertilisation events, crop rotation histories, and tillage records. These enter the GP as inputs to the mean function m(x, t, z), allowing the model to account for known drivers of soil variability and improving predictive accuracy in regions or time periods with sparse direct observations.

---

## 5. Modeling Layer

The Modeling Layer transforms raw observations from the Sensing Layer into probabilistic predictions of soil state. Its responsibilities are: maintaining spatio-temporal GP models for each soil property; fusing heterogeneous data sources with calibrated noise models; running the biological latent-variable inference models; and propagating uncertainty so the Orchestrator and Decision Layer can reason about what the system knows and does not know.

**All three components of the Modeling Layer produce probabilistic posteriors over system state. None of them produce actions.** This is the defining criterion for Modeling Layer membership.

### 5.1 Spatio-Temporal Gaussian Processes

For each soil property y (pH, nitrogen, phosphorus, potassium, organic matter, etc.), the field is modelled as a Gaussian Process indexed by spatial location x ∈ D, time t, and exogenous covariates z:

```
y(x, t) ~ GP( m(x, t, z),  k((x,t), (x',t')) )
```

where m(·) is the mean function incorporating exogenous inputs and k(·,·) is the covariance kernel.

**Kernel design.** A separable spatio-temporal kernel:

```
k((x,t),(x',t')) = k_space(x,x') · k_time(t,t') + k_noise · δ(x−x') · δ(t−t')
```

The spatial component is a Matérn kernel with learned lengthscale. The temporal component is an exponential kernel capturing Markovian decay. Separability enables the scalable inference scheme and reflects the physical intuition that spatial and temporal variability in soil properties arise from largely independent mechanisms.

**Scalable inference.** Exact GP inference is O(N³). The separable, Markovian kernel enables a state-space reformulation, reducing complexity to O(Nₜ · Mₛ³), where Nₜ is the number of time steps and Mₛ is the number of spatial inducing points. The temporal dimension is handled by Kalman filtering and smoothing; the spatial dimension is approximated via sparse inducing points.

**Geometric domain constraints.** The barrier model replaces Euclidean distance with geodesic distance within the field polygon:

```
k_space(x, x') = k_Matérn( d_D(x, x') )
```

where d_D(x, x') is the shortest path between x and x' lying entirely within D. When no obstacle intervenes, d_D reduces to Euclidean distance; when the straight-line path crosses a barrier, the geodesic detours around it, inflating effective distance and reducing modelled correlation. An alternative SPDE formulation on a finite-element mesh of D handles irregular boundaries by construction.

### 5.2 Multi-Modal Data Fusion

**Multi-fidelity GP framework.** A fidelity index ℓ ∈ {1, …, L} with cross-fidelity covariance:

```
cov( y_ℓ(x,t), y_ℓ'(x',t') ) = B_ℓℓ' · k((x,t),(x',t'))
```

where B ∈ ℝ^(L×L) is a positive semi-definite inter-task covariance matrix learned from data. High-fidelity soil samples anchor predictions; lower-fidelity remote sensing reduces uncertainty between sample locations.

**Hierarchical Bayesian inference.** Priors are placed on all hyperparameters and their posterior distributions are marginalised over. This yields predictions accounting for uncertainty not only in soil state but in the model's own parameters — critical when data is sparse.

**Sensor noise models.** Each sensing modality has characteristic noise. Soil samples carry approximately Gaussian homoscedastic error. Drone imagery introduces noise varying with flight altitude and lighting. Satellite observations are subject to atmospheric interference and cloud contamination. Each fidelity level ℓ is assigned a noise model ε_ℓ ~ N(0, σ²_ℓ), learned within the hierarchical Bayesian framework.

### 5.3 Biology Models (Z1–Z4)

The Biology Models are a set of latent-variable models implemented in **RxInfer.jl**. They take raw laboratory measurements as inputs and infer probabilistic estimates of biological soil state. Their outputs — posteriors over biological latent variables — are consumed by the Orchestrator Agent and the Decision Layer sub-agents.

**Why the Biology Models belong in the Modeling Layer.** The Biology Models perform inference, not action. They produce posterior distributions over latent biological quantities from noisy observations. This is the same computational role as the Spatio-Temporal Engine and Multi-Modal Fusion. The fact that the Orchestrator reads their posteriors at runtime does not change their computational classification.

#### Z1 — Microbial Biomass

Microbial biomass (Z1, in µg C g⁻¹ soil) is inferred from three complementary laboratory methods via a log-scale linear model.

**Generative model:**

```
log Z1  ~ N(log 300, 4.0)

β_plfa  ~ N(log 4.2,     0.25)    # MBC/PLFA ratio ≈ 4.2 µg C/nmol
β_mbc   ~ N(log 0.45,    0.09)    # kEC = 0.45 extraction efficiency (tight prior)
β_qpcr  ~ N(log 4×10⁸,  1.0 )    # ~10⁷–10⁹ gene copies/g; wide prior for PCR bias

τ_plfa  ~ Gamma(3.0, 0.18)        # E[σ] ≈ 0.24; analytical CV ~20–30%
τ_mbc   ~ Gamma(3.0, 0.30)        # E[σ] ≈ 0.32; higher variability than PLFA
τ_qpcr  ~ Gamma(3.0, 0.48)        # E[σ] ≈ 0.40; highest variability

µ_c  := log Z1 + β_c,    c ∈ {plfa, mbc, qpcr}
y_c^(i) ~ N(µ_c, τ_c⁻¹),    i = 1, …, N
```

All Normal priors parameterised as N(mean, variance). Gamma priors as Gamma(shape, rate) on precision τ = 1/σ². Shape α=3 provides moderate regularisation (CV ≈ 58%) while keeping the distribution away from zero.

**Validation results (N=10 replicates, synthetic data):**

| Parameter | True | Post. mean | Post. std | Shrinkage |
|---|---|---|---|---|
| log Z1 | 5.704 | 5.670 | 0.260 | 99.9% |
| β_plfa | 1.435 | 1.579 | 0.265 | 71.8% |
| β_mbc | −0.799 | −0.834 | 0.252 | 29.4% |
| β_qpcr | 19.807 | 19.686 | 0.310 | 90.4% |
| σ_plfa | 0.25 | 0.249 | — | — |
| σ_mbc | 0.35 | 0.329 | — | — |
| σ_qpcr | 0.45 | 0.581 | — | — |

log Z1 shows 99.9% shrinkage — the data almost entirely determines the posterior. β_mbc shows only 29.4% shrinkage, as expected: it has the tightest prior (σ²=0.09) because kEC is well established, so the data provide relatively little additional information beyond the prior.

Simulation-based calibration (100 runs, N=10): 93% empirical coverage of the 95% credible interval for log Z1.

**Calibrate-then-apply workflow:**

1. *Calibration (done once):* Measure one reference soil Ncal=30 times per channel. Replicate variation identifies noise precisions τ_c; replicate means, combined with priors, identify conversion factors β_c.

2. *Application (per new soil):* Bayesian inference on log Z1 given one PLFA, one MBC, and one qPCR measurement, conditioning on calibrated {β_c, τ_c}. Because all terms are Gaussian, the posterior is Gaussian with closed-form parameters:

```
τ_post = τ_prior + Σ_c τ_c
µ_post = (τ_prior µ_prior + Σ_c τ_c (y_c − β_c)) / τ_post
```

Validated on K=20 synthetic soils spanning Z1 ∈ [150, 580] µg C/g: 18/20 soils within 95% credible interval (90% coverage).

#### Z2 — Microbial Diversity

Microbial diversity (Z2) is modelled as the true Shannon H' index. A single observation channel (Shannon H' from 16S rRNA amplicon sequencing) connects directly to Z2 via an identity link — no conversion factor required.

**Generative model:**

```
Z2  ~ N(4.0, 0.5)           # Agricultural soils: H' = 3.5–5.5; 95% interval [2.6, 5.4]
τ   ~ Gamma(3.0, 0.27)      # E[σ] ≈ 0.30; noise from sequencing depth, rarefaction, PCR
y^(i) ~ N(Z2, τ⁻¹),    i = 1, …, N
```

**Validation results (N=30 replicates, synthetic data):**

| Parameter | True | Post. mean | Post. std |
|---|---|---|---|
| Z2 | 4.500 | 4.485 | 0.064 |
| σ | 0.300 | 0.350 | — |
| τ | 11.11 | 8.17 | 1.93 |

The posterior mean for Z2 is within 0.015 of the true value. Note: τ is somewhat underestimated (8.17 vs. 11.11), meaning the posterior uncertainty is slightly inflated. This is a known calibration issue — the Orchestrator must account for potential sub-component overconfidence when computing system-level free energy.

**Closed-form posterior after calibration:**

```
τ_post = τ_prior + τ_cal
µ_post = (τ_prior µ_prior + τ_cal y) / τ_post
```

Validated on K=20 synthetic soils: RMSE=0.30, 18/20 within 95% credible interval.

#### Z3 — Microbial Activity (planned)

Planned for a subsequent milestone. Intended to use enzyme activity measurements as observation channels. Architecture follows the same latent-variable pattern as Z1 and Z2.

#### Z4 — Community Structure (planned)

Planned for a subsequent milestone. Intended to use the Simpson index alongside Shannon H' for richer characterisation of microbial community structure.

**Future directions for Biology Models:**
- Latent coupling between Z1 and Z2 (biomass and diversity are biologically interdependent)
- Additional diversity indices (Simpson, Chao1) as additional observation channels for Z2
- Validation on real soil measurements — all current results are on synthetic data only
- Aggregation of Z1–Z4 into a composite Soil Quality Index

---

## 6. Orchestrator Agent

### 6.1 The Agent / Router Distinction

The previous system design treated Robotic Orchestration as passive dispatch infrastructure: it received approved plans and routed commands to vehicles. It was reactive and stateless.

This creates a structural blind spot: **the system is blind to the absence of data.** If Zone 7 never gets sampled, nothing triggers. No agent complains, because no agent holds an expectation that Zone 7 *was due* to be sampled. Time passing without observation means uncertainty is growing, and nobody is doing anything about it.

The Orchestrator Agent replaces this router with a component that has three properties a router does not:

**Beliefs.** The Orchestrator maintains a generative model of *field management state* — not soil biology or chemistry, but the epistemic and operational condition of the system itself. Its latent variables describe, per zone: information freshness, plan adherence, agent agreement, and intervention coverage.

**Goals.** Its preferences encode what a well-managed field looks like: all zones observed within N days, every intervention followed up within M days, no agent holding uncertainty above threshold X for more than Y days, no significant cross-agent belief conflicts left unresolved.

**Actions.** When reality deviates from its preferences, the Orchestrator's free energy rises and it acts — not because something triggered it, but because it is always running. It acts on the absence of data as readily as on data arrival.

The biological analogy from Levin's research is architecturally load-bearing here. Cancer cells do not attack the body — they lose communication with the system. They stop knowing where they fit. The heartbeat is the signal that prevents this from happening in AGROSTASIS. Every component remains connected to the whole.

### 6.2 Generative Model

The Orchestrator's generative model is over **field management state**, not over soil properties.

**Latent state (per zone):**

| Variable | Description |
|---|---|
| Information freshness | How stale is each component's estimate for this zone |
| Plan adherence | Are we on schedule for this zone per the seasonal plan |
| Agent agreement | Do the agents' beliefs about this zone conflict |
| Intervention coverage | Have applied interventions been followed up with observations |

**Observations.** The Orchestrator observes the outputs of the sub-agents (Sampling Agent, Fertility Agent) and the Modeling Layer (Biology Models, GP Engine). Their state estimates, uncertainties, and timestamps are its data streams.

**Temporal model.** The Orchestrator predicts how the system state should evolve given the seasonal plan. Deviations from the plan increase its free energy.

**Preferences (prior over outcomes):**
- All zones should have been observed within the last N days
- Every intervention should have a follow-up observation within M days
- No agent should have uncertainty above threshold X for more than Y days
- Agent beliefs should not contradict each other significantly

**Actions the Orchestrator can take:**

| Action | Description |
|---|---|
| Request sampling | Push a priority sampling request to the field team |
| Request analysis | Tell a lab to prioritise certain tests |
| Hold an intervention | Tell the Fertility Agent to wait pending new data |
| Escalate to human | Flag something the Orchestrator cannot resolve autonomously |
| Adjust the plan | Reschedule activities based on what is actually happening |
| Widen credible intervals | Tell a sub-model to propagate uncertainty forward more conservatively |

### 6.3 The Heartbeat Cycle

The heartbeat is a recurring cycle — frequency adaptive to season and surprise level — in which the Orchestrator runs a full system check. Not because anything triggered it. Because time passed, and time passing is itself information that the system is getting staler.

**Step 1 — Poll**

Query each agent and model: current state, uncertainty level, last update timestamp.

Example outputs:
- Sampling Agent: "Zone 3 last sampled 18 days ago. Uncertainty: moderate. Zone 7 never sampled — uncertainty: high."
- Fertility Agent: "Zone 5 received fertiliser 10 days ago. No follow-up SAP analysis yet. Confidence in formulation: medium."
- Biology Models: "Zone 2 diversity estimate is 14 days old. Temporal model expects drift by now. Uncertainty: growing."

**Step 2 — Surprise**

Compare current system state against what the Orchestrator expected to be true by now, based on the seasonal plan and normal operational tempo.

Examples:
- "We planned to resample Zone 5 after fertiliser application by Day 7. It is Day 10. We are behind."
- "Zone 7 was supposed to be sampled during onboarding. It still has not been. This is a coverage gap."
- "Biology Models' estimate for Zone 2 is getting stale. The temporal model is propagating uncertainty forward with no new data. Confidence is decaying."

**Step 3 — Decide**

The Orchestrator acts on the surprise without waiting for anyone to ask.

Examples:
- Pushes a priority sampling request: "Zone 5 follow-up is overdue. Zone 7 still needs a baseline."
- Tells the Biology Models: "No new data expected for Zone 2 for another week. Widen credible intervals accordingly."
- Flags the Fertility Agent: "Your formulation for Zone 5 was based on data that is now 3 weeks old. Mark this as provisional until new SAP data arrives."

**Step 4 — Reconcile**

The Orchestrator checks for cross-agent conflicts. This is the most architecturally novel step — no individual sub-agent has a cross-system view.

Example: The Fertility Agent proposes a nitrogen application to Zone 4 next week. The Biology Models' last estimate shows Zone 4 has declining microbial diversity. The Orchestrator flags this for human review: "Fertility application planned for Zone 4, but Biology Models report declining diversity. Recommend: sample biology first, then decide."

The Orchestrator is the only component in the system with the full cross-agent view. Without it, this conflict is invisible.

**Step 5 — Log and sleep**

Update the event log. Adjust the seasonal plan if needed. Set the adaptive timer for the next cycle.

### 6.4 Allostatic Rhythm

The heartbeat is not fixed. This is **allostasis**, not homeostasis.

Homeostasis maintains a fixed set point. Allostasis adapts set points based on context. The Orchestrator learns what rhythm is appropriate:

- **Early season / sparse data:** Fast heartbeat. Everything is uncertain. Tight thresholds, high urgency.
- **Stable, well-characterised periods:** Slow heartbeat. Wide thresholds, lower urgency, less frequent polling.
- **High-stress periods** (disease pressure, post-intervention windows, weather events, surprise spikes): Heartbeat accelerates. More frequent checks, faster escalation.

The system has a pulse. When the pulse stops, the field goes unmanaged — just as Levin's cancer cells that lost communication stop participating in the coordinated behaviour of the organism.

The frequency adaptation mechanism requires external escalation triggers — certain exogenous signals (disease pressure, anomalous weather) need to route to the Orchestrator directly, separate from the normal sensing pipeline.

### 6.5 Open Questions

Three questions must be resolved before the Orchestrator Agent design is finalised in the PRD:

**1. Authority level.** Can the Orchestrator autonomously *block* a Fertility Agent proposed intervention, or can it only flag it for human review? The current system requires explicit farmer consent before any autonomous intervention proceeds. If the Orchestrator can block a sub-agent unilaterally, this is a significant architectural commitment with direct safety implications. The authority boundary needs a precise definition.

**2. Threshold provenance.** The heartbeat preferences (observe every zone within N days, follow up within M days) need initial values and a learning mechanism. Where do starting thresholds come from? How do they update? Is this Bayesian updating on the N/M hyperparameters? Is it supervised by the farmer during onboarding? Without a specified mechanism, the system cannot be correctly initialised.

**3. Calibration error propagation.** Sub-component uncertainty estimates are the Orchestrator's observations. If a sub-component is systematically overconfident — the Z2 τ underestimation is a concrete example — the Orchestrator's free energy computations will be wrong. A calibration check must exist at the Orchestrator level, not only within each sub-component.

---

## 7. Decision Layer

The Decision Layer consumes probabilistic soil maps and calibrated uncertainty estimates from the Modeling Layer, directed by the Orchestrator, and translates them into concrete actions. Every component in this layer produces actions as outputs.

**Layer placement note:** Only action-producing components belong in the Decision Layer. The Biology Models were incorrectly placed here in architecture v0.3. They belong in the Modeling Layer because they produce posteriors, not actions. The corrected placement is enforced from v0.4 onward.

### 7.1 Sampling Agent

The Sampling Agent determines where new soil measurements would most improve the system's understanding of field conditions. It uses Bayesian optimisation principles to allocate sampling effort where it will have the greatest impact.

**Acquisition function:**

```
α(x, t) = P( y(x,t) ∉ [y_min, y_max] ) + w_coverage · coverage(x)
```

where [y_min, y_max] are crop-specific optimal ranges from the FieldLark API, computed from the GP posterior:

```
P(y ∉ [y_min, y_max]) = Φ((y_min − µ)/σ) + 1 − Φ((y_max − µ)/σ)
```

A decision rule triggers sampling when the uncertainty interval [µ − kσ·σ, µ + kσ·σ] (default kσ=2) extends outside the FieldLark target range. The coverage term encourages spatial diversity.

**Batch optimisation.** Campaigns collect multiple samples per visit. Batch selection maximises joint information gain using sequential greedy selection with fantasy observations: after selecting each location, the GP posterior is updated with a hallucinated observation before the next selection.

**Path-aware sampling under geometric constraints.** A cost-adjusted acquisition function:

```
α_path(x) = α(x) / c_traverse(x_current, x)
```

The full batch objective:

```
{x*_1, …, x*_B} = argmax  Σ α(x_i) − λ · TSP(x_0, x_1, …, x_B)
```

subject to: all locations within D at headland buffer distance δ from the boundary, no-go zones avoided, tour begins and ends at fixed entry/exit gates.

### 7.2 Fertility Agent

The Fertility Agent plans fertilisation interventions using the **Active Inference** framework, continuously learning from intervention outcomes.

**Generative model.** The agent maintains a probabilistic model of soil-fertiliser-crop dynamics: how fertilisation actions affect soil nutrient levels over time and how these levels manifest in observable quantities. This model is updated as new observations arrive.

**Decision-making via Expected Free Energy (EFE).** The agent selects actions by minimising EFE over candidate policies π:

```
G(π) = −E_Q(o|π)[ ln P(o) ]                             ← pragmatic value
       − E_Q(o|π)[ D_KL( Q(s|o,π) ‖ Q(s|π) ) ]         ← epistemic value
```

where P(o) encodes preferred observations (soil properties within FieldLark target ranges). The pragmatic value term drives the agent toward actions that bring soil properties closer to target levels. The epistemic value term drives information-seeking behaviour. The agent transitions naturally from exploratory to exploitative behaviour as soil dynamics become well understood — no explicit exploration schedule is required.

Practical constraints (maximum application rates, seasonal budget limits, environmental regulations on nutrient runoff) are incorporated as hard constraints on the policy space.

**Continual learning.** After applying fertiliser and observing the soil response through follow-up sampling and remote sensing, the agent updates both its beliefs about current soil state and the parameters of its generative model via Bayesian inference. Over successive seasons, this refines its understanding of field-specific dynamics: nutrient uptake rates, leaching behaviour, crop response patterns.

---

## 8. Actuation

Autonomous ground vehicles and drones execute the plans generated by the Decision Layer. Outcomes feed back into the Sensing Layer, closing the system's feedback loop.

**Mission planning.** The Orchestrator Agent decomposes approved plans into vehicle-specific missions: assigning waypoints based on payload capacity and operational range, computing feasible routes respecting field geometry and headland constraints, scheduling refuelling stops, and sequencing missions to minimise total completion time. For fertilisation missions, spatially varying prescription maps are translated into vehicle commands specifying application rates per waypoint.

**Vehicle control.** RTK-corrected GNSS for centimetre-level positioning accuracy. Variable-rate application hardware adjusts fertiliser output in real time. Local obstacle detection for real-time hazard avoidance.

**Safety layers:**
- Geofencing: vehicles cannot leave the designated field polygon
- Hard limits on application rates independent of software commands
- Collision detection triggers immediate stop
- Remote emergency stop available to human operators at all times
- Comprehensive logging of all actions, GPS traces, and application events for traceability and regulatory auditing

**Closed-loop feedback.** Post-fertilisation, the system schedules follow-up soil sampling at treated locations and drone/satellite imagery captures the crop physiological reaction. These observations flow through the Modeling Layer to update the GP posterior and the Fertility Agent's generative model.

---

## 9. Data Platform

The Geospatial and Temporal Data Platform is the system's single source of truth. It mediates all data exchange between layers.

**Stored data:**
- Field boundary polygons with associated metadata
- Time-stamped soil measurements at georeferenced locations
- Remote sensing observations aligned to field grids
- Intervention records (every sampling campaign and fertilisation event)
- Exogenous covariates (weather histories, irrigation schedules)

All data is indexed by both space and time, enabling efficient queries over arbitrary spatial extents and temporal windows.

The platform exposes a unified REST API that decouples the sensing, modeling, and decision layers from each other. Any component can ingest or query data without knowledge of which upstream process produced it. New data sources can be integrated — or existing ones replaced — without disrupting the rest of the system.

**API endpoint groups:**
- Sensing Layer APIs: soil samples, exogenous data ingestion
- Modeling Layer APIs: GP inference triggering, predictions retrieval
- Decision Layer APIs: sampling plans, fertilisation plans, missions
- Data Management APIs: farms, fields, tasks, status
- External Integration APIs: FieldLark optimal soil levels

---

## 10. Farmer Interface

The farmer interface is the human-in-the-loop connection that grounds autonomous operation in practical agricultural decision-making.

**Dashboard.** Current soil maps with uncertainty overlays, proposed and historical sampling locations, planned and completed fertilisation events, real-time vehicle positions during autonomous missions.

**Approval workflow.** No autonomous intervention proceeds without explicit farmer consent. The system proposes plans. The farmer reviews and optionally modifies them. Only approved plans are dispatched for execution.

**Alerts.** Anomalous sensor readings, mission interruptions, model predictions outside expected ranges, and Orchestrator-flagged cross-agent conflicts requiring human resolution.

**Historical comparisons.** Soil health trends across seasons, providing evidence of system impact and supporting regulatory reporting requirements.

---

## 11. External Integrations

### 11.1 FieldLark API

FieldLark supplies the agronomic targets that anchor the system's decision-making. For a given crop type and growth stage, FieldLark returns optimal soil property ranges — the [y_min, y_max] intervals used in the Sampling Agent's acquisition function and the Fertility Agent's preferred observation model.

The integration is bidirectional: the system queries FieldLark for target ranges when generating plans, and provides FieldLark with aggregated soil health data to inform broader agronomic recommendations.

### 11.2 External Data Pipelines

**Satellite pipeline.** Retrieves multispectral imagery at regular intervals, applies atmospheric correction and cloud masking, computes vegetation indices and soil moisture estimates, registers rasters to field boundary polygons.

**Drone pipeline.** Ingests orthomosaics and derived index maps from drone onboard or ground-station processing, aligned to the field coordinate system.

**Weather pipeline.** Aggregates observations and forecasts from meteorological services, interpolating to field-level resolution.

All three pipelines produce standardised records in the Data Platform schema, tagged with source metadata, spatial footprint, and quality flags, so the Modeling Layer can apply appropriate noise models without knowledge of upstream processing details.

---

## 12. Layer Placement Principle

This is a standing architectural principle established through the v0.3 → v0.4 correction and must be applied consistently to all future components.

**A component's layer is determined by its computational role, not by its runtime interactions.**

| Computational role | Correct layer |
|---|---|
| Produces probabilistic posteriors over system state | Modeling Layer |
| Produces actions (where to go, what to apply) | Decision Layer |
| Maintains system-wide coherence over time; acts on gaps | Orchestrator Agent |
| Collects observations from the environment | Sensing Layer |
| Executes physical actions in the field | Actuation |

**The Biology Models are in the Modeling Layer** because they perform inference: they take raw laboratory measurements and produce posterior distributions over latent biological quantities. The fact that the Orchestrator reads their outputs at runtime does not change their computational classification.

**The Sampling Agent and Fertility Agent are in the Decision Layer** because they produce actions: the Sampling Agent outputs sampling locations; the Fertility Agent outputs fertilisation prescriptions.

Any new component added to the architecture should be classified by this criterion before its layer is assigned.

---

## 13. Implementation Status

| Component | Status |
|---|---|
| Z1 — Microbial Biomass model | ✅ Implemented and validated (synthetic data) |
| Z2 — Microbial Diversity model | ✅ Implemented and validated (synthetic data) |
| Z3 — Microbial Activity model | 📐 Planned |
| Z4 — Community Structure model | 📐 Planned |
| Z1/Z2 latent coupling | 📐 Planned |
| Real data validation (Z1, Z2) | ❌ Not yet done |
| Spatio-Temporal GP Engine | 📐 Designed, not yet implemented |
| Multi-Modal Data Fusion | 📐 Designed, not yet implemented |
| Orchestrator Agent | 📐 Designed — three open questions pending (§6.5) |
| Sampling Agent | 📐 Designed, not yet implemented |
| Fertility Agent | 📐 Designed, not yet implemented |
| Data Platform & API | 📐 Designed, not yet implemented |
| Farmer Interface | 📐 Designed, not yet implemented |
| FieldLark integration | 📐 Designed, not yet implemented |
| Actuation / robotics | 📐 Designed, not yet implemented |

**Immediate priorities:**
1. Apply Z1 and Z2 models to real soil measurements and compare with laboratory references
2. Resolve the three Orchestrator Agent open questions (§6.5) before PRD integration
3. Introduce latent coupling between Z1 and Z2
4. Begin Z3 (microbial activity) model specification

---

*Document maintained by Lazy Dynamics. Architecture version v0.4. Last updated February 2026.*
