package com.scroogebank.crm.user_service.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Verifies that test-only password reset endpoints are blocked outside local/test profiles.
 */
@SpringBootTest
@ActiveProfiles("prod")
class PasswordResetTestEndpointNonTestProfileIT {

	@Autowired
	private WebApplicationContext context;

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
	}

	@Test
	void latestTokenEndpoint_isForbiddenOutsideLocalAndTestProfiles() throws Exception {
		mockMvc.perform(get("/api/test/password-reset/latest-token").queryParam("email", "root@example.com"))
			.andExpect(status().is4xxClientError());
	}
}
