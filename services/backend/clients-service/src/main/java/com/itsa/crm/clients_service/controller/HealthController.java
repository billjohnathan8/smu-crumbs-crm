package com.itsa.crm.clients_service.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
	@GetMapping("/health")
	public Map<String, String> rootHealth() {
		return Map.of("status", "ok", "service", "clients-service");
	}

	@GetMapping("/api/v1/health")
	public String health() {
		return "{ \"status\": \"ok\" }";
	}

	@GetMapping("/api/v1/clients/health")
	public String clientsHealth() {
		return "{ \"status\": \"ok\" }";
	}
}
