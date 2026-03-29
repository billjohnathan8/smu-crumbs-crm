package com.scroogebank.crm.client_service.exception;

import com.scroogebank.crm.client_service.api.ErrorResponse;
import com.scroogebank.crm.client_service.security.JwtValidationException;
import com.scroogebank.crm.client_service.security.UnauthorizedException;
import com.scroogebank.crm.client_service.web.RequestIdFilter;
import jakarta.validation.ConstraintViolationException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Maps domain and validation exceptions to API error responses.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(ClientNotFoundException.class)
	public ResponseEntity<ErrorResponse> handleNotFound(HttpServletRequest request, ClientNotFoundException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(request, "not_found", ex.getMessage()));
	}

	@ExceptionHandler(AccountNotFoundException.class)
	public ResponseEntity<ErrorResponse> handleAccountNotFound(HttpServletRequest request, AccountNotFoundException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(request, "not_found", ex.getMessage()));
	}

	@ExceptionHandler(DuplicateClientException.class)
	public ResponseEntity<ErrorResponse> handleDuplicate(HttpServletRequest request, DuplicateClientException ex) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(error(request, "conflict", ex.getMessage()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ErrorResponse> handleValidation(HttpServletRequest request, MethodArgumentNotValidException ex) {
		String message = ex.getBindingResult().getFieldErrors().stream()
			.map(err -> err.getField() + ": " + (err.getDefaultMessage() == null ? "invalid" : err.getDefaultMessage()))
			.collect(Collectors.joining("; "));
		if (message.isBlank()) {
			message = "Validation failed";
		}
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", message));
	}

	@ExceptionHandler(ConstraintViolationException.class)
	public ResponseEntity<ErrorResponse> handleConstraintViolation(HttpServletRequest request, ConstraintViolationException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", ex.getMessage()));
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpServletRequest request, HttpMessageNotReadableException _ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", "Invalid request body"));
	}

	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	public ResponseEntity<ErrorResponse> handleTypeMismatch(HttpServletRequest request, MethodArgumentTypeMismatchException ex) {
		String message = "Invalid request parameter";
		if (ex.getName() != null && !ex.getName().isBlank()) {
			message += ": " + ex.getName();
		}
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", message));
	}

	@ExceptionHandler({UnauthorizedException.class, JwtValidationException.class})
	public ResponseEntity<ErrorResponse> handleUnauthorized(HttpServletRequest request, RuntimeException ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error(request, "unauthorized", "Unauthorized"));
	}

	@ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
	public ResponseEntity<ErrorResponse> handleForbidden(HttpServletRequest request, org.springframework.security.access.AccessDeniedException ex) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error(request, "forbidden", ex.getMessage()));
	}

	@ExceptionHandler(IllegalStateException.class)
	public ResponseEntity<ErrorResponse> handleIllegalState(HttpServletRequest request, IllegalStateException ex) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(error(request, "conflict", ex.getMessage()));
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<ErrorResponse> handleBadRequest(HttpServletRequest request, IllegalArgumentException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", "Invalid request"));
	}

	@ExceptionHandler(SnsPublishException.class)
	public ResponseEntity<ErrorResponse> handleSnsPublishFailure(HttpServletRequest request, SnsPublishException _ex) {
		return ResponseEntity
			.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(error(request, "service_unavailable", "Verification email dispatch unavailable. Client was not created."));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleInternal(HttpServletRequest request, Exception ex) {
		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		log.error("Unhandled exception (requestId={})", requestId == null ? "unknown" : requestId.toString(), ex);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error(request, "internal_error", "Internal error"));
	}

	/**
	 * Builds a standard error response and attaches the request id when available.
	 *
	 * @param request HTTP request
	 * @param error short error code
	 * @param message human-readable message
	 * @return error response payload
	 */
	private static ErrorResponse error(HttpServletRequest request, String error, String message) {
		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		return new ErrorResponse(error, message, requestId == null ? null : requestId.toString());
	}
}
