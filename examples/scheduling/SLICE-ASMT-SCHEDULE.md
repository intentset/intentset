---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-ASMT-SCHEDULE
  type: slice
  title: Assessment scheduling slice
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  links:
    implements:
    - BEH-ASMT-SCHEDULE
    exposes:
    - CONTRACT-ASMT-SCHEDULE
    informedBy:
    - ADR-ASMT-SEAM
  slice:
    kind: product
    domain: assessment
    entrypoint: src/features/assessment/schedule/index.ts
    layers:
      presentation:
      - src/features/assessment/schedule/ui/**
      application:
      - src/features/assessment/schedule/domain/use-cases/**
      policy:
      - src/features/assessment/schedule/domain/policies/**
      model:
      - src/features/assessment/schedule/domain/models/**
      external:
      - src/features/assessment/schedule/client/**
    claims:
    - kind: source
      path: src/features/assessment/schedule/**
    - kind: backend
      path: amplify/functions/schedule-assessment/**
    usesResources:
    - RES-ASSESSMENT-DATA
---

# Assessment scheduling slice

## Responsibility

Accountable implementation owner for scheduled assessment delivery. Code paths are planned; this example is L1 only and makes no implementation-conformance claim.

## Public contract

ScheduleAssessment accepts a class, assessment, and release time and returns a stable schedule identifier or a typed rejection.

## Verification

TEST-ASMT-SCHEDULE defines a manual pilot review, with no execution evidence yet.
