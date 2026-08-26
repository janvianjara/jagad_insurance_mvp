# CONTEXT HANDOFF — Jagad Insurance Platform (Sarvadhi)

## Project
Single-tenant, config-portable AI-native insurance-agency ERP for **Jagad Insurance** (Surat, est. 1998, 9,000+ customers; Health/Life/Motor/Travel/General; Mutual Funds excluded; sign-off: **Vivek Jagad**). Replaces VJ Infosoft ASP.NET register. Record-only money (no rating engine). PRD locked at **v0.4.1**, emailed to client (share-only, no review ask).

## Locked decisions D1–D21 (full log in PRD §Decision Log + package `00-product/decisions.md`)
Key ones: D1 single-tenant config-portable · D3 record-only money (Net=Σ components, Final=Net+GST entered) · D4/D19 **Agency Master** = placement channel: auto-code, Individual (1 company, Jagad's own code) / Broker (external vendor = payer, never payee/user, N companies), company filter GI(SME/Health/Motor)/LI, per-agency policy multi-select scope, **commission % on agency record (FR-07.3a)** · D8 people roles = Agent + Sub-agent ONLY · D17 2FA: TOTP day-1, OTP per integration · D18 **Quotation Generator**: admin Benefit Catalog (label, field type, options, default price, section Coverage/Add-on) + policy→benefit map (FR-05.7) + Composer matrix (rows=benefits, cols=companies, ad-hoc rows inline) + Final Payable Premium entered per column + branded single/side-by-side PDF (client reference format: header w/ persons 2A+1C, DOBs, PORT, floater); upload=fallback · D20 agent layer: admin-set agent %, delegated sub-agent creation grant, sub-agent share carved from agent's cut w/ optional admin cap, per-agent **direct-updates toggle** (OFF → messages route to agent, logged) · D21 cashless claims → tokenized expiring login-free discharge-summary upload link.
Commission chain: payer (company/broker) → Jagad pay-in (agency %) → agent % → sub-agent share (capped). Wallets = sub-agents only.

## Delivered files (from prior thread)
1. **PRD_Insurance_Agency_Platform_v0_4_1.docx** — 45pp master, 19 sections, ~152 FRs across 21 modules, decision log, compliance register (12 regs), heart-flow G/W/T stories. ⚠ **KNOWN DEFECT: FR-16.8 row (tokenized upload links) missing from the docx** (patch silently failed) — needs one-row patch before further circulation. It IS present in the requirements package.
2. **jagad_workflow_canvas.html** — v3 interactive swimlane canvas: 9 lanes (ADMIN first, AGENT renamed), 8 columns (0·Admin Setup w/ complete 12-group config surface incl. SKU form builder → 7·Commission), 78 nodes/90 edges, sticky lane labels + column headers, hover-highlight connections, pan/zoom/fit/minimap, Scenarios tab (48 G/W/T). Zero emoji (standing rule — SVG only).
3. **jagad-requirements-v041.zip** — loop-engineering package, audit-clean, **156 FRs**: `requirements/{README.md, 00-product/{prd,decisions}, 01-frs/{_index, conventions + 21 fr-XX files w/ YAML front-matter}, 02-flows/{heart-flows(48 rows), workflow-canvas.html}, 03-compliance/compliance(G1–G15), 04-delivery/{phases, dependencies, escalation(E1–E4 = 1%-human contract)}}`. Front-matter `depends_on` = curated **acyclic** build-order DAG: 01→[] · 02,15,18,20→[01] · 16→[01,20] · 17→[18,20] · 21→[15,17] · 3→[2] · 4→[2] · 5→[3,4] · 9→[16,17,20] · 7→[4,5] · 6→[3,5,9,17,21] · 10→[3,5,6,7,16] · 14→[5,7,10] · 8→[9,10,15] · 11→[4,10,15,16,17,21] · 12→[10,14,16,17,21] · 13→[10,11,14] · 19→[10,11,12,14].
4. **workflow-canvas-generator.skill** — audit→questions→lock→generate canvas from template (`@@DATA@@`/`@@FLOWS@@` markers, LANES/COLS/N/E schema, 6-point QA).
5. **requirements-loop-generator.skill** — any-industry BRD/PRD → industry-expert persona → audit/questions(≤10 batches w/ defaults)/brainstorm → lock → generate requirements/ package → mandatory self-audit (front-matter, DAG cycle check, index reconciliation, 80–150 batched marker audit).

## Final audit performed (minor-to-minor)
152 marker checks in 5 batches across the package. 5 real gaps found & patched: FR-06.3 explicit TAT chain (confirm→reassign same category group→escalate→unrouted queue) · FR-08.1a client's verbatim 6-op register incl. OFFER AWARENESS · FR-12.3/.4 year-wise renewal amounts + offers in reminders and OCR auto-fill · FR-13.1 concrete endorsement seed types (non-fin: name/address/contact/nominee/relationship; fin: SI±/member add/delete/add-ons/ownership transfer/age) · FR-12.10 lapse recording + win-back list.

## Quotation module placement
Quotation Generator is an **engine inside FR-06** (FR-06.4–.8 + FR-05.7), not a standalone module — deliberate, to avoid a circular dep with Sales.

## Pending / next actions
1. Patch FR-16.8 row into the v0.4.1 **docx** (flagged twice, not yet requested).
2. First live test of both skills on a non-Jagad doc (EduX/Clario suggested).
3. M2 vendor decisions: OQ-1 OCR (Textract/Vision/Azure), OQ-2 WhatsApp BSP — both built behind adapters until decided; OQ-4 DLT registration should start now (weeks of lead time).
4. Client walkthrough of canvas → M3 build start using the requirements package.

## Working preferences (Jatin)
Terse, bullets/tables, no fluff · inline preview + explicit "generate/confirm" before any file · NO emoji in deliverables (SVG icons) · honest pushback expected · Claude Code loop engineering context: 24/7 autonomous build, 1% human-in-loop per escalation.md.
