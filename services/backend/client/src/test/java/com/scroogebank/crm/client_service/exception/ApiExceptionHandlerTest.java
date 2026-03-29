package com.scroogebank.crm.client_service.exception;

import com.scroogebank.crm.client_service.api.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ApiExceptionHandler} error mapping.
 */
class ApiExceptionHandlerTest {
	static class DummyController {
		void create(String body) {}
	}

	@Test
	void handleValidation_buildsFieldErrorMessageAndIncludesRequestId() throws Exception {
		ApiExceptionHandler handler = new ApiExceptionHandler();
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getAttribute("requestId")).thenReturn("req-1");

		BeanPropertyBindingResult bindingResult = new BeanPropertyBindingResult(new Object(), "body");
		bindingResult.addError(new FieldError("body", "firstName", null, false, null, null, null));
		bindingResult.addError(new FieldError("body", "emailAddress", "must be a well-formed email address"));

		MethodParameter methodParameter = new MethodParameter(DummyController.class.getDeclaredMethod("create", String.class), 0);
		MethodArgumentNotValidException ex = new MethodArgumentNotValidException(methodParameter, bindingResult);

		var response = handler.handleValidation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		ErrorResponse body = response.getBody();
		assertThat(body).isNotNull();
		assertThat(body.error()).isEqualTo("validation_error");
		assertThat(body.requestId()).isEqualTo("req-1");
		assertThat(body.message()).contains("firstName: invalid");
		assertThat(body.message()).contains("emailAddress: must be a well-formed email address");
	}

	@Test
	void handleValidation_whenNoFieldErrors_usesFallbackMessageAndNullRequestId() throws Exception {
		ApiExceptionHandler handler = new ApiExceptionHandler();
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getAttribute("requestId")).thenReturn(null);

		BeanPropertyBindingResult bindingResult = new BeanPropertyBindingResult(new Object(), "body");
		MethodParameter methodParameter = new MethodParameter(DummyController.class.getDeclaredMethod("create", String.class), 0);
		MethodArgumentNotValidException ex = new MethodArgumentNotValidException(methodParameter, bindingResult);

		var response = handler.handleValidation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).isEqualTo("Validation failed");
		assertThat(response.getBody().requestId()).isNull();
	}

	@Test
	void handleUnreadableBody_returnsValidationError() {
		ApiExceptionHandler handler = new ApiExceptionHandler();
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getAttribute("requestId")).thenReturn("req-parse");

		var response = handler.handleUnreadableBody(
			request,
			new HttpMessageNotReadableException("bad-json", new MockHttpInputMessage(new byte[0]))
		);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().error()).isEqualTo("validation_error");
		assertThat(response.getBody().message()).isEqualTo("Invalid request body");
		assertThat(response.getBody().requestId()).isEqualTo("req-parse");
	}
}
