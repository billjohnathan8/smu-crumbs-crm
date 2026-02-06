package com.itsa.crm.transactions_service.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
	@GetMapping("/health")
	public Map<String, String> rootHealth() {
		return Map.of("status", "ok", "service", "transaction-service");
	}

	// Deprecated (but contract-supported)
	@GetMapping("/api/v1/health")
	public ResponseEntity<Void> healthV1() {
		return ResponseEntity.ok().build();
	}

	// /api/v1/users/health is not part of transaction-service.
}

