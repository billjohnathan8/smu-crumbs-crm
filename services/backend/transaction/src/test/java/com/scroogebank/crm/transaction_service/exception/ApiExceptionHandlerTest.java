package com.scroogebank.crm.transaction_service.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.scroogebank.crm.transaction_service.api.ErrorResponse;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.security.JwtValidationException;
import com.scroogebank.crm.transaction_service.security.UnauthorizedException;
import com.scroogebank.crm.transaction_service.web.RequestIdFilter;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Validates exception-to-response mappings in ApiExceptionHandler.
 */
class ApiExceptionHandlerTest {
	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.standaloneSetup(new StubController())
			.setControllerAdvice(new ApiExceptionHandler(false))
			.addFilters((request, response, chain) -> {
				request.setAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE, "req_123");
				chain.doFilter(request, response);
			})
			.build();
	}

	@Test
	void unauthorized_andJwtValidation_mapTo401() throws Exception {
		mockMvc.perform(get("/unauthorized"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.error").value("unauthorized"));

		mockMvc.perform(get("/jwt"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.error").value("unauthorized"));
	}

	@Test
	void forbidden_mapsTo403() throws Exception {
		mockMvc.perform(get("/forbidden"))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.error").value("forbidden"));
	}

	@Test
	void notFound_mapsTo404_andCarriesRequestId() throws Exception {
		mockMvc.perform(get("/not-found"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.error").value("not_found"))
			.andExpect(jsonPath("$.requestId").value("req_123"));
	}

	@Test
	void illegalArgument_mapsTo400() throws Exception {
		mockMvc.perform(get("/bad-request"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void typeMismatch_mapsTo400() throws Exception {
		mockMvc.perform(get("/type-mismatch").queryParam("status", "invalid"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void unreadableBody_mapsTo400() throws Exception {
		mockMvc.perform(post("/body")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"clientId\":"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.error").value("validation_error"));
	}

	@Test
	void genericException_mapsTo500() throws Exception {
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
	private static class StubController {
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

		@GetMapping("/not-found")
		ResponseEntity<Void> notFound() {
			throw new TransactionNotFoundException("txn_404");
		}

		@GetMapping("/bad-request")
		ResponseEntity<Void> badRequest() {
			throw new IllegalArgumentException("bad");
		}

		@GetMapping("/type-mismatch")
		ResponseEntity<Void> typeMismatch(@RequestParam TransactionStatus status) {
			return ResponseEntity.ok().build();
		}

		@PostMapping("/body")
		ResponseEntity<Void> body(@RequestBody BodyPayload payload) {
			return ResponseEntity.ok().build();
		}

		@GetMapping("/boom")
		ResponseEntity<Void> boom() {
			throw new RuntimeException("boom");
		}
	}

	private record BodyPayload(
		String clientId
	) {}
}

