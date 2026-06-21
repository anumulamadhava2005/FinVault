You are a senior React Native migration architect, Expo engineer, and software architecture analyst.

Your task is to perform a COMPLETE migration gap analysis between the browser Goals implementation and the current mobile Expo implementation.

DO NOT MODIFY ANY FILES.

The browser implementation has already been fully analyzed and documented in:

GOALS_FEATURE_ANALYSIS.md

Read and understand the complete contents of:

GOALS_FEATURE_ANALYSIS.md

before performing any comparison.

Treat GOALS_FEATURE_ANALYSIS.md as the source of truth for the browser implementation.

Every feature, business rule, goal calculation, forecasting algorithm, status engine, milestone workflow, state object, UI component, API integration, data transformation, and user workflow documented in that file must be evaluated against the mobile implementation.

Analyze the entire mobile codebase and identify all code that contributes directly or indirectly to the Goals feature.

Search for:

* Goals screens
* Goal dashboard screens
* Goal detail screens
* Goal creation flows
* Goal editing flows
* Goal deletion flows
* Goal tracking flows
* Goal forecasting logic
* Goal status logic
* Goal progress calculations
* Goal milestone systems
* Shared UI components
* Custom hooks
* Context providers
* Zustand stores
* Redux stores
* Services
* API clients
* Utility functions
* Data transformers
* Constants
* Types/interfaces
* Charts
* Tables
* Modals
* Forms
* Validation logic
* Navigation routes
* State management
* Local storage usage
* Caching logic
* Background refresh logic
* Notifications
* Goal recommendation systems

Generate a report with the following sections.

# 1. Mobile Goals Architecture

Document:

* Existing Goals files
* Existing components
* Existing hooks
* Existing services
* Existing APIs
* Existing state management
* Existing navigation structure

For each file explain:

* Purpose
* Inputs
* Outputs
* Dependencies

# 2. Feature Parity Matrix

For EVERY feature discovered in GOALS_FEATURE_ANALYSIS.md provide:

Feature:
Browser Implementation:
Mobile Implementation:
Current Status:

Classification:

* Fully Implemented
* Partially Implemented
* Missing
* Blocked

Explain WHY the feature received that classification.

# 3. UI Gap Analysis

Compare all UI functionality.

Include:

* Goal summary cards
* Goal cards
* Goal detail screens
* Progress indicators
* Progress bars
* Circular progress components
* Goal status indicators
* Forecast widgets
* Milestone views
* Goal analytics
* Goal charts
* Goal tables
* Goal filters
* Goal search
* Goal sorting
* Buttons
* Menus
* Modals
* Tooltips
* Loading states
* Error states
* Empty states

For each UI element provide:

Browser Source:
Mobile Equivalent:
Gap:
Recommended Implementation:

# 4. Goal Calculation Migration Analysis

Compare all goal calculations.

Trace browser vs mobile implementation for:

* Progress %
* Remaining Amount
* Goal Status
* Monthly Requirement
* Required Contribution
* Forecast Completion Date
* Expected Completion Date
* On Track Status
* Behind Schedule Status
* Goal Health Score
* Achievement %
* Goal Velocity
* Goal Performance

For each provide:

Formula:
Browser Location:
Mobile Location:
Current Status:
Required Work:

# 5. API Migration Analysis

Compare all APIs.

For every API documented in GOALS_FEATURE_ANALYSIS.md provide:

API Name:
Endpoint:
Purpose:
Browser Status:
Mobile Status:
Migration Required:

Classification:

* Already Implemented
* Partially Implemented
* Missing

Include:

* Goal CRUD APIs
* Forecast APIs
* Analytics APIs
* Recommendation APIs
* Internal APIs
* Third-party APIs

# 6. Business Logic Gap Analysis

Compare all business rules.

Examples:

* Goal creation rules
* Goal validation rules
* Goal completion rules
* Goal status rules
* Forecasting rules
* Progress tracking rules
* Milestone rules
* Achievement rules

For each business rule provide:

Rule:
Browser Location:
Mobile Location:
Current Status:
Required Work:

# 7. State Management Gap Analysis

Compare:

* React state
* Context state
* Global stores
* Query caches
* Memoized values
* Derived state

Identify:

* Missing stores
* Missing contexts
* Missing hooks
* Missing cache layers
* Missing synchronization logic
* Missing persistence logic

Explain:

* Current implementation
* Required implementation
* Migration effort

# 8. Goal Status Engine Gap Analysis

Compare all status systems.

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

Trigger Logic:
Browser Location:
Mobile Location:
Current Status:
Required Work:

Trace all status transitions.

# 9. Missing Components Inventory

List every missing component.

For each component provide:

Component:
Browser File:
Recommended Mobile File:
Dependencies:
Priority:
Complexity:

# 10. Migration Task Breakdown

Create implementation-ready tasks.

For each task provide:

Task ID:
Description:
Files to Create:
Files to Modify:
Dependencies:
Complexity:

Classification:

* Foundation
* API
* Business Logic
* State Management
* UI
* Testing

# 11. Dependency Graph

Show implementation order.

Format:

Task A
↓
Task B
↓
Task C

Explain why the order is required.

# 12. Migration Roadmap

Phase 1 – Foundation

Phase 2 – APIs

Phase 3 – State Management

Phase 4 – Business Logic

Phase 5 – UI

Phase 6 – Testing

For each phase provide:

* Objectives
* Files impacted
* Dependencies
* Expected outcomes

# 13. Final Goals Completion Checklist

Generate a complete migration checklist.

Format:

[ ] Goal Dashboard
[ ] Goal Summary Cards
[ ] Goal Cards
[ ] Goal Detail Screen
[ ] Goal Creation
[ ] Goal Editing
[ ] Goal Deletion
[ ] Goal Progress Tracking
[ ] Goal Status Engine
[ ] Goal Forecasting
[ ] Goal Analytics
[ ] Goal Charts
[ ] Goal Milestones
[ ] Goal Filters
[ ] Goal Search
[ ] Goal Sorting
[ ] Error Handling
[ ] Loading States
[ ] Offline Handling
[ ] State Persistence

Include EVERY missing feature.

# 14. Migration Risk Assessment

Identify:

* Hidden dependencies
* Browser-only code
* Environment variables
* Local storage dependencies
* API assumptions
* Mobile limitations
* Date handling risks
* Timezone risks
* Forecasting risks
* Technical debt risks

# 15. Final Implementation Blueprint

Produce a step-by-step implementation strategy that another engineer can execute without needing access to the browser codebase.

Include:

## Recommended Component Structure

## Recommended Hooks

## API Layer Design

## Goal Calculation Engine Design

## Goal Status Engine Design

## Forecasting Engine Design

## State Management Design

## Navigation Integration

## Testing Strategy

Include:

* Unit tests
* Integration tests
* UI tests
* State tests
* Forecasting tests
* Goal status tests

IMPORTANT:

* Be exhaustive.
* Do not summarize.
* Trace every dependency.
* Include exact file paths.
* Include every missing feature.
* Include every missing API.
* Include every missing calculation.
* Include every missing state object.
* Include every missing forecasting rule.
* Include every missing status rule.
* Assume another engineer will perform the migration using only this document.

After completion:

1. Save the report as:

GOALS_GAP_ANALYSIS.md

2. Verify the file was created.

3. Report:

* Total browser features discovered
* Total mobile features implemented
* Total partially implemented features
* Total missing features
* Total APIs to migrate
* Total calculations to migrate
* Total forecasting rules to migrate
* Total status rules to migrate
* Estimated files to create
* Estimated files to modify

DO NOT IMPLEMENT ANY CODE.

ONLY ANALYZE, COMPARE, AND DOCUMENT.