package com.scroogebank.crm.agentservice.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.scroogebank.crm.agentservice.security.ForbiddenException;
import com.scroogebank.crm.agentservice.security.JwtValidationException;
import com.scroogebank.crm.agentservice.security.UnauthorizedException;
import com.scroogebank.crm.agentservice.web.RequestIdFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Verifies exception-to-response mappings for {@link ApiExceptionHandler}.
 */
class ApiExceptionHandlerTest {
	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.standaloneSetup(new StubController())
			.setControllerAdvice(new ApiExceptionHandler())
			.addFilters((request, response, chain) -> {
				request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, "req_123");
				chain.doFilter(request, response);
			})
			.build();
	}

	@Test
	void notFoundAndConflictMapCorrectly() throws Exception {
		mockMvc.perform(get("/not-found"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.error").value("not_found"))
			.andExpect(jsonPath("$.requestId").value("req_123"));

		mockMvc.perform(get("/conflict"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.error").value("conflict"));
	}

	@Test
	void unauthorizedForbiddenAndBadRequestMapCorrectly() throws Exception {
		mockMvc.perform(get("/unauthorized"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.error").value("unauthorized"));

		mockMvc.perform(get("/jwt"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.error").value("unauthorized"));

		mockMvc.perform(get("/forbidden"))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.error").value("forbidden"));

		mockMvc.perform(get("/bad-request"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void internalExceptionMapsTo500() throws Exception {
		mockMvc.perform(get("/boom"))
			.andExpect(status().isInternalServerError())
			.andExpect(jsonPath("$.error").value("internal_error"));
	}

	@RestController
	private static class StubController {
		@GetMapping("/not-found")
		ResponseEntity<Void> notFound() {
			throw new UserNotFoundException("usr_404");
		}

		@GetMapping("/conflict")
		ResponseEntity<Void> conflict() {
			throw new DuplicateUserException("exists");
		}

		@GetMapping("/unauthorized")
		ResponseEntity<Void> unauthorized() {
			throw new UnauthorizedException("missing_bearer_token");
		}

		@GetMapping("/jwt")
		ResponseEntity<Void> jwt() {
			throw new JwtValidationException("invalid_signature");
		}

		@GetMapping("/forbidden")
		ResponseEntity<Void> forbidden() {
			throw new ForbiddenException("forbidden");
		}

		@GetMapping("/bad-request")
		ResponseEntity<Void> badRequest() {
			throw new IllegalArgumentException("bad");
		}

		@GetMapping("/boom")
		ResponseEntity<Void> boom() {
			throw new RuntimeException("boom");
		}
	}
}
