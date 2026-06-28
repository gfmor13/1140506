const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function generateCircuit(inputConfig) {
  const response = await fetch(`${API_BASE_URL}/generate-circuit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputConfig),
  });
  const json = await response.json();

  return {
    json,
    requestId: response.headers.get("X-Request-Id"),
    engineTimeMs: response.headers.get("X-Engine-Time-Ms"),
    engineLatencyMs: response.headers.get("X-Engine-Latency-Ms"),
    httpStatus: response.status,
  };
}

export async function getHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  const json = await response.json();
  return {
    json,
    httpStatus: response.status,
  };
}
