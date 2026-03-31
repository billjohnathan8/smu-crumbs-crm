package com.scroogebank.crm.user_service.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.scroogebank.crm.user_service.api.ErrorResponse;
import com.scroogebank.crm.user_service.security.ForbiddenException;
import com.scroogebank.crm.user_service.security.JwtValidationException;
import com.scroogebank.crm.user_service.security.UnauthorizedException;
import com.scroogebank.crm.user_service.web.RequestIdFilter;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Verifies exception-to-response mappings for {@link ApiExceptionHandler}.
 */
class ApiExceptionHandlerTest {
	private MockMvc buildMockMvc(boolean isProd) {
		return MockMvcBuilders.standaloneSetup(new StubController())
			.setControllerAdvice(new ApiExceptionHandler(isProd))
			.addFilters((request, response, chain) -> {
				request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, "req_123");
				chain.doFilter(request, response);
			})
			.build();
	}

	@Test
	void notFoundAndConflictMapCorrectly() throws Exception {
		MockMvc mockMvc = buildMockMvc(false);

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
		MockMvc mockMvc = buildMockMvc(false);

		mockMvc.perform(get("/unauthorized"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.error").value("unauthorized"));

		mockMvc.perform(get("/jwt"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.error").value("unauthorized"));

		mockMvc.perform(get("/forbidden"))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.error").value("forbidden"))
			.andExpect(jsonPath("$.message").value("forbidden"));

		mockMvc.perform(get("/bad-request"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void internalExceptionMapsTo500() throws Exception {
		MockMvc mockMvc = buildMockMvc(false);

		mockMvc.perform(get("/boom"))
			.andExpect(status().isInternalServerError())
			.andExpect(jsonPath("$.error").value("internal_error"));
	}

	@Test
	void validationError_inProdMode_returnsGenericMessage() {
		MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
		BindingResult bindingResult = mock(BindingResult.class);
		FieldError fieldError = new FieldError("obj", "firstName", "size must be between 2 and 50");
		when(ex.getBindingResult()).thenReturn(bindingResult);
		when(bindingResult.getFieldErrors()).thenReturn(List.of(fieldError));

		MockHttpServletRequest request = new MockHttpServletRequest();
		ApiExceptionHandler handler = new ApiExceptionHandler(true);

		ResponseEntity<ErrorResponse> response = handler.handleValidation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).isEqualTo("Validation failed");
		assertThat(response.getBody().message()).doesNotContain("firstName");
	}

	@Test
	void validationError_inDevMode_returnsFieldDetails() {
		MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
		BindingResult bindingResult = mock(BindingResult.class);
		FieldError fieldError = new FieldError("obj", "firstName", "size must be between 2 and 50");
		when(ex.getBindingResult()).thenReturn(bindingResult);
		when(bindingResult.getFieldErrors()).thenReturn(List.of(fieldError));

		MockHttpServletRequest request = new MockHttpServletRequest();
		ApiExceptionHandler handler = new ApiExceptionHandler(false);

		ResponseEntity<ErrorResponse> response = handler.handleValidation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).contains("firstName");
	}

	@Test
	void constraintViolation_inProdMode_returnsGenericMessage() {
		ConstraintViolationException ex = mock(ConstraintViolationException.class);
		when(ex.getMessage()).thenReturn("userId: must match pattern");

		MockHttpServletRequest request = new MockHttpServletRequest();
		ApiExceptionHandler handler = new ApiExceptionHandler(true);

		ResponseEntity<ErrorResponse> response = handler.handleConstraintViolation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).isEqualTo("Validation failed");
	}

	@Test
	void constraintViolation_inDevMode_returnsDetails() {
		ConstraintViolationException ex = mock(ConstraintViolationException.class);
		when(ex.getMessage()).thenReturn("userId: must match pattern");

		MockHttpServletRequest request = new MockHttpServletRequest();
		ApiExceptionHandler handler = new ApiExceptionHandler(false);

		ResponseEntity<ErrorResponse> response = handler.handleConstraintViolation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).contains("userId");
	}

	@RestController
	static class StubController {
		@GetMapping("/not-found")
		public ResponseEntity<Void> notFound() {
			throw new UserNotFoundException("usr_404");
		}

		@GetMapping("/conflict")
		public ResponseEntity<Void> conflict() {
			throw new DuplicateUserException("exists");
		}

		@GetMapping("/unauthorized")
		public ResponseEntity<Void> unauthorized() {
			throw new UnauthorizedException("missing_bearer_token");
		}

		@GetMapping("/jwt")
		public ResponseEntity<Void> jwt() {
			throw new JwtValidationException("invalid_signature");
		}

		@GetMapping("/forbidden")
		public ResponseEntity<Void> forbidden() {
			throw new ForbiddenException("forbidden");
		}

		@GetMapping("/bad-request")
		public ResponseEntity<Void> badRequest() {
			throw new IllegalArgumentException("bad");
		}

		@GetMapping("/boom")
		public ResponseEntity<Void> boom() {
			throw new RuntimeException("boom");
		}
	}

}
