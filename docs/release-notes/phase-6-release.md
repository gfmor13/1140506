# 1140506 EDA Release Candidate

## Completed Features

- State Table input
- Timing Trace baseline inference
- Import JSON
- D / T / JK / SR Flip-Flop excitation
- FF Equations
- K-Map
- State Diagram
- Circuit Diagram
- Timing Diagram
- Debug Panel
- Render Docker deployment configuration

## Test Summary

- Solver smoke: 95 passed / 0 failed
- API smoke: pass
- Browser smoke: pass
- Production local: pass
- Dist audit: pass

## Known Limitations

- 1 input / 1 output
- `state_count <= 8`
- Timing Trace inference is a deterministic baseline, not guaranteed minimal FSM inference
- Boolean minimization is K-Map grouping level, not an industrial-strength optimizer

## Deployment Notes

- Runtime: Render Docker Web Service
- Health check path: `/api/health`
- Required env:
  - `NODE_ENV=production`
  - `FSM_SOLVER_PATH=engine/fsm_solver`
  - `VITE_API_BASE_URL=/api`
- Do not set `PORT=3001`; Render provides `PORT` at runtime.
- Linux production solver path is `engine/fsm_solver`, not `engine/fsm_solver.exe`.
