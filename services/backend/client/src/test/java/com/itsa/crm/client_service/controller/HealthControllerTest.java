package com.itsa.crm.client_service.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web MVC tests for health endpoints.
 */
class HealthControllerTest {
	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.standaloneSetup(new HealthController()).build();
	}

	@Test
	void rootHealth_returnsOk() throws Exception {
		mockMvc.perform(get("/health"))
			.andExpect(status().isOk())
			.andExpect(content().json("{\"status\":\"ok\",\"service\":\"client\"}"));
	}

	// GET /api/v1/health (deprecated but supported)
	@Test
	void health_returnsOk() throws Exception {
		mockMvc.perform(get("/api/v1/health"))
			.andExpect(status().isOk())
			.andExpect(content().json("{\"status\":\"ok\"}"));
	}

	@Test
	void clientsHealth_returnsOk() throws Exception {
		mockMvc.perform(get("/api/v1/clients/health"))
			.andExpect(status().isOk())
			.andExpect(content().json("{\"status\":\"ok\"}"));
	}
}
