package com.itsa.crm.transaction_service.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lightweight health endpoints for load balancers and legacy clients.
 */
@RestController
public class HealthController {
	/**
	 * Primary health endpoint used by current clients.
	 */
	@GetMapping("/health")
	public Map<String, String> rootHealth() {
		return Map.of("status", "ok", "service", "transaction");
	}

	// Deprecated (but contract-supported)
	/**
	 * Legacy v1 health endpoint maintained for backward compatibility.
	 */
	@GetMapping("/api/v1/health")
	public ResponseEntity<Void> healthV1() {
		return ResponseEntity.ok().build();
	}

	// /api/v1/agents/health is not part of transaction-service.
}


