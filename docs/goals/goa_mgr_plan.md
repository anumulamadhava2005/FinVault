# GOALS_MIGRATION_PLAN_PROMPT.md

You are a senior React Native, Expo, TypeScript, and software architecture engineer.

Read:

* GOALS_FEATURE_ANALYSIS.md
* GOALS_GAP_ANALYSIS.md

Your task is to create a practical implementation plan for migrating the Goals feature from the browser application to the mobile Expo application.

DO NOT MODIFY ANY FILES.

The goal is to organize all migration work into 3 implementation phases that can be executed independently.

Generate a report with the following sections.

# Phase 1 - Core Goals Migration

Include all functionality required to make the Goals feature functional end-to-end.

Examples:

* Core Goals screen
* Goals dashboard
* Goal cards
* Goal detail screen
* Goal creation
* Goal editing
* Goal deletion
* Data models
* State management
* Services
* Hooks
* API integrations
* Goal progress calculations
* Goal status calculations
* Goal forecasting engine
* Goal milestone support
* Business calculations
* Data transformations
* Loading states
* Error states
* Empty states

For this phase provide:

* Features included
* APIs included
* Files to create
* Files to modify
* Dependencies
* Estimated complexity

# Phase 2 - Advanced Goals Features

Include all functionality required to achieve near-complete feature parity with the browser version.

Examples:

* Goal analytics
* Goal charts
* Progress visualizations
* Forecast visualizations
* Goal timeline views
* Milestone tracking UI
* Goal health indicators
* Goal status indicators
* Goal filtering
* Goal sorting
* Goal search
* Advanced interactions
* Goal insights
* Goal recommendations
* Additional forecasting analytics

For this phase provide:

* Features included
* APIs included
* Files to create
* Files to modify
* Dependencies
* Estimated complexity

# Phase 3 - Validation and Hardening

Include all work required to make the feature production-ready.

Examples:

* Bug fixes
* Edge case handling
* Forecast validation
* Goal calculation validation
* Goal status validation
* Error recovery
* Performance improvements
* State synchronization improvements
* Offline handling
* Data persistence validation
* API retry handling
* Type safety improvements
* Code cleanup
* Final validation

For this phase provide:

* Features included
* Files to create
* Files to modify
* Dependencies
* Estimated complexity

# Goal Calculation Migration Breakdown

Identify all goal calculations that must be migrated.

Examples:

* Progress %
* Remaining Amount
* Goal Achievement %
* Required Monthly Contribution
* Required Weekly Contribution
* Forecast Completion Date
* Expected Completion Date
* Goal Velocity
* Goal Health Score
* Goal Performance Score
* Milestone Completion %
* Savings Rate
* Contribution Trend

For each calculation provide:

* Browser implementation location
* Mobile implementation status
* Migration phase
* Dependencies

# Goal Status Engine Migration Breakdown

Identify all goal status logic that must be migrated.

Examples:

* Not Started
* On Track
* Behind Schedule
* At Risk
* Completed
* Overachieved
* Paused
* Cancelled

For each status provide:

* Browser implementation location
* Mobile implementation status
* Migration phase
* Dependencies

# Forecasting Engine Migration Breakdown

Identify all forecasting logic that must be migrated.

Examples:

* Completion prediction
* Progress forecasting
* Monthly requirement forecasting
* Contribution forecasting
* Time-to-goal calculations
* Goal trajectory calculations

For each forecasting feature provide:

* Browser implementation location
* Mobile implementation status
* Migration phase
* Dependencies

# Migration Summary

Provide:

* Total browser features
* Total mobile features already implemented
* Total features to migrate
* Total APIs to migrate
* Total goal calculations to migrate
* Total forecasting rules to migrate
* Total goal status rules to migrate
* Total files to create
* Total files to modify

# Dependency Roadmap

Provide implementation order:

Foundation
↓
Data Layer
↓
State Management
↓
Goal Calculation Engine
↓
Goal Status Engine
↓
Forecasting Engine
↓
Core UI
↓
Advanced UI
↓
Testing
↓
Production Hardening

Explain why the order is required.

# Final Implementation Checklist

Generate a complete implementation checklist.

Format:

[ ] Goal Dashboard
[ ] Goal Cards
[ ] Goal Detail Screen
[ ] Goal Creation
[ ] Goal Editing
[ ] Goal Deletion
[ ] Goal Progress Tracking
[ ] Goal Calculation Engine
[ ] Goal Status Engine
[ ] Goal Forecasting Engine
[ ] Goal Milestones
[ ] Goal Analytics
[ ] Goal Charts
[ ] Goal Timeline
[ ] Goal Filters
[ ] Goal Search
[ ] Goal Sorting
[ ] State Management
[ ] Data Persistence
[ ] Error Handling
[ ] Loading States
[ ] Offline Handling
[ ] Testing
[ ] Production Hardening

Include EVERY missing feature.

After completion:

1. Save the report as:

GOALS_MIGRATION_PLAN.md

2. Verify the file was created.

3. Provide:

* Phase 1 estimated effort
* Phase 2 estimated effort
* Phase 3 estimated effort
* Total migration effort
* Highest-risk migration areas
* Recommended implementation order

IMPORTANT:

* Be exhaustive.
* Do not summarize.
* Trace every dependency.
* Include exact file paths.
* Include every missing feature.
* Include every missing API.
* Include every missing goal calculation.
* Include every missing forecasting rule.
* Include every missing status rule.
* Assume another engineer will execute the migration using only this document.

DO NOT IMPLEMENT ANY CODE.

ONLY ANALYZE, ORGANIZE, AND DOCUMENT.
