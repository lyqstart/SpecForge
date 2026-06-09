# Implementation Plan: SpecForge v1.1 Compliance Remediation

## Overview

This implementation plan migrates SpecForge from an "Agent workflow framework" to an "unavoidable spec-driven Runtime" compliant with SpecForge v1.1 + Patch 1 standards. The migration is organized into 5 implementation rounds, each building upon the previous round's foundation:

- **Round 1**: Directory model and path governance
- **Round 2**: 24-state transaction state machine
- **Round 3**: Candidate merge pipeline with approval gates
- **Round 4**: Write Guard hard constraints
- **Round 5**: Extension Registry and Extension Subflow

All tasks use **TypeScript** as the implementation language. Property-based tests use the fast-check library with minimum 100 iterations per test. Tasks marked with `*` are optional and can be skipped for faster MVP delivery.

## Tasks

### Round 1: Directory Model and Path Governance

- [X] 1. Set up project structure and core TypeScript configuration
  - Create TypeScript configuration with strict mode
  - Set up testing framework (vitest + fast-check)
  - Create base directory structure for Runtime components
  - _Requirements: 1.1, 1.2, 1.3_

- [X] 2. Implement Path Service
  - [X] 2.1 Create PathService interface and implementation
    - Implement all path generation methods for project specs
    - Implement all path generation methods for work items
    - Implement all path generation methods for runtime files
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [X]* 2.2 Write unit tests for Path Service
    - Test each path generation method returns correct format
    - Test paths use POSIX forward slashes
    - Test paths include .specforge/ prefix where required
    - _Requirements: 1.1, 1.2, 1.3_

- [X] 3. Implement Path Policy validator
  - [X] 3.1 Create PathPolicy interface and validation logic
    - Implement validatePath method with all validation rules
    - Implement isLegacySpecPath, isProjectSpecPath, isWorkItemPath helpers
    - Return descriptive ValidationResult for each check
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
  
  - [X]* 3.2 Write property test for Path Policy validation consistency
    - **Property 1: Path Validation Consistency**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10**
    - Generate arbitrary path strings with fast-check
    - Verify all validation rules applied consistently
    - Verify rejection of absolute paths, backslashes, .., ~, missing prefix
    - _Requirements: 1.4-1.10_
  
  - [X]* 3.3 Write unit tests for specific path rejection cases
    - Test absolute path rejection
    - Test Windows backslash rejection
    - Test path traversal (..) rejection
    - Test home expansion (~) rejection
    - Test missing .specforge/ prefix rejection for spec files
    - _Requirements: 1.4-1.10_

- [X] 4. Implement directory initialization and legacy spec protection
  - [X] 4.1 Create Runtime initialization logic
    - Create .specforge/project/ directory on init
    - Create .specforge/work-items/ directory on init
    - Create .specforge/runtime/ directory on init
    - Create empty spec_manifest.json with correct schema
    - Create empty extension_registry.json with correct schema
    - _Requirements: 1.13, 1.14, 1.15, 1.16, 1.17_
  
  - [X] 4.2 Implement legacy spec read-only enforcement
    - Detect write operations to .specforge/specs/** paths
    - Block all write operations to legacy spec paths
    - Allow read operations to legacy spec paths
    - _Requirements: 1.11, 1.12_
  
  - [X] 4.3 Prevent creation of forbidden directories
    - Block creation of .specforge/archive/ directory
    - Block creation of .specforge/state/ directory
    - Block creation of .specforge/gates/ directory
    - _Requirements: 1.18, 1.19, 1.20_
  
  - [X]* 4.4 Write property test for legacy spec read-only enforcement
    - **Property 3: Legacy Spec Read-Only Enforcement**
    - **Validates: Requirements 1.11, 1.12**
    - Generate paths matching .specforge/specs/**
    - Verify read operations allowed
    - Verify all write operations blocked
    - _Requirements: 1.11, 1.12_
  
  - [X]* 4.5 Write integration tests for directory initialization
    - Test complete directory structure created
    - Test manifest files created with correct schema
    - Test forbidden directories cannot be created
    - _Requirements: 1.13-1.20_

- [X] 5. Implement JSON parser and serializer with round-trip testing
  - [X] 5.1 Create JSON parser and serializer utilities
    - Implement parse method for JSON strings
    - Implement serialize method for data objects
    - Implement error handling with descriptive messages
    - _Requirements: 6.1, 6.2, 6.10_
  
  - [X]* 5.2 Write property test for JSON round-trip consistency
    - **Property 16: JSON Parser/Serializer Round-Trip**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Generate arbitrary JSON-serializable objects
    - Verify parse(serialize(obj)) produces equivalent object
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [X]* 5.3 Write property test for parser error descriptiveness
    - **Property 19: Parser Error Descriptiveness**
    - **Validates: Requirement 6.10**
    - Generate invalid JSON strings
    - Verify parser returns descriptive error messages
    - _Requirements: 6.10_

- [X] 6. Checkpoint - Round 1 validation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify directory structure correctly initialized
  - Verify path validation working correctly
  - Verify legacy specs protected


### Round 2: 24-State Transaction State Machine

- [X] 7. Define state machine data models and schemas
  - [X] 7.1 Create WorkItemMetadata interface and types
    - Define all 24 work item states as TypeScript enum
    - Define WorkItemMetadata interface
    - Define StateTransition interface
    - Implement schema validation for work item metadata
    - _Requirements: 2.1-2.24_
  
  - [X] 7.2 Create work item metadata parser and serializer
    - Implement parse method for work_item.json
    - Implement serialize method for WorkItemMetadata
    - Implement error handling for invalid metadata
    - _Requirements: 6.4, 6.5, 6.10_
  
  - [X]* 7.3 Write property test for work item metadata round-trip
    - **Property 17: Configuration Parser/Serializer Round-Trip**
    - **Validates: Requirements 6.4, 6.5, 6.6**
    - Generate arbitrary WorkItemMetadata objects
    - Verify parse(serialize(metadata)) produces equivalent object
    - _Requirements: 6.4, 6.5, 6.6_

- [X] 8. Implement State Machine with transition validation
  - [X] 8.1 Create StateMachine class with all states
    - Implement all 24 states
    - Define legal state transitions as adjacency map
    - Implement transition validation logic
    - _Requirements: 2.1-2.24_
  
  - [X] 8.2 Implement illegal transition rejection
    - Block created → implementation_running
    - Block candidate_prepared → merging
    - Block approval_required → merging
    - Block approval_required → closed
    - Block merged → closed
    - Block closed → any state
    - Block blocked → closed
    - Block rejected → closed
    - Block all other illegal transitions per design
    - _Requirements: 2.25-2.36_

  - [X] 8.3 Implement state transition authorization
    - Implement caller identification (agent vs runtime components)
    - Block all agent-initiated state transitions
    - Allow only authorized runtime components to transition states
    - _Requirements: 2.37, 2.38, 2.39, 2.40, 2.41, 2.42, 2.43_
  
  - [X]* 8.4 Write property test for state transition authorization
    - **Property 4: State Transition Authorization**
    - **Validates: Requirements 2.37-2.43**
    - Generate arbitrary state transition attempts from agent caller
    - Verify all agent transitions rejected
    - Generate transitions from authorized runtime components
    - Verify authorized transitions accepted
    - _Requirements: 2.37-2.43_
  
  - [X]* 8.5 Write property test for illegal transition rejection
    - **Property 5: Illegal State Transition Rejection**
    - **Validates: Requirements 2.25-2.36**
    - Generate all (from_state, to_state) pairs
    - Verify illegal transitions rejected
    - Verify legal transitions accepted
    - _Requirements: 2.25-2.36_
  
  - [X]* 8.6 Write unit tests for specific state transitions
    - Test each of 24 states exists and is reachable
    - Test complete happy-path state lifecycle
    - Test terminal states (closed, blocked, rejected, superseded)
    - _Requirements: 2.1-2.43_

- [X] 9. Implement state persistence and history tracking
  - [X] 9.1 Create state persistence logic
    - Save work_item.json on state transitions
    - Record state transition in state_history array
    - Save timestamp and component name for each transition
    - _Requirements: 2.1-2.43_
  
  - [X]* 9.2 Write integration tests for state machine lifecycle
    - Test complete work item lifecycle from created to closed
    - Test state history correctly recorded
    - Test state persistence across Runtime restarts
    - _Requirements: 2.1-2.43_

- [X] 10. Checkpoint - Round 2 validation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 24 states supported
  - Verify illegal transitions blocked
  - Verify authorization enforced


### Round 3: Candidate Merge Pipeline

- [X] 11. Implement candidate validation and manifest schema
  - [X] 11.1 Create CandidateManifest interface and types
    - Define CandidateManifest interface
    - Define CandidateEntry interface with operation types
    - Implement schema validation for manifest
    - _Requirements: 3.3, 3.4_
  
  - [X] 11.2 Implement candidate format validation
    - Validate candidate files are complete file contents
    - Reject patch or diff format candidates
    - Return descriptive error for invalid format
    - _Requirements: 3.1, 3.2_
  
  - [X] 11.3 Implement candidate manifest path validation
    - Validate candidate_path points to work-items/<WI-ID>/candidates/
    - Validate target_path points to .specforge/project/**
    - Reject manifest entries with invalid paths
    - _Requirements: 3.3, 3.4_
  
  - [X]* 11.4 Write property test for candidate format validation
    - **Property 6: Candidate Format Validation**
    - **Validates: Requirements 3.1, 3.2**
    - Generate various file content formats
    - Verify complete files accepted
    - Verify patch/diff formats rejected
    - _Requirements: 3.1, 3.2_
  
  - [X]* 11.5 Write property test for candidate manifest path validation
    - **Property 7: Candidate Manifest Path Validation**
    - **Validates: Requirements 3.3, 3.4**
    - Generate candidate manifest entries with various paths
    - Verify valid paths accepted
    - Verify invalid paths rejected
    - _Requirements: 3.3, 3.4_
  
  - [X]* 11.6 Write property test for candidate manifest round-trip
    - **Property 18: Candidate Manifest Parser/Serializer Round-Trip**
    - **Validates: Requirements 6.7, 6.8, 6.9**
    - Generate arbitrary CandidateManifest objects
    - Verify parse(serialize(manifest)) produces equivalent object
    - _Requirements: 6.7, 6.8, 6.9_

- [X] 12. Implement Gate Runner and gate execution framework
  - [X] 12.1 Create GateRunner class and interfaces
    - Define GateRunner interface
    - Define GateResult and GateSummary interfaces
    - Implement gate definition loading logic
    - _Requirements: 3.5, 3.6, 3.7_
  
  - [X] 12.2 Implement gate execution logic
    - Execute each gate's checkFn()
    - Write individual gate results to gates/<gate_id>.json
    - Generate gate_summary.md with all results
    - Transition to approval_required if all gates pass
    - Transition to gates_failed if any gate fails
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9_
  
  - [X]* 12.3 Write unit tests for Gate Runner
    - Test gate execution and result writing
    - Test gate summary generation
    - Test state transitions based on gate results
    - _Requirements: 3.5-3.9_

- [X] 13. Implement User Decision Recorder with hash binding
  - [X] 13.1 Create UserDecisionRecorder class
    - Define UserDecision interface
    - Implement hash calculation for candidate manifest
    - Implement hash calculation for gate summary
    - _Requirements: 3.10, 3.11, 3.12, 3.13, 3.14_
  
  - [X] 13.2 Implement user decision recording
    - Detect user approval intent from chat
    - Generate user_decision.json with all required fields
    - Record base_spec_version from project manifest
    - Record candidate_manifest hash
    - Record gate_summary hash
    - Record timestamp
    - _Requirements: 3.10, 3.11, 3.12, 3.13, 3.14_
  
  - [X]* 13.3 Write unit tests for User Decision Recorder
    - Test user decision recording with correct hashes
    - Test hash calculation consistency
    - Test all required fields present in decision file
    - _Requirements: 3.10-3.14_

- [X] 14. Implement Merge Runner with precondition validation
  - [X] 14.1 Create MergeRunner class and interfaces
    - Define MergeRunner interface
    - Define MergeResult and MergedFile interfaces
    - Implement merge precondition validation logic
    - _Requirements: 3.15, 3.16, 3.17, 3.18, 3.19_
  
  - [X] 14.2 Implement merge precondition checks
    - Verify user_decision.json exists
    - Calculate current candidate manifest hash
    - Calculate current gate summary hash
    - Compare hashes with user_decision.json
    - Verify base_spec_version matches current project version
    - Reject merge if any validation fails
    - _Requirements: 3.15, 3.16, 3.17, 3.18, 3.19_
  
  - [X] 14.3 Implement merge execution
    - Read candidate_manifest.json
    - For each entry, read candidate file
    - Calculate pre-merge hash of target (if exists)
    - Write candidate content to target path
    - Calculate post-merge hash
    - Record MergedFile entry
    - _Requirements: 3.20, 3.21_
  
  - [X] 14.4 Implement merge report generation
    - Generate merge_report.md with all merge operations
    - Record source path, target path, operation type
    - Record pre-merge and post-merge hashes
    - Record success/failure for each operation
    - _Requirements: 3.22, 3.23, 3.24_
  
  - [X]* 14.5 Write property test for merge precondition hash validation
    - **Property 8: Merge Precondition Hash Validation**
    - **Validates: Requirements 3.15, 3.16, 3.17, 3.18, 3.19**
    - Generate candidate manifests and gate summaries
    - Modify files after user decision
    - Verify hash mismatch detected and merge rejected
    - Verify version mismatch detected and merge rejected
    - _Requirements: 3.15-3.19_
  
  - [X]* 14.6 Write integration tests for merge pipeline
    - Test successful merge flow with valid preconditions
    - Test merge rejection on hash mismatch
    - Test merge rejection on version mismatch
    - Test merge report generation
    - _Requirements: 3.15-3.24_

- [X] 15. Implement post-merge gate and project spec versioning
  - [X] 15.1 Implement post_merge_gate checks
    - Verify all target files correctly written
    - Verify project spec version incremented
    - Verify spec_manifest.json updated
    - Transition to merged state on success
    - _Requirements: 3.25, 3.26, 3.27, 3.28_
  
  - [X]* 15.2 Write integration tests for post-merge gate
    - Test post-merge validation passes on successful merge
    - Test post-merge validation fails if files missing
    - Test post-merge validation fails if version not incremented
    - _Requirements: 3.25-3.28_

- [X] 16. Implement write protection for merge pipeline files
  - [X] 16.1 Add protected path checks
    - Block agent writes to .specforge/project/**
    - Block agent writes to user_decision.json
    - Block agent writes to gates/** directory
    - Block agent writes to gate_summary.md
    - Block agent writes to merge_report.md
    - Block chat "approval" from directly triggering merge
    - _Requirements: 3.29, 3.30, 3.31, 3.32, 3.33, 3.34_
  
  - [X]* 16.2 Write unit tests for merge pipeline write protection
    - Test agent cannot write to each protected path
    - Test user approval requires proper decision recording
    - Test merge only triggered by Merge Runner
    - _Requirements: 3.29-3.34_

- [X] 17. Checkpoint - Round 3 validation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify candidate validation working
  - Verify gate execution and user approval flow
  - Verify merge preconditions enforced
  - Verify post-merge checks passing


### Round 4: Write Guard Hard Constraints

- [X] 18. Implement Write Guard interceptor framework
  - [X] 18.1 Create WriteGuard class and interfaces
    - Define WriteGuardPolicy interface
    - Define WriteContext and WritePermission interfaces
    - Implement policy evaluation logic
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [X] 18.2 Implement write interception for all tool types
    - Intercept edit tool writes
    - Intercept custom write file tools
    - Intercept bash command writes
    - Intercept code formatter writes
    - Intercept code generator writes
    - Intercept package manager writes
    - Intercept snapshot update writes
    - Intercept Git operation writes
    - _Requirements: 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_
  
  - [X]* 18.3 Write property test for write guard protection universality
    - **Property 2: Write Guard Protection Universality**
    - **Validates: Requirements 1.11, 3.29, 3.30, 3.31, 3.32, 3.33, 4.20, 4.21, 4.22, 4.23, 4.24, 5.28**
    - Generate arbitrary write attempts to protected paths
    - Verify all agent writes to protected paths blocked
    - Test .specforge/project/**, .specforge/specs/**, user_decision.json, gates/**, etc.
    - _Requirements: 1.11, 3.29-3.33, 4.20-4.24, 5.28_
  
  - [X]* 18.4 Write property test for tool interception completeness
    - **Property 10: Tool Interception Completeness**
    - **Validates: Requirements 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13**
    - Generate write operations through each tool type
    - Verify Write Guard intercepts each tool type
    - Verify write policy applied to each tool
    - _Requirements: 4.6-4.13_
  
  - [X]* 18.5 Write unit tests for each tool interception
    - Test edit tool interception
    - Test bash command interception
    - Test formatter interception
    - Test package manager interception
    - _Requirements: 4.6-4.13_

- [X] 19. Implement Code Permission Service
  - [X] 19.1 Create CodePermissionService class
    - Define CodePermissionService interface
    - Implement code_change_allowed flag management
    - Implement allowed_write_files list management
    - _Requirements: 4.1, 4.2_
  
  - [X] 19.2 Implement permission-based write control logic
    - Block writes when no active work item exists
    - Block writes when code_change_allowed is false
    - Block writes to files not in allowed_write_files
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [X]* 19.3 Write property test for permission-based write control
    - **Property 9: Permission-Based Write Control**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - Generate write attempts with various permission states
    - Verify writes blocked when no work item
    - Verify writes blocked when code_change_allowed = false
    - Verify writes blocked for files not in allowed list
    - _Requirements: 4.3, 4.4, 4.5_

- [X] 20. Implement Changed Files Audit
  - [X] 20.1 Create ChangedFilesAudit class
    - Define EscapedWriteIncident interface
    - Implement file system snapshot before/after command execution
    - Implement comparison of actual vs expected file changes
    - _Requirements: 4.14, 4.15, 4.16_
  
  - [X] 20.2 Implement escaped write incident recording
    - Detect when actual file changes exceed expected_write_files
    - Record EscapedWriteIncident with all details
    - Block work item state progression when incident exists
    - _Requirements: 4.17, 4.18, 4.19_
  
  - [X]* 20.3 Write property test for file change audit accuracy
    - **Property 11: File Change Audit Accuracy**
    - **Validates: Requirements 4.14, 4.15, 4.16, 4.17, 4.18, 4.19**
    - Generate bash commands with declared expected_write_files
    - Simulate actual file changes exceeding expectations
    - Verify escaped_write_incident recorded
    - Verify state progression blocked
    - _Requirements: 4.14-4.19_
  
  - [X]* 20.4 Write integration tests for file change audit
    - Test exact match (actual = expected)
    - Test escaped writes detected and recorded
    - Test work item progression blocked on incident
    - _Requirements: 4.14-4.19_

- [X] 21. Implement frozen file protection and privileged component authorization
  - [X] 21.1 Implement frozen file write protection
    - Track frozen files after user approval
    - Block all writes to frozen files
    - Block all writes when work item state is closed
    - _Requirements: 4.25, 4.26_
  
  - [X] 21.2 Implement privileged component write authorization
    - Grant Merge Runner write access to .specforge/project/**
    - Grant User Decision Recorder write access to user_decision.json
    - Grant Gate Runner write access to gates/** and gate_summary.md
    - Implement component authentication mechanism
    - _Requirements: 4.27, 4.28, 4.29_
  
  - [X]* 21.3 Write property test for frozen file write protection
    - **Property 12: Frozen File Write Protection**
    - **Validates: Requirements 4.25, 4.26**
    - Generate write attempts to frozen files
    - Generate write attempts when work item state is closed
    - Verify all writes blocked
    - _Requirements: 4.25, 4.26_
  
  - [X]* 21.4 Write property test for privileged component authorization
    - **Property 13: Privileged Component Write Authorization**
    - **Validates: Requirements 4.27, 4.28, 4.29**
    - Generate write attempts from privileged components
    - Verify Merge Runner can write to project specs
    - Verify User Decision Recorder can write to user_decision.json
    - Verify Gate Runner can write to gates/** and gate_summary.md
    - _Requirements: 4.27, 4.28, 4.29_

- [X] 22. Implement write_scope_gate integration
  - [X] 22.1 Create write_scope_gate check
    - Check for escaped_write_incident existence
    - Block state progression if incident exists
    - Integrate with gate execution framework
    - _Requirements: 4.18, 4.19_
  
  - [X]* 22.2 Write integration tests for write_scope_gate
    - Test gate passes when no incidents
    - Test gate fails when incident exists
    - Test state progression blocked
    - _Requirements: 4.18, 4.19_

- [X] 23. Checkpoint - Round 4 validation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify Write Guard intercepting all write operations
  - Verify permission-based write control working
  - Verify file change audit detecting escaped writes
  - Verify frozen file and privileged component authorization


### Round 5: Extension Registry and Extension Subflow

- [X] 24. Implement Extension Registry schema and management
  - [X] 24.1 Create ExtensionRegistry interface and types
    - Define ExtensionRegistry schema with all namespaces
    - Define type registration structure
    - Implement schema validation
    - _Requirements: 5.1, 5.2_
  
  - [X] 24.2 Implement Extension Registry initialization
    - Create extension_registry.json on Runtime init
    - Register in spec_manifest.json
    - Initialize with empty namespaces
    - _Requirements: 5.1, 5.2_
  
  - [X]* 24.3 Write unit tests for Extension Registry initialization
    - Test extension_registry.json created
    - Test registered in spec_manifest.json
    - Test correct schema structure
    - _Requirements: 5.1, 5.2_

- [X] 25. Implement unknown type detection
  - [X] 25.1 Create type detection logic for all artifact types
    - Detect unknown types in Requirements documents
    - Detect unknown types in Design documents
    - Detect unknown types in Tasks documents
    - Detect unknown types in Verification documents
    - Detect unknown types in Gate definitions
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [X] 25.2 Implement extension request generation
    - Generate extension_request.json when type missing
    - Record missing type name and usage context
    - Set blocking_current_flow flag
    - Block main flow progression
    - _Requirements: 5.8, 5.9, 5.10, 5.11_
  
  - [X]* 25.3 Write property test for unknown type detection
    - **Property 14: Unknown Type Detection**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7**
    - Generate specification artifacts with unknown types
    - Verify Runtime detects missing types in each artifact type
    - Verify extension_request.json generated
    - _Requirements: 5.3-5.7_
  
  - [X]* 25.4 Write unit tests for extension request generation
    - Test extension request generated for each artifact type
    - Test blocking_current_flow flag set correctly
    - Test main flow blocked on unknown type
    - _Requirements: 5.8-5.11_

- [X] 26. Implement Extension Subflow orchestration
  - [X] 26.1 Create Extension Subflow scheduler
    - Detect extension_request.json presence
    - Spawn sf-extension agent
    - Pass type request context to agent
    - _Requirements: 5.12_
  
  - [X] 26.2 Implement sf-extension agent integration
    - Define sf-extension agent interface
    - Agent generates extension_delta.md
    - Agent generates Extension_Registry candidate
    - Submit candidate to Runtime
    - _Requirements: 5.12, 5.13, 5.14_
  
  - [X]* 26.3 Write integration tests for Extension Subflow
    - Test extension subflow triggered on unknown type
    - Test sf-extension agent generates correct artifacts
    - Test extension candidate submitted
    - _Requirements: 5.12-5.14_

- [X] 27. Implement extension_gate validation
  - [X] 27.1 Create extension_gate check
    - Validate extension type definition completeness
    - Validate no conflicts with existing types
    - Mark as hard_gate
    - _Requirements: 5.15, 5.16, 5.17, 5.18_
  
  - [X] 27.2 Implement extension approval and merge
    - Require user decision for extension approval
    - User Decision Recorder generates user_decision.json for extension
    - Merge Runner merges extension candidate to extension_registry.json
    - Execute post_merge_gate
    - _Requirements: 5.19, 5.20, 5.21, 5.22_
  
  - [X]* 27.3 Write unit tests for extension_gate
    - Test completeness validation
    - Test conflict detection
    - Test hard_gate behavior
    - _Requirements: 5.15-5.18_
  
  - [X]* 27.4 Write integration tests for extension approval and merge
    - Test user approval flow for extensions
    - Test extension merge to registry
    - Test post_merge_gate for extensions
    - _Requirements: 5.19-5.22_

- [X] 28. Implement main flow resumption after extension registration
  - [X] 28.1 Create flow resumption logic
    - Resume main flow after extension merge complete
    - Reload Extension_Registry with new types
    - Request agent regenerate artifacts using new types
    - _Requirements: 5.23, 5.24, 5.25_
  
  - [X]* 28.2 Write integration tests for flow resumption
    - Test main flow resumes after extension registration
    - Test Extension_Registry reloaded
    - Test agent regenerates artifacts with new types
    - _Requirements: 5.23-5.25_

- [X] 29. Implement extension write protection
  - [X] 29.1 Add extension registry write protection
    - Block agent writes to extension_registry.json
    - Block agent from creating unregistered types
    - Block agent from writing candidates with unknown types
    - _Requirements: 5.28, 5.29, 5.30_
  
  - [X]* 29.2 Write property test for extension registry write protection
    - **Property 15: Extension Registry Write Protection**
    - **Validates: Requirements 5.28, 5.29, 5.30**
    - Generate agent write attempts to extension_registry.json
    - Verify all agent writes blocked
    - Verify only Merge Runner can write to registry
    - _Requirements: 5.28, 5.29, 5.30_

- [X] 30. Implement Close Gate extension check
  - [X] 30.1 Add extension check to Close Gate
    - Check for unprocessed extension_request.json files
    - Refuse work item close if extension request exists
    - _Requirements: 5.26, 5.27_
  
  - [X]* 30.2 Write unit tests for Close Gate extension check
    - Test close blocked when extension request exists
    - Test close allowed when no extension requests
    - _Requirements: 5.26, 5.27_

- [X] 31. Checkpoint - Round 5 validation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify Extension Registry initialization working
  - Verify unknown type detection triggering extension subflow
  - Verify extension_gate validation working
  - Verify extension approval and merge working
  - Verify main flow resumption working


### Cross-Cutting: Close Gate Complete Implementation

- [X] 32. Implement comprehensive Close Gate validation
  - [X] 32.1 Create CloseGate class with all checks
    - Define CloseGate interface
    - Define CloseCheck and CloseValidationResult interfaces
    - Implement all 10 close validation checks
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_
  
  - [X] 32.2 Implement each close check
    - Check work item state is verification_done
    - Check all gates passed
    - Check user_decision.json exists and valid
    - Check merge_report.md exists with successful operations
    - Check project spec version incremented
    - Check evidence_manifest.json exists (if applicable)
    - Check verification_report.md exists (if applicable)
    - Check trace_matrix.md or trace_delta.md updated (if applicable)
    - Check no unprocessed extension_request.json
    - Check no unresolved escaped_write_incident
    - _Requirements: 7.1-7.10_
  
  - [X] 32.3 Implement close execution logic
    - Return failure with reasons if any check fails
    - Transition work item to closed state if all checks pass
    - Freeze all files after close (block further writes)
    - _Requirements: 7.11, 7.12, 7.13_
  
  - [X] 32.4 Implement not_applicable flag support
    - Allow checks to be skipped with not_applicable flag
    - Apply to evidence, verification, and trace matrix checks
    - _Requirements: 7.14_
  
  - [X]* 32.5 Write unit tests for each close check
    - Test each check validates correctly
    - Test failure reasons returned
    - Test not_applicable flag skips checks
    - _Requirements: 7.1-7.14_
  
  - [X]* 32.6 Write integration tests for Close Gate
    - Test successful work item close with all checks passing
    - Test close rejection scenarios
    - Test frozen file protection after close
    - _Requirements: 7.1-7.14_


### Cross-Cutting: Runtime Component Responsibilities

- [X] 33. Implement Runtime orchestration layer
  - [X] 33.1 Create Runtime class with component coordination
    - Initialize .specforge/ directory structure
    - Load and validate spec_manifest.json
    - Load and validate extension_registry.json
    - Schedule State Machine state transitions
    - Schedule Gate Runner execution
    - Schedule User Decision Recorder
    - Schedule Merge Runner execution
    - Schedule Code Permission Service
    - Schedule Write Guard interception
    - Schedule Changed Files Audit
    - Schedule Close Gate execution
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_
  
  - [X]* 33.2 Write integration tests for Runtime orchestration
    - Test complete work item lifecycle orchestration
    - Test component coordination
    - Test error handling across components
    - _Requirements: 8.1-8.11_

- [X] 34. Enforce component responsibility boundaries
  - [X] 34.1 Implement strict component interfaces
    - Path Service only generates paths
    - Path Policy only validates paths
    - State Machine only manages state transitions
    - Gate Runner only executes gates
    - User Decision Recorder only records decisions
    - Merge Runner only executes merges
    - Code Permission Service only manages permissions
    - Write Guard only intercepts writes
    - Changed Files Audit only audits changes
    - Close Gate only validates close conditions
    - _Requirements: 8.12, 8.13, 8.14, 8.15, 8.16, 8.17, 8.18, 8.19, 8.20, 8.21_
  
  - [X] 34.2 Enforce agent responsibility boundaries
    - Agent only generates intent artifacts (candidates, deltas, reports, evidence)
    - Block agent from state progression operations
    - Block agent from permission management operations
    - Block agent from merge operations
    - _Requirements: 8.22, 8.23, 8.24, 8.25_
  
  - [X]* 34.3 Write unit tests for component responsibility enforcement
    - Test each component respects its boundary
    - Test agent cannot execute restricted operations
    - _Requirements: 8.12-8.25_

- [X] 35. Final checkpoint - Complete system validation
  - Ensure all tests pass, ask the user if questions arise.
  - Run full integration test suite
  - Verify all 5 rounds implemented correctly
  - Verify all cross-cutting concerns addressed
  - Verify all property tests passing with 100+ iterations


## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property-based tests use fast-check library with minimum 100 iterations
- All property tests include a comment tag referencing the design property
- Implementation follows 5 rounds: Path Governance → State Machine → Merge Pipeline → Write Guard → Extension Registry
- Each round must complete with passing tests before proceeding to the next round
- Checkpoints ensure incremental validation at the end of each round
- TypeScript is used for all implementation
- Write Guard intercepts all file write operations at the tool level
- Merge Runner is the only component authorized to write to .specforge/project/**
- Agent role is limited to generating intent artifacts, not executing control operations
- All specification changes flow through the formal work item transaction model
- Extension types must be registered in Extension Registry before use
- Close Gate validates all conditions before allowing work item closure

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.2", "5.3"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "4.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["4.4", "4.5", "7.1", "7.2"] },
    { "id": 4, "tasks": ["7.3", "8.1", "8.2", "8.3"] },
    { "id": 5, "tasks": ["8.4", "8.5", "8.6", "9.1"] },
    { "id": 6, "tasks": ["9.2", "11.1", "11.2", "11.3"] },
    { "id": 7, "tasks": ["11.4", "11.5", "11.6", "12.1", "12.2"] },
    { "id": 8, "tasks": ["12.3", "13.1", "13.2"] },
    { "id": 9, "tasks": ["13.3", "14.1", "14.2", "14.3", "14.4"] },
    { "id": 10, "tasks": ["14.5", "14.6", "15.1"] },
    { "id": 11, "tasks": ["15.2", "16.1"] },
    { "id": 12, "tasks": ["16.2", "18.1", "18.2"] },
    { "id": 13, "tasks": ["18.3", "18.4", "18.5", "19.1", "19.2"] },
    { "id": 14, "tasks": ["19.3", "20.1", "20.2"] },
    { "id": 15, "tasks": ["20.3", "20.4", "21.1", "21.2"] },
    { "id": 16, "tasks": ["21.3", "21.4", "22.1"] },
    { "id": 17, "tasks": ["22.2", "24.1", "24.2"] },
    { "id": 18, "tasks": ["24.3", "25.1", "25.2"] },
    { "id": 19, "tasks": ["25.3", "25.4", "26.1", "26.2"] },
    { "id": 20, "tasks": ["26.3", "27.1", "27.2"] },
    { "id": 21, "tasks": ["27.3", "27.4", "28.1"] },
    { "id": 22, "tasks": ["28.2", "29.1"] },
    { "id": 23, "tasks": ["29.2", "30.1"] },
    { "id": 24, "tasks": ["30.2", "32.1", "32.2", "32.3", "32.4"] },
    { "id": 25, "tasks": ["32.5", "32.6", "33.1"] },
    { "id": 26, "tasks": ["33.2", "34.1", "34.2"] },
    { "id": 27, "tasks": ["34.3"] }
  ]
}
```
