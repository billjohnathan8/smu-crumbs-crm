package com.itsa.crm.transactions_service.exception;

import com.itsa.crm.transactions_service.api.ErrorResponse;
import com.itsa.crm.transactions_service.security.ForbiddenException;
import com.itsa.crm.transactions_service.security.JwtValidationException;
import com.itsa.crm.transactions_service.security.UnauthorizedException;
import com.itsa.crm.transactions_service.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps domain and validation exceptions to consistent API error responses.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
	/**
	 * Handles missing transaction or import batch lookups.
	 */
	@ExceptionHandler({TransactionNotFoundException.class, ImportBatchNotFoundException.class})
	public ResponseEntity<ErrorResponse> handleNotFound(HttpServletRequest request, RuntimeException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(request, "not_found", ex.getMessage()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	/**
	 * Handles bean validation errors for request bodies.
	 */
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
	/**
	 * Handles bean validation errors for request parameters.
	 */
	public ResponseEntity<ErrorResponse> handleConstraintViolation(HttpServletRequest request, ConstraintViolationException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", ex.getMessage()));
	}

	@ExceptionHandler({UnauthorizedException.class, JwtValidationException.class})
	/**
	 * Handles authentication failures or invalid JWTs.
	 */
	public ResponseEntity<ErrorResponse> handleUnauthorized(HttpServletRequest request, RuntimeException _ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error(request, "unauthorized", "Unauthorized"));
	}

	@ExceptionHandler(ForbiddenException.class)
	/**
	 * Handles authorization failures.
	 */
	public ResponseEntity<ErrorResponse> handleForbidden(HttpServletRequest request, ForbiddenException _ex) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error(request, "forbidden", "Forbidden"));
	}

	@ExceptionHandler(IllegalArgumentException.class)
	/**
	 * Handles malformed requests that fail lightweight validation.
	 */
	public ResponseEntity<ErrorResponse> handleBadRequest(HttpServletRequest request, IllegalArgumentException _ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", "Invalid request"));
	}

	@ExceptionHandler(Exception.class)
	/**
	 * Catch-all handler for unexpected server errors.
	 */
	public ResponseEntity<ErrorResponse> handleInternal(HttpServletRequest request, Exception _ex) {
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error(request, "internal_error", "Internal error"));
	}

	private static ErrorResponse error(HttpServletRequest request, String error, String message) {
		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		return new ErrorResponse(error, message, requestId == null ? null : requestId.toString());
	}
}


