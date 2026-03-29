package com.scroogebank.crm.client_service.exception;

import com.scroogebank.crm.client_service.api.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindingResult;
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
		ApiExceptionHandler handler = new ApiExceptionHandler(false);
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
		ApiExceptionHandler handler = new ApiExceptionHandler(false);
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
	void validationError_inProdMode_returnsGenericMessage() {
		MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
		BindingResult bindingResult = mock(BindingResult.class);
		FieldError fieldError = new FieldError("obj", "firstName", "size must be between 2 and 50");
		when(ex.getBindingResult()).thenReturn(bindingResult);
		when(bindingResult.getFieldErrors()).thenReturn(List.of(fieldError));

		MockHttpServletRequest request = new MockHttpServletRequest();
		ApiExceptionHandler handler = new ApiExceptionHandler(true);

		var response = handler.handleValidation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).isEqualTo("Validation failed");
		assertThat(response.getBody().message()).doesNotContain("firstName");
	}

	@Test
	void constraintViolation_inProdMode_returnsGenericMessage() {
		ConstraintViolationException ex = mock(ConstraintViolationException.class);
		when(ex.getMessage()).thenReturn("userId: must match pattern");

		MockHttpServletRequest request = new MockHttpServletRequest();
		ApiExceptionHandler handler = new ApiExceptionHandler(true);

		var response = handler.handleConstraintViolation(request, ex);

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

		var response = handler.handleConstraintViolation(request, ex);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(response.getBody()).isNotNull();
		assertThat(response.getBody().message()).contains("userId");
	}

	@Test
	void handleUnreadableBody_returnsValidationError() {
		ApiExceptionHandler handler = new ApiExceptionHandler(false);
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
