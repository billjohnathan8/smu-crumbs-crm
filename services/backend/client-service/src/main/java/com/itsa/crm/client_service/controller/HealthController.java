package com.itsa.crm.client_service.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health-check endpoints for liveness probes and routing compatibility.
 */
@RestController
public class HealthController {
	/**
	 * Basic service health indicator.
	 *
	 * @return health map with status and service name
	 */
	@GetMapping("/health")
	public Map<String, String> rootHealth() {
		return Map.of("status", "ok", "service", "client-service");
	}

	/**
	 * Legacy v1 health endpoint used by upstream checks.
	 *
	 * @return JSON payload string
	 */
	@GetMapping("/api/v1/health")
	public String health() {
		return "{ \"status\": \"ok\" }";
	}

	/**
	 * Client-specific health endpoint for backward compatibility.
	 *
	 * @return JSON payload string
	 */
	@GetMapping("/api/v1/clients/health")
	public String clientsHealth() {
		return "{ \"status\": \"ok\" }";
	}
}
