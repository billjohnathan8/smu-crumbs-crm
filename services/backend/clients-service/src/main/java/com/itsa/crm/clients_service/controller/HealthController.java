package com.itsa.crm.clients_service.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class HealthController {
	@GetMapping("/health")
	public String health() {
		return "{ \"status\": \"ok\" }";
	}

	@GetMapping("/clients/health")
	public String clientsHealth() {
		return "{ \"status\": \"ok\" }";
	}
}
