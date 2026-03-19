package com.scroogebank.crm.userservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.scroogebank.crm.userservice.dto.TokenResponse;
import com.scroogebank.crm.userservice.exception.ApiExceptionHandler;
import com.scroogebank.crm.userservice.service.AuthService;

import tools.jackson.databind.ObjectMapper;

/**
 * Web-layer tests for {@link AuthController}.
 */
class AuthControllerTest {
	private MockMvc mockMvc;
	private AuthService authService;
	private ObjectMapper objectMapper;

	@BeforeEach
	@SuppressWarnings("unused")
	void setUp() {
		authService = mock(AuthService.class);
		objectMapper = new ObjectMapper();
		mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(authService))
			.setControllerAdvice(new ApiExceptionHandler())
			.build();
	}

	@Test
	void login_returnsTokenResponse() throws Exception {
		when(authService.login(any())).thenReturn(new TokenResponse("access_1", "refresh_1", 3600, "Bearer"));

		mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(java.util.Map.of(
					"email", "ava@example.com",
					"password", "secret123"
				))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken").value("access_1"))
			.andExpect(jsonPath("$.tokenType").value("Bearer"));
	}

	@Test
	void refresh_returnsTokenResponse() throws Exception {
		when(authService.refresh(any())).thenReturn(new TokenResponse("access_2", "refresh_2", 3600, "Bearer"));

		mockMvc.perform(post("/api/auth/refresh")
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(java.util.Map.of("refreshToken", "refresh_1"))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken").value("access_2"))
			.andExpect(jsonPath("$.refreshToken").value("refresh_2"));
	}
}
