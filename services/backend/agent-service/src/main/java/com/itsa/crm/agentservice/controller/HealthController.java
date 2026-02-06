package com.itsa.crm.agentservice.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lightweight health endpoints for service monitoring.
 */
@RestController
public class HealthController {
	/**
	 * Primary health endpoint.
	 *
	 * @return health status map
	 */
	@GetMapping("/health")
	public Map<String, String> rootHealth() {
		return Map.of("status", "ok", "service", "agent-service");
	}

	// Deprecated (but contract-supported)
	/**
	 * Legacy v1 health endpoint (kept for backward compatibility).
	 *
	 * @return HTTP 200 with empty body
	 */
	@GetMapping("/api/v1/health")
	public ResponseEntity<Void> healthV1() {
		return ResponseEntity.ok().build();
	}

	// Deprecated (but contract-supported)
	/**
	 * Legacy v1 agents health endpoint (kept for backward compatibility).
	 *
	 * @return HTTP 200 with empty body
	 */
	@GetMapping("/api/v1/agents/health")
	public ResponseEntity<Void> agentsHealthV1() {
		return ResponseEntity.ok().build();
	}
}
