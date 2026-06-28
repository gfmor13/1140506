# Render Deploy Checklist

## Required Service Type

- Docker Web Service

## Required Environment Variables

```txt
NODE_ENV=production
FSM_SOLVER_PATH=engine/fsm_solver
VITE_API_BASE_URL=/api
```

## Health Check

```txt
/api/health
```

## Do Not Set

```txt
PORT=3001
```

## Expected Build Behavior

- Docker image uses Node 20 bookworm.
- Docker installs `g++`.
- Docker runs `npm ci`.
- Docker runs `npm run build`.
- Docker runs `npm run build:solver`.
- Docker runs `npm run test:solver -- --json`.
- Production starts with `npm start`.
- Express listens on `0.0.0.0`.
- Render provides `PORT` automatically.

## Required Post-Deploy Checks

- GET `/api/health`
- POST `/api/generate-circuit` with State Table fixture
- POST `/api/generate-circuit` with Timing Trace fixture
- Browser homepage opens
- State Table compile works
- Timing Trace compile works
- FF Equations tab works
- K-Map tab works
- State Diagram tab works
- Circuit Diagram tab works
- Timing Diagram tab works
- Debug trigger `0951224` works
- Timing Trace has no CLK input
- General UI does not show raw `Q_A#`

## Known Production Limitations

- 1 input / 1 output
- `state_count <= 8`
- Timing Trace inference is deterministic baseline, not guaranteed minimal FSM inference
- Boolean minimization is K-Map grouping level

